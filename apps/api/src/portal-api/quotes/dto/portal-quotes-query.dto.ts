import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { QuoteStatus } from '../../../generated/prisma/enums';
import { PortalBillingQueryDto } from '../../billing/portal-billing-query.dto';

/** What a portal user can filter on: drafts are never visible, so never a status. */
export const PORTAL_QUOTE_STATUSES = [
  QuoteStatus.sent,
  QuoteStatus.accepted,
  QuoteStatus.declined,
  QuoteStatus.expired,
] as const;

export class PortalQuotesQueryDto extends PortalBillingQueryDto {
  @ApiPropertyOptional({ enum: PORTAL_QUOTE_STATUSES, description: 'Only quotes in this status' })
  @IsOptional()
  @IsIn(PORTAL_QUOTE_STATUSES)
  status?: (typeof PORTAL_QUOTE_STATUSES)[number];
}
