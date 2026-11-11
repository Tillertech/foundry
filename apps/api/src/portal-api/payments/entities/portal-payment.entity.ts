import {
  PortalInvoiceRefEntity,
  PortalProjectRefEntity,
} from '../../billing/portal-billing.entities';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '../../../generated/prisma/enums';
import { CURRENCY_SCHEMA } from '../../../common/currency';

export class PortalPaymentEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: String, description: 'Decimal serialized as string', example: '6000' })
  amount: string;

  @ApiProperty(CURRENCY_SCHEMA)
  currency: string;

  @ApiProperty({ enum: Object.values(PaymentMethod), enumName: 'PaymentMethod' })
  method: PaymentMethod;

  @ApiPropertyOptional({ nullable: true, type: String, example: 'TXN-11223' })
  reference: string | null;

  @ApiProperty()
  date: Date;

  @ApiPropertyOptional({ nullable: true, type: String })
  notes: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'uuid' })
  invoiceId: string | null;

  @ApiPropertyOptional({ nullable: true, type: PortalInvoiceRefEntity, description: 'The invoice this payment settled' })
  invoice: PortalInvoiceRefEntity | null;

  @ApiPropertyOptional({
    nullable: true,
    type: PortalProjectRefEntity,
    description: "The invoice's project - only when that project is shared with you",
  })
  project: PortalProjectRefEntity | null;

  @ApiProperty()
  createdAt: Date;
}
