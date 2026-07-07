import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateQuoteDto } from './create-quote.dto';

/** Items, when provided, replace the existing line items. */
export class UpdateQuoteDto extends PartialType(
  OmitType(CreateQuoteDto, ['clientId'] as const),
) {}
