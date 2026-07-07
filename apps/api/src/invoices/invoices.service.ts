import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientsService } from '../clients/clients.service';
import {
  PaginationRes,
  PaginationService,
} from '../common/pagination/pagination.service';
import { InvoiceStatus } from '../generated/prisma/enums';
import type {
  ClientModel as Client,
  InvoiceModel as Invoice,
  InvoiceItemModel as InvoiceItem,
} from '../generated/prisma/models';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices-query.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';

export type InvoiceWithItems = Invoice & { items: InvoiceItem[] };

export interface InvoiceSentEvent {
  invoice: InvoiceWithItems;
  client: Client;
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly clients: ClientsService,
    private readonly projects: ProjectsService,
    private readonly events: EventEmitter2,
  ) {}

  async create(ownerId: string, dto: CreateInvoiceDto): Promise<InvoiceWithItems> {
    await this.clients.findOne(ownerId, dto.clientId);
    if (dto.projectId) await this.projects.findOne(ownerId, dto.projectId);
    const { items, number, ...data } = dto;
    return this.prisma.invoice.create({
      data: {
        ...data,
        number: number ?? (await this.nextNumber()),
        items: { create: items },
      },
      include: { items: true },
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
        include: { items: true },
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
      include: { items: true },
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
    return this.prisma.invoice.update({
      where: { id },
      data: {
        ...data,
        ...(items ? { items: { deleteMany: {}, create: items } } : {}),
      },
      include: { items: true },
    });
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
      include: { items: true, client: true },
    });
    const { client, ...rest } = invoice;
    this.events.emit('invoice.sent', {
      invoice: rest,
      client,
    } satisfies InvoiceSentEvent);
    return rest;
  }

  private async nextNumber(): Promise<string> {
    const latest = await this.prisma.invoice.findFirst({
      where: { number: { startsWith: 'INV-' } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const current = Number(latest?.number.replace('INV-', ''));
    return `INV-${Number.isNaN(current) ? 1001 : current + 1}`;
  }
}
