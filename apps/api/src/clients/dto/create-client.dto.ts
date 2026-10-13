import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ClientStatus } from '../../generated/prisma/enums';
import { CURRENCY_SCHEMA, IsCurrencyCode } from '../../common/currency';

export class CreateClientDto {
  @ApiProperty({ example: 'Elena Ramirez' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 'elena@acmestudio.co' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional(CURRENCY_SCHEMA)
  @IsOptional()
  @IsCurrencyCode()
  currency?: string;

  @ApiPropertyOptional({ enum: Object.values(ClientStatus), enumName: 'ClientStatus' })
  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(250)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taxId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Defaults to the user default workspace',
  })
  @IsOptional()
  @IsUUID()
  workspaceId?: string;
}
