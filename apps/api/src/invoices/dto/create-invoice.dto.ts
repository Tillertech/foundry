import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { LineItemDto } from '../../common/dto/line-item.dto';
import { Currency, InvoiceStatus } from '../../generated/prisma/enums';

export class CreateInvoiceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientId: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ description: 'Auto-generated (INV-<n>) when omitted' })
  @IsOptional()
  @IsString()
  number?: string;

  @ApiPropertyOptional({ enum: Object.values(InvoiceStatus), enumName: 'InvoiceStatus' })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @ApiProperty({ example: '2026-06-20' })
  @IsDateString()
  issueDate: string;

  @ApiProperty({ example: '2026-07-12' })
  @IsDateString()
  dueDate: string;

  @ApiPropertyOptional({ enum: Object.values(Currency), enumName: 'Currency' })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiPropertyOptional({ example: 19, default: 0, description: 'Percent' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number;

  @ApiPropertyOptional({ example: 0, default: 0, description: 'Flat amount' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [LineItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  items: LineItemDto[];
}
