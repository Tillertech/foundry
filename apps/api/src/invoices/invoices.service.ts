import {
  BadRequestException,
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
import type { ExpenseCategory } from '../generated/prisma/enums';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CacheTimer } from '../common/cache-timer';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import {
  CreateInvoiceDto,
  InvoiceLineItemDto,
} from './dto/create-invoice.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices-query.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { Decimal } from '@prisma/client/runtime/client';
import { ConversionRate } from './dto/conversion-date.dto';
import { ExchangeRatesEntity } from './entities/exchange-rates.entity';

const DEFAULT_INVOICE_PREFIX = 'INV-';
const DEFAULT_INVOICE_START = 1001;
const MAX_NUMBER_ATTEMPTS = 5;

export type InvoiceWithItems = Invoice & {
  items: (InvoiceItem & {
    expense: { vendor: string; category: ExpenseCategory; date: Date } | null;
  })[];
  project: { name: string } | null;
};

/** Shape every invoice read/write returns - lines carry the billed expense's summary. */
const INVOICE_INCLUDE = {
  items: {
    include: {
      expense: { select: { vendor: true, category: true, date: true } },
    },
  },
  project: { select: { name: true } },
} as const;

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
    if (dto.projectId) {
      await this.assertProjectForClient(ownerId, dto.projectId, client.id);
    }
    const { items: requested, number, ...data } = dto;
    const items = await this.resolveItems(ownerId, {
      clientId: client.id,
      currency: dto.currency ?? Currency.USD,
      items: requested,
    });

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
        this.rethrowConflict(err);
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
        if (this.conflictOn(err) !== 'number') this.rethrowConflict(err);
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
    return this.prisma.invoice.create({ data, include: INVOICE_INCLUDE });
  }

  /** The project must be the caller's and belong to the invoice's own client. */
  private async assertProjectForClient(
    ownerId: string,
    projectId: string,
    clientId: string,
  ): Promise<void> {
    const project = await this.projects.findOne(ownerId, projectId);
    if (project.clientId !== clientId) {
      throw new BadRequestException(
        "Project belongs to a different client than the invoice's",
      );
    }
  }

  /**
   * Which unique constraint a write tripped: the per-workspace invoice number,
   * or an expense already billed on another invoice (a concurrent attach that
   * slipped past resolveItems' check). null for anything else.
   */
  private conflictOn(err: unknown): 'number' | 'expense' | null {
    if (
      !(err instanceof Prisma.PrismaClientKnownRequestError) ||
      err.code !== 'P2002'
    ) {
      return null;
    }
    return JSON.stringify(err.meta ?? {}).includes('expenseId')
      ? 'expense'
      : 'number';
  }

  private rethrowConflict(err: unknown): never {
    switch (this.conflictOn(err)) {
      case 'number':
        throw new ConflictException('Invoice number already exists');
      case 'expense':
        throw new ConflictException(
          'One of the expenses was just billed on another invoice',
        );
      default:
        throw err;
    }
  }

  /**
   * Validates the lines that re-bill expenses and pins their charge to the
   * expense itself (1 x amount), so a client can't inflate or discount a
   * re-billed cost. An expense is billable here only if it is marked
   * billable, belongs to one of this client's projects, is in the invoice
   * currency, and isn't already on a different invoice.
   */
  private async resolveItems(
    ownerId: string,
    target: {
      clientId: string;
      currency: Currency;
      items: InvoiceLineItemDto[];
      /** The invoice being edited, whose own expense lines stay attachable. */
      invoiceId?: string;
    },
  ): Promise<Prisma.InvoiceItemCreateWithoutInvoiceInput[]> {
    const ids = target.items.flatMap((it) =>
      it.expenseId ? [it.expenseId] : [],
    );
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('An expense can only be billed once');
    }
    const expenses = ids.length
      ? await this.prisma.expense.findMany({
          where: {
            id: { in: ids },
            project: { client: { workspace: { ownerId } } },
          },
          include: {
            project: { select: { clientId: true } },
            invoiceItem: { select: { invoiceId: true } },
          },
        })
      : [];
    const byId = new Map(expenses.map((e) => [e.id, e]));

    return target.items.map(({ expenseId, ...line }) => {
      if (!expenseId) return line;
      const expense = byId.get(expenseId);
      if (!expense) throw new NotFoundException('Expense not found');
      if (!expense.billable) {
        throw new BadRequestException(
          `Expense from ${expense.vendor} is not marked billable`,
        );
      }
      if (expense.project?.clientId !== target.clientId) {
        throw new BadRequestException(
          `Expense from ${expense.vendor} belongs to a different client's project`,
        );
      }
      if (expense.currency !== target.currency) {
        throw new BadRequestException(
          `Expense from ${expense.vendor} is in ${expense.currency}, not the invoice currency ${target.currency}`,
        );
      }
      if (
        expense.invoiceItem &&
        expense.invoiceItem.invoiceId !== target.invoiceId
      ) {
        throw new ConflictException(
          `Expense from ${expense.vendor} is already billed on another invoice`,
        );
      }
      return {
        description: line.description,
        quantity: 1,
        rate: expense.amount,
        expense: { connect: { id: expenseId } },
      };
    });
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
        include: INVOICE_INCLUDE,
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
      include: INVOICE_INCLUDE,
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateInvoiceDto,
  ): Promise<InvoiceWithItems> {
    const existing = await this.findOne(ownerId, id);
    if (dto.projectId) {
      await this.assertProjectForClient(
        ownerId,
        dto.projectId,
        existing.clientId,
      );
    }
    const { items: requested, ...data } = dto;
    const currency = dto.currency ?? existing.currency;

    // Re-validate the expense lines whenever they or the currency change: a
    // currency switch with no new items would otherwise leave a USD expense
    // re-billed on a now-EUR invoice.
    const items =
      requested || currency !== existing.currency
        ? await this.resolveItems(ownerId, {
            clientId: existing.clientId,
            currency,
            invoiceId: id,
            items:
              requested ??
              existing.items.map((it) => ({
                description: it.description,
                quantity: Number(it.quantity),
                rate: Number(it.rate),
                expenseId: it.expenseId ?? undefined,
              })),
          })
        : undefined;

    try {
      return await this.prisma.invoice.update({
        where: { id },
        data: {
          ...data,
          ...(requested && items
            ? { items: { deleteMany: {}, create: items } }
            : {}),
        },
        include: INVOICE_INCLUDE,
      });
    } catch (err) {
      this.rethrowConflict(err);
    }
  }

  async remove(ownerId: string, id: string): Promise<InvoiceWithItems> {
    const invoice = await this.findOne(ownerId, id);
    await this.prisma.invoice.delete({ where: { id } });
    return invoice;
  }

  /**
   * Emails the invoice via the notification pipeline. A draft becomes
   * `sent`; re-sending an invoice that has moved on (viewed, part-paid,
   * overdue, paid) keeps its status - it's just another copy of the mail,
   * and must not roll a settled invoice back to outstanding. Cancelled
   * invoices can't be sent at all.
   */
  async send(ownerId: string, id: string): Promise<InvoiceWithItems> {
    const existing = await this.findOne(ownerId, id);
    if (existing.status === InvoiceStatus.cancelled) {
      throw new BadRequestException('A cancelled invoice cannot be sent');
    }
    const invoice = await this.prisma.invoice.update({
      where: { id },
      data:
        existing.status === InvoiceStatus.draft
          ? { status: InvoiceStatus.sent }
          : {},
      include: { ...INVOICE_INCLUDE, client: true },
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
