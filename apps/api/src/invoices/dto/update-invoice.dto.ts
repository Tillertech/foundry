import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateInvoiceDto } from './create-invoice.dto';

/** Items, when provided, replace the existing line items. */
export class UpdateInvoiceDto extends PartialType(
  OmitType(CreateInvoiceDto, ['clientId'] as const),
) {}
