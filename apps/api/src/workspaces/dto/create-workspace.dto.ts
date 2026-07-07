import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ClientStatus, Currency } from '../../generated/prisma/enums';

export class CreateWorkspaceDto {
  @ApiProperty({ example: 'Acme Studio' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  name: string;

  @ApiPropertyOptional({
    enum: Object.values(Currency),
    enumName: 'Currency',
    default: Currency.USD,
  })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiPropertyOptional({
    enum: Object.values(ClientStatus),
    enumName: 'ClientStatus',
    default: ClientStatus.active,
  })
  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;
}
