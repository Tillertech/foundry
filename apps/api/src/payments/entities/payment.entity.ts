import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency, PaymentMethod } from '../../generated/prisma/enums';

export class PaymentEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: String, description: 'Decimal serialized as string', example: '6000' })
  amount: string;

  @ApiProperty({ enum: Object.values(Currency), enumName: 'Currency' })
  currency: Currency;

  @ApiProperty({ enum: Object.values(PaymentMethod), enumName: 'PaymentMethod' })
  method: PaymentMethod;

  @ApiPropertyOptional({ nullable: true, type: String, example: 'TXN-11223' })
  reference: string | null;

  @ApiProperty()
  date: Date;

  @ApiPropertyOptional({ nullable: true, type: String })
  notes: string | null;

  @ApiProperty({ format: 'uuid' })
  clientId: string;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'uuid' })
  invoiceId: string | null;

  @ApiProperty()
  createdAt: Date;
}
