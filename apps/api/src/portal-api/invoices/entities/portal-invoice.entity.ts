import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LineItemEntity } from '../../../common/dto/line-item.dto';
import {
  Currency,
  ExpenseCategory,
  InvoiceStatus,
} from '../../../generated/prisma/enums';

export class PortalInvoiceItemExpenseEntity {
  @ApiProperty({ example: 'Figma' })
  vendor: string;

  @ApiProperty({ enum: Object.values(ExpenseCategory), enumName: 'ExpenseCategory' })
  category: ExpenseCategory;

  @ApiProperty()
  date: Date;
}

export class PortalInvoiceItemEntity extends LineItemEntity {
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'uuid',
    description: 'Set when this line re-bills a billable expense',
  })
  expenseId: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: PortalInvoiceItemExpenseEntity,
    description: 'Null for regular lines, or if the expense was since deleted',
  })
  expense: PortalInvoiceItemExpenseEntity | null;
}

export class PortalInvoiceEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'INV-1042' })
  number: string;

  @ApiProperty({ enum: Object.values(InvoiceStatus), enumName: 'InvoiceStatus' })
  status: InvoiceStatus;

  @ApiProperty()
  issueDate: Date;

  @ApiProperty()
  dueDate: Date;

  @ApiProperty({ enum: Object.values(Currency), enumName: 'Currency' })
  currency: Currency;

  @ApiProperty({ type: String, description: 'Percent, decimal serialized as string', example: '19' })
  taxRate: string;

  @ApiProperty({ type: String, description: 'Flat discount, decimal serialized as string', example: '0' })
  discount: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  notes: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'uuid' })
  projectId: string | null;

  @ApiProperty({ type: [PortalInvoiceItemEntity] })
  items: PortalInvoiceItemEntity[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
