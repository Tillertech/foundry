import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientsService } from '../clients/clients.service';
import { PaymentEvents } from '../common/events';
import {
  PaginationRes,
  PaginationService,
} from '../common/pagination/pagination.service';
import { InvoiceStatus } from '../generated/prisma/enums';
import type { PaymentModel as Payment } from '../generated/prisma/models';
import { InvoicesService } from '../invoices/invoices.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly clients: ClientsService,
    private readonly invoices: InvoicesService,
    private readonly events: EventEmitter2,
  ) {}

  async create(ownerId: string, dto: CreatePaymentDto): Promise<Payment> {
    await this.clients.findOne(ownerId, dto.clientId);
    if (dto.invoiceId) await this.invoices.findOne(ownerId, dto.invoiceId);

    const { markInvoicePaid, ...data } = dto;
    const payment = await this.prisma.payment.create({ data });

    if (markInvoicePaid && dto.invoiceId) {
      await this.prisma.invoice.update({
        where: { id: dto.invoiceId },
        data: { status: InvoiceStatus.paid },
      });
    }

    this.events.emit(PaymentEvents.RECEIVED, payment);
    return payment;
  }

  findAll(
    ownerId: string,
    query: ListPaymentsQueryDto,
    baseUrl: string,
  ): Promise<PaginationRes<Payment>> {
    const { cursor, take, clientId, invoiceId, method } = query;
    return this.pagination.paginate<Payment>(
      this.prisma.payment,
      {
        where: {
          client: { workspace: { ownerId } },
          ...(clientId ? { clientId } : {}),
          ...(invoiceId ? { invoiceId } : {}),
          ...(method ? { method } : {}),
        },
      },
      {
        cursor,
        take,
        orderBy: { date: 'desc' },
        baseUrl,
        includeCount: true,
      },
    );
  }

  async findOne(ownerId: string, id: string): Promise<Payment> {
    const payment = await this.prisma.payment.findFirst({
      where: { id, client: { workspace: { ownerId } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdatePaymentDto,
  ): Promise<Payment> {
    await this.findOne(ownerId, id);
    if (dto.invoiceId) await this.invoices.findOne(ownerId, dto.invoiceId);
    return this.prisma.payment.update({ where: { id }, data: dto });
  }

  async remove(ownerId: string, id: string): Promise<Payment> {
    await this.findOne(ownerId, id);
    return this.prisma.payment.delete({ where: { id } });
  }
}
