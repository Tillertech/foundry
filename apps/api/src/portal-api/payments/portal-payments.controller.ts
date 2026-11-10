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
import { CurrentPortalUser } from '../../portal-auth/decorators/current-portal-user.decorator';
import {
  PortalJwtAuthGuard,
  PortalJwtPayload,
} from '../../portal-auth/portal-jwt-auth.guard';
import { PortalBillingQueryDto } from '../billing/portal-billing-query.dto';
import { PortalPaymentEntity } from './entities/portal-payment.entity';
import { PortalPaymentsService } from './portal-payments.service';

@ApiTags('portal-payments')
@ApiBearerAuth()
@UseGuards(PortalJwtAuthGuard)
@Controller('portal/payments')
export class PortalPaymentsController {
  constructor(private readonly service: PortalPaymentsService) {}

  @Get()
  @ApiOperation({ summary: 'List payments with the invoice and project each one paid for (cursor paginated; ?projectId= for one project)' })
  @ApiPaginatedResponse(PortalPaymentEntity)
  @ApiForbiddenResponse({ description: 'Payments are not enabled for this portal' })
  findAll(
    @CurrentPortalUser() user: PortalJwtPayload,
    @Query() query: PortalBillingQueryDto,
    @Req() req: Request,
  ) {
    return this.service.findAll(
      user.clientPortalId,
      user.sub,
      query,
      requestBaseUrl(req),
    );
  }
}
