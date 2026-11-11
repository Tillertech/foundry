import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { InvoiceStatus } from '../../generated/prisma/enums';
import { PortalBillingQueryDto } from '../billing/portal-billing-query.dto';

/** Statuses a portal user can see - drafts never reach the client. */
export const PORTAL_INVOICE_STATUSES = Object.values(InvoiceStatus).filter(
  (s) => s !== InvoiceStatus.draft,
);

export class PortalInvoicesQueryDto extends PortalBillingQueryDto {
  @ApiPropertyOptional({ enum: PORTAL_INVOICE_STATUSES, description: 'Only invoices in this status' })
  @IsOptional()
  @IsIn(PORTAL_INVOICE_STATUSES)
  status?: InvoiceStatus;
}
