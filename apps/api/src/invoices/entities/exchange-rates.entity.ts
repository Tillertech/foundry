import { ApiProperty } from '@nestjs/swagger';
import { CURRENCY_SCHEMA } from '../../common/currency';

export class ExchangeRatesEntity {
  @ApiProperty({
    ...CURRENCY_SCHEMA,
    description: 'Currency the rates convert into',
  })
  target: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    example: { USD: 1, EUR: 1.08, GBP: 1.27, KES: 0.0077 },
    description:
      "Multiplier into the target for each currency the caller's records use; a currency is absent when its rate could not be fetched",
  })
  rates: Partial<Record<string, number>>;
}
