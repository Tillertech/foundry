import { Injectable, NotFoundException } from '@nestjs/common';
import { ClientsService } from '../clients/clients.service';
import {
  PaginationRes,
  PaginationService,
} from '../common/pagination/pagination.service';
import type {
  QuoteModel as Quote,
  QuoteItemModel as QuoteItem,
} from '../generated/prisma/models';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { ListQuotesQueryDto } from './dto/list-quotes-query.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';

export type QuoteWithItems = Quote & { items: QuoteItem[] };

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly clients: ClientsService,
  ) {}

  async create(ownerId: string, dto: CreateQuoteDto): Promise<QuoteWithItems> {
    await this.clients.findOne(ownerId, dto.clientId);
    const { items, number, ...data } = dto;
    return this.prisma.quote.create({
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
    query: ListQuotesQueryDto,
    baseUrl: string,
  ): Promise<PaginationRes<QuoteWithItems>> {
    const { cursor, take, clientId, status } = query;
    return this.pagination.paginate<QuoteWithItems>(
      this.prisma.quote,
      {
        where: {
          client: { workspace: { ownerId } },
          ...(clientId ? { clientId } : {}),
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

  async findOne(ownerId: string, id: string): Promise<QuoteWithItems> {
    const quote = await this.prisma.quote.findFirst({
      where: { id, client: { workspace: { ownerId } } },
      include: { items: true },
    });
    if (!quote) throw new NotFoundException('Quote not found');
    return quote;
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateQuoteDto,
  ): Promise<QuoteWithItems> {
    await this.findOne(ownerId, id);
    const { items, ...data } = dto;
    return this.prisma.quote.update({
      where: { id },
      data: {
        ...data,
        ...(items ? { items: { deleteMany: {}, create: items } } : {}),
      },
      include: { items: true },
    });
  }

  async remove(ownerId: string, id: string): Promise<QuoteWithItems> {
    const quote = await this.findOne(ownerId, id);
    await this.prisma.quote.delete({ where: { id } });
    return quote;
  }

  private async nextNumber(): Promise<string> {
    const latest = await this.prisma.quote.findFirst({
      where: { number: { startsWith: 'Q-' } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const current = Number(latest?.number.replace('Q-', ''));
    return `Q-${Number.isNaN(current) ? 2001 : current + 1}`;
  }
}
