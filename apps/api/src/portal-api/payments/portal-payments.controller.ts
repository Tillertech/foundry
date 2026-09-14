import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { requestBaseUrl } from '../../common/http/request-base-url';
import { ApiPaginatedResponse } from '../../common/swagger/api-paginated-response.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CurrentPortalUser } from '../../portal-auth/decorators/current-portal-user.decorator';
import {
  PortalJwtAuthGuard,
  PortalJwtPayload,
} from '../../portal-auth/portal-jwt-auth.guard';
import { PortalPaymentEntity } from './entities/portal-payment.entity';
import { PortalPaymentsService } from './portal-payments.service';

@ApiTags('portal-payments')
@ApiBearerAuth()
@UseGuards(PortalJwtAuthGuard)
@Controller('portal/payments')
export class PortalPaymentsController {
  constructor(private readonly service: PortalPaymentsService) {}

  @Get()
  @ApiOperation({ summary: 'List payments (cursor paginated)' })
  @ApiPaginatedResponse(PortalPaymentEntity)
  @ApiForbiddenResponse({ description: 'Payments are not enabled for this portal' })
  findAll(
    @CurrentPortalUser() user: PortalJwtPayload,
    @Query() query: PaginationQueryDto,
    @Req() req: Request,
  ) {
    return this.service.findAll(
      user.clientPortalId,
      query,
      requestBaseUrl(req),
    );
  }
}
