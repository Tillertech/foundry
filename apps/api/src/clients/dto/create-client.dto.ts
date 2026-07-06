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
import { ClientStatus, Currency } from '../../generated/prisma/enums';

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

  @ApiPropertyOptional({ enum: Object.values(Currency), enumName: 'Currency' })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

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
