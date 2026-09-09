import {
  ConflictException,
  Injectable,
  Inject,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { firstValueFrom } from 'rxjs';
import { ClientsService } from '../clients/clients.service';
import {
  PaginationRes,
  PaginationService,
} from '../common/pagination/pagination.service';
import { InvoiceEvents } from '../common/events';
import { Currency, InvoiceStatus } from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import type {
  InvoiceModel as Invoice,
  InvoiceItemModel as InvoiceItem,
} from '../generated/prisma/models';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CacheTimer } from '../common/cache-timer';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices-query.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { Decimal } from '@prisma/client/runtime/client';
import { ConversionRate } from './dto/conversion-date.dto';
import { ExchangeRatesEntity } from './entities/exchange-rates.entity';

const DEFAULT_INVOICE_PREFIX = 'INV-';
const DEFAULT_INVOICE_START = 1001;
const MAX_NUMBER_ATTEMPTS = 5;

export type InvoiceWithItems = Invoice & {
  items: InvoiceItem[];
  project: { name: string } | null;
};

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly clients: ClientsService,
    private readonly projects: ProjectsService,
    private readonly events: EventEmitter2,
    @Inject(CACHE_MANAGER) private cacheService: Cache,
    private readonly httpService: HttpService,
  ) {}

  async create(
    ownerId: string,
    dto: CreateInvoiceDto,
  ): Promise<InvoiceWithItems> {
    const client = await this.clients.findOne(ownerId, dto.clientId);
    if (dto.projectId) await this.projects.findOne(ownerId, dto.projectId);
    const { items, number, ...data } = dto;

    // An explicit number is trusted as-is - only the per-workspace unique
    // constraint can reject it, so a single attempt is enough.
    if (number) {
      try {
        return await this.createInvoice({
          ...data,
          number,
          workspaceId: client.workspaceId,
          items: { create: items },
        });
      } catch (err) {
        if (this.isDuplicateNumber(err)) {
          throw new ConflictException('Invoice number already exists');
        }
        throw err;
      }
    }

    // Auto-generated numbers are scoped to the workspace's sequence, which
    // can race with another concurrent create() against the same workspace.
    // Retry with a freshly computed number on a unique-constraint conflict
    // rather than surfacing a raw 500 to the caller.
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_NUMBER_ATTEMPTS; attempt++) {
      const generated = await this.nextNumber(client.workspaceId);
      try {
        return await this.createInvoice({
          ...data,
          number: generated,
          workspaceId: client.workspaceId,
          items: { create: items },
        });
      } catch (err) {
        if (!this.isDuplicateNumber(err)) throw err;
        lastError = err;
      }
    }
    throw new ConflictException(
      'Could not generate a unique invoice number, please retry',
      { cause: lastError },
    );
  }

  private createInvoice(
    data: Prisma.InvoiceCreateArgs['data'],
  ): Promise<InvoiceWithItems> {
    return this.prisma.invoice.create({
      data,
      include: { items: true, project: { select: { name: true } } },
    });
  }

  private isDuplicateNumber(err: unknown): boolean {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    );
  }

  findAll(
    ownerId: string,
    query: ListInvoicesQueryDto,
    baseUrl: string,
  ): Promise<PaginationRes<InvoiceWithItems>> {
    const { cursor, take, clientId, projectId, status } = query;
    return this.pagination.paginate<InvoiceWithItems>(
      this.prisma.invoice,
      {
        where: {
          client: { workspace: { ownerId } },
          ...(clientId ? { clientId } : {}),
          ...(projectId ? { projectId } : {}),
          ...(status ? { status } : {}),
        },
        include: { items: true, project: { select: { name: true } } },
      },
      {
        cursor,
        take,
        orderBy: { createdAt: 'desc' },
        baseUrl,
        includeCount: true,
      },
    );
  }

  async findOne(ownerId: string, id: string): Promise<InvoiceWithItems> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, client: { workspace: { ownerId } } },
      include: { items: true, project: { select: { name: true } } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateInvoiceDto,
  ): Promise<InvoiceWithItems> {
    await this.findOne(ownerId, id);
    if (dto.projectId) await this.projects.findOne(ownerId, dto.projectId);
    const { items, ...data } = dto;
    try {
      return await this.prisma.invoice.update({
        where: { id },
        data: {
          ...data,
          ...(items ? { items: { deleteMany: {}, create: items } } : {}),
        },
        include: { items: true, project: { select: { name: true } } },
      });
    } catch (err) {
      if (this.isDuplicateNumber(err)) {
        throw new ConflictException('Invoice number already exists');
      }
      throw err;
    }
  }

  async remove(ownerId: string, id: string): Promise<InvoiceWithItems> {
    const invoice = await this.findOne(ownerId, id);
    await this.prisma.invoice.delete({ where: { id } });
    return invoice;
  }

  /** Marks the invoice sent and hands it to the notification pipeline. */
  async send(ownerId: string, id: string): Promise<InvoiceWithItems> {
    await this.findOne(ownerId, id);
    const invoice = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.sent },
      include: {
        items: true,
        client: true,
        project: { select: { name: true } },
      },
    });
    const { client, ...rest } = invoice;
    this.events.emit(InvoiceEvents.SENT, {
      invoice: rest,
      client,
    });
    return rest;
  }

  /**
   * Next number in the workspace's own sequence, using its custom
   * invoicePrefix when set (falling back to "INV-").
   *
   */
  private async nextNumber(workspaceId: string): Promise<string> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { invoicePrefix: true },
    });
    const prefix = workspace?.invoicePrefix?.trim() || DEFAULT_INVOICE_PREFIX;

    const existing = await this.prisma.invoice.findMany({
      where: { number: { startsWith: prefix }, workspaceId },
      select: { number: true },
    });
    const latest = existing.reduce((max, { number }) => {
      const n = Number(number.slice(prefix.length));
      return Number.isFinite(n) ? Math.max(max, n) : max;
    }, 0);
    return `${prefix}${latest > 0 ? latest + 1 : DEFAULT_INVOICE_START}`;
  }

  /**
   * Latest conversion rate between two currencies, cached for six hours.
   */
  async conversionRate(base: string, target: string): Promise<ConversionRate> {
    if (base === target) {
      return {
        base,
        target,
        mid: 1,
        unit: 1,
        timestamp: new Date().toISOString(),
      };
    }
    const cacheKey = `fx_${base}_${target}`;
    const cached = await this.cacheService.get<ConversionRate>(cacheKey);
    if (cached) return cached;
    try {
      const res = await firstValueFrom(
        this.httpService.get(
          `https://hexarate.paikama.co/api/rates/${base}/${target}/latest`,
        ),
      );
      const rate: ConversionRate = res.data.data;
      await this.cacheService.set(cacheKey, rate, CacheTimer.SIX_HOURS);
      return rate;
    } catch {
      throw new HttpException(
        { message: `Could not fetch the ${base}→${target} conversion rate` },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /** Convert an amount between currencies, rounded to 2 decimal places. */
  async convert(
    base: string,
    target: string,
    amount: Decimal | number,
  ): Promise<number> {
    const rate = await this.conversionRate(base, target);
    return Math.round(Number(amount) * rate.mid * 100) / 100;
  }

  convertToDollars(currencyCode: string, amount: Decimal): Promise<number> {
    return this.convert(currencyCode, Currency.USD, amount);
  }

  dollarRate(currencyCode: string): Promise<ConversionRate> {
    return this.conversionRate(currencyCode, Currency.USD);
  }

  async exchangeRates(
    ownerId: string,
    target?: Currency,
  ): Promise<ExchangeRatesEntity> {
    let resolved = target;
    if (!resolved) {
      const workspace = await this.prisma.workspace.findFirst({
        where: { ownerId },
        orderBy: { createdAt: 'asc' },
        select: { currency: true },
      });
      resolved = workspace?.currency ?? Currency.USD;
    }
    const entries = await Promise.all(
      Object.values(Currency).map(async (base) => {
        const rate = await this.conversionRate(base, resolved);
        return [base, rate.mid] as const;
      }),
    );
    return {
      target: resolved,
      rates: Object.fromEntries(entries) as Record<Currency, number>,
    };
  }
}
