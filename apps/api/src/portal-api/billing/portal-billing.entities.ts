import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CURRENCY_SCHEMA } from '../../common/currency';

/** A project a record belongs to - present only when it is shared with the viewer. */
export class PortalProjectRefEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Griid Android' })
  name: string;
}

export class PortalInvoiceRefEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'INV-1002' })
  number: string;
}

export class PortalNextDueEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'INV-1003' })
  number: string;

  @ApiProperty()
  dueDate: Date;

  @ApiProperty({ example: 50000 })
  balance: number;
}

export class PortalProjectFinancialsEntity {
  @ApiProperty(CURRENCY_SCHEMA)
  currency: string;

  @ApiProperty({ description: 'Agreed project budget', example: 400000 })
  budget: number;

  @ApiProperty({ description: 'Total of sent invoices (incl. tax)', example: 315000 })
  invoiced: number;

  @ApiProperty({ description: 'Payments received on those invoices', example: 45000 })
  paid: number;

  @ApiProperty({ description: 'Invoiced but not yet paid', example: 270000 })
  outstanding: number;

  @ApiProperty({ description: 'Part of outstanding that is past its due date', example: 0 })
  overdue: number;

  @ApiProperty({ description: 'Budget not invoiced yet (pre-tax, like the budget)', example: 85000 })
  remainingToInvoice: number;

  @ApiProperty({ description: 'Held back on milestone invoices until the final milestone', example: 35000 })
  retentionHeld: number;

  @ApiProperty({ description: 'Invoices counted above' })
  invoiceCount: number;

  @ApiProperty({ description: "Invoices in another currency, left out of the sums" })
  otherCurrencyInvoices: number;

  @ApiPropertyOptional({ nullable: true, type: PortalNextDueEntity })
  nextDue: PortalNextDueEntity | null;
}
