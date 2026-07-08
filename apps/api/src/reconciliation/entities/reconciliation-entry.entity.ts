import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency, ReconciliationKind } from '../../generated/prisma/enums';

export class ReconciliationEntryEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    enum: Object.values(ReconciliationKind),
    enumName: 'ReconciliationKind',
  })
  kind: ReconciliationKind;

  @ApiProperty({
    type: String,
    description:
      'Decimal serialized as string; negative when a payment was reversed',
    example: '1500.00',
  })
  amount: string;

  @ApiProperty({ enum: Object.values(Currency), enumName: 'Currency' })
  currency: Currency;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Amount still owed on the invoice after this entry',
    example: '250.00',
  })
  invoiceBalance: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Project budget remaining after this entry',
    example: '4200.00',
  })
  projectBalance: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  note: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'uuid' })
  paymentId: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'uuid' })
  invoiceId: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'uuid' })
  projectId: string | null;

  @ApiProperty()
  createdAt: Date;
}
