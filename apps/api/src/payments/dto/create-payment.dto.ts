import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';
import { Currency, PaymentMethod } from '../../generated/prisma/enums';

export class CreatePaymentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientId: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @ApiProperty({ example: 6000 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ enum: Object.values(Currency), enumName: 'Currency' })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiPropertyOptional({ enum: Object.values(PaymentMethod), enumName: 'PaymentMethod' })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional({ example: 'TXN-11223' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiProperty({ example: '2026-07-02' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Also mark the linked invoice as paid',
  })
  @IsOptional()
  @IsBoolean()
  markInvoicePaid?: boolean;
}
