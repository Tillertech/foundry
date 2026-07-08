import { ApiProperty } from '@nestjs/swagger';
import { Currency } from '../../generated/prisma/enums';

export class ExchangeRatesEntity {
  @ApiProperty({
    enum: Object.values(Currency),
    enumName: 'Currency',
    description: 'Currency the rates convert into',
  })
  target: Currency;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    example: { USD: 1, EUR: 1.08, GBP: 1.27, KES: 0.0077 },
    description: 'Multiplier from each currency into the target',
  })
  rates: Record<Currency, number>;
}
