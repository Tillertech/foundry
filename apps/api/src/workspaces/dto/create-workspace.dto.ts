import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ClientStatus, Currency } from '../../generated/prisma/enums';

export class CreateWorkspaceDto {
  @ApiProperty({ example: 'Acme Studio' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  name: string;

  @ApiPropertyOptional({
    example: 'Acme Studio Ltd.',
    description: 'Registered legal entity name, when it differs from the trading name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  legalName?: string;

  @ApiPropertyOptional({ example: 'billing@acme.studio' })
  @IsOptional()
  @IsEmail()
  @MaxLength(500)
  email?: string;

  @ApiPropertyOptional({ example: '+254 700 000 000' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  phone?: string;

  @ApiPropertyOptional({ example: 'https://acme.studio' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;

  @ApiPropertyOptional({ example: '12 Riverside Drive' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ example: 'Nairobi' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  city?: string;

  @ApiPropertyOptional({ example: '00100' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  postCode?: string;

  @ApiPropertyOptional({ example: 'Kenya' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  country?: string;

  @ApiPropertyOptional({
    example: 'P051234567X',
    description: 'Tax / VAT registration number shown on documents',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  taxCode?: string;

  @ApiPropertyOptional({
    enum: Object.values(Currency),
    enumName: 'Currency',
    default: Currency.USD,
  })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiPropertyOptional({
    example: 16,
    default: 0,
    description: 'Default tax rate (percent) applied to new invoices and quotes',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxRate?: number;

  @ApiPropertyOptional({
    example: 7,
    default: 7,
    minimum: 0,
    maximum: 365,
    description: 'Default payment terms in days for new invoices',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  paymentTerms?: number;

  @ApiPropertyOptional({ example: 'INV-' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  invoicePrefix?: string;

  @ApiPropertyOptional({ example: 'Q-' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  quotePrefix?: string;

  @ApiPropertyOptional({
    example: 'Thank you for your business.',
    description: 'Footer note printed on invoices and quotes',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  footerNote?: string;

  @ApiPropertyOptional({
    enum: Object.values(ClientStatus),
    enumName: 'ClientStatus',
    default: ClientStatus.active,
  })
  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @ApiPropertyOptional({
    default: false,
    description: 'Send scheduled invoice due-date reminder emails',
  })
  @IsOptional()
  @IsBoolean()
  remindersEnabled?: boolean;

  @ApiPropertyOptional({
    default: 3,
    minimum: 1,
    maximum: 30,
    description:
      'Days before the due date reminders start (also the re-send interval)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  reminderDaysBefore?: number;
}
