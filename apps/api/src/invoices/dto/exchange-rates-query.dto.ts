import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { Currency } from '../../generated/prisma/enums';

export class ExchangeRatesQueryDto {
  @ApiPropertyOptional({
    enum: Object.values(Currency),
    enumName: 'Currency',
    description: 'Target currency; defaults to the default workspace currency',
  })
  @IsOptional()
  @IsEnum(Currency)
  target?: Currency;
}
