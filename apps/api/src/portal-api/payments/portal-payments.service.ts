import { Injectable } from '@nestjs/common';
import {
  PaginationRes,
  PaginationService,
} from '../../common/pagination/pagination.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { PaymentModel as Payment } from '../../generated/prisma/models';
import { PrismaService } from '../../prisma/prisma.service';
import { PortalContextService } from '../portal-context.service';

@Injectable()
export class PortalPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly context: PortalContextService,
  ) {}

  async findAll(
    clientPortalId: string,
    query: PaginationQueryDto,
    baseUrl: string,
  ): Promise<PaginationRes<Payment>> {
    const { clientId } = await this.context.require(
      clientPortalId,
      'viewPayments',
    );
    return this.pagination.paginate<Payment>(
      this.prisma.payment,
      { where: { clientId } },
      {
        cursor: query.cursor,
        take: query.take,
        orderBy: { createdAt: 'desc' },
        baseUrl,
        includeCount: true,
      },
    );
  }
}
