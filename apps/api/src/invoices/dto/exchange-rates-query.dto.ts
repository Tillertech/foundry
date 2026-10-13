import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { CURRENCY_SCHEMA, IsCurrencyCode } from '../../common/currency';

export class ExchangeRatesQueryDto {
  @ApiPropertyOptional({
    ...CURRENCY_SCHEMA,
    description: 'Target currency; defaults to the default workspace currency',
  })
  @IsOptional()
  @IsCurrencyCode()
  target?: string;
}
