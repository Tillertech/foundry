import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LineItemEntity } from '../../common/dto/line-item.dto';
import { Currency, InvoiceStatus } from '../../generated/prisma/enums';

export class InvoiceItemEntity extends LineItemEntity {
  @ApiProperty({ format: 'uuid' })
  invoiceId: string;
}

export class InvoiceEntity {
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

  @ApiProperty({ format: 'uuid' })
  clientId: string;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'uuid' })
  projectId: string | null;

  @ApiProperty({ type: [InvoiceItemEntity] })
  items: InvoiceItemEntity[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
