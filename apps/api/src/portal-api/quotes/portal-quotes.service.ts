import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PaginationRes,
  PaginationService,
} from '../../common/pagination/pagination.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type {
  QuoteModel as Quote,
  QuoteItemModel as QuoteItem,
} from '../../generated/prisma/models';
import { PrismaService } from '../../prisma/prisma.service';
import { PortalContextService } from '../portal-context.service';

export type PortalQuoteWithItems = Quote & { items: QuoteItem[] };

@Injectable()
export class PortalQuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly context: PortalContextService,
  ) {}

  async findAll(
    clientPortalId: string,
    query: PaginationQueryDto,
    baseUrl: string,
  ): Promise<PaginationRes<PortalQuoteWithItems>> {
    const { clientId } = await this.context.require(
      clientPortalId,
      'viewQuotes',
    );
    return this.pagination.paginate<PortalQuoteWithItems>(
      this.prisma.quote,
      { where: { clientId }, include: { items: true } },
      {
        cursor: query.cursor,
        take: query.take,
        orderBy: { createdAt: 'desc' },
        baseUrl,
        includeCount: true,
      },
    );
  }

  async findOne(
    clientPortalId: string,
    id: string,
  ): Promise<PortalQuoteWithItems> {
    const { clientId } = await this.context.require(
      clientPortalId,
      'viewQuotes',
    );
    const quote = await this.prisma.quote.findFirst({
      where: { id, clientId },
      include: { items: true },
    });
    if (!quote) throw new NotFoundException('Quote not found');
    return quote;
  }
}
