import { OmitType, PartialType } from '@nestjs/swagger';
import { CreatePaymentDto } from './create-payment.dto';

export class UpdatePaymentDto extends PartialType(
  OmitType(CreatePaymentDto, ['clientId', 'markInvoicePaid'] as const),
) {}
