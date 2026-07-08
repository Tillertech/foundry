import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency, InvoiceStatus } from '../../generated/prisma/enums';

export class ReportStatusCountEntity {
  @ApiProperty({ enum: Object.values(InvoiceStatus), enumName: 'InvoiceStatus' })
  status: InvoiceStatus;

  @ApiProperty({ example: 4 })
  count: number;
}

export class ReportMonthEntity {
  @ApiProperty({ example: '2026-07', description: 'Calendar month (YYYY-MM)' })
  month: string;

  @ApiProperty({
    example: 1250.5,
    description: 'Payments received, in the workspace currency',
  })
  collected: number;

  @ApiProperty({
    example: 320,
    description: 'Expenses recorded, in the workspace currency',
  })
  expenses: number;
}

export class ReportClientEntity {
  @ApiProperty({ format: 'uuid' })
  clientId: string;

  @ApiProperty({ example: 'Acme Corp' })
  name: string;

  @ApiProperty({
    example: 8600,
    description: 'Invoiced volume, in the workspace currency',
  })
  invoiced: number;

  @ApiProperty({
    example: 5200,
    description: 'Payments received, in the workspace currency',
  })
  collected: number;
}

export class ReportCategoryEntity {
  @ApiProperty({ example: 'software' })
  category: string;

  @ApiProperty({
    example: 420,
    description: 'Amount spent, in the workspace currency',
  })
  amount: number;
}

export class ReportCurrencyEntity {
  @ApiProperty({
    enum: Object.values(Currency),
    enumName: 'Currency',
    description: 'Currency the customer actually paid in',
  })
  currency: Currency;

  @ApiProperty({ example: 3, description: 'Payments received in this currency' })
  count: number;

  @ApiProperty({ example: 15000, description: 'Total in the paid currency' })
  amount: number;

  @ApiProperty({
    example: 116.2,
    description: 'Same total converted into the workspace currency',
  })
  converted: number;
}

export class ReportSummaryEntity {
  @ApiProperty({
    enum: Object.values(Currency),
    enumName: 'Currency',
    description: 'Workspace currency every converted figure is expressed in',
  })
  currency: Currency;

  @ApiPropertyOptional({ nullable: true, type: String, example: '2026-01-01' })
  from: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, example: '2026-12-31' })
  to: string | null;

  @ApiProperty({ description: 'Total invoiced in the period (workspace currency)' })
  invoiced: number;

  @ApiProperty({ description: 'Payments received in the period (workspace currency)' })
  collected: number;

  @ApiProperty({ description: 'Open invoice balances (workspace currency)' })
  outstanding: number;

  @ApiProperty({ description: 'Overdue invoice balances (workspace currency)' })
  overdue: number;

  @ApiProperty({ description: 'Expenses in the period (workspace currency)' })
  expenses: number;

  @ApiProperty({ description: 'Collected minus expenses (workspace currency)' })
  netProfit: number;

  @ApiProperty({ example: 12 })
  invoiceCount: number;

  @ApiProperty({ example: 7 })
  paidInvoiceCount: number;

  @ApiProperty({ description: 'Average invoice value (workspace currency)' })
  avgInvoiceValue: number;

  @ApiProperty({ example: 9 })
  paymentCount: number;

  @ApiProperty({ type: [ReportStatusCountEntity] })
  invoicesByStatus: ReportStatusCountEntity[];

  @ApiProperty({
    type: [ReportMonthEntity],
    description: 'Cash flow per calendar month across the period',
  })
  monthly: ReportMonthEntity[];

  @ApiProperty({ type: [ReportClientEntity], description: 'Top clients by invoiced volume' })
  topClients: ReportClientEntity[];

  @ApiProperty({ type: [ReportCategoryEntity] })
  expensesByCategory: ReportCategoryEntity[];

  @ApiProperty({
    type: [ReportCurrencyEntity],
    description:
      'Payments grouped by the currency the customer paid with, with workspace-currency equivalents',
  })
  paymentsByCurrency: ReportCurrencyEntity[];
}
