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
import { Currency, QuoteStatus } from '../../generated/prisma/enums';

export class CreateQuoteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientId: string;

  @ApiPropertyOptional({ description: 'Auto-generated (Q-<n>) when omitted' })
  @IsOptional()
  @IsString()
  number?: string;

  @ApiPropertyOptional({ enum: Object.values(QuoteStatus), enumName: 'QuoteStatus' })
  @IsOptional()
  @IsEnum(QuoteStatus)
  status?: QuoteStatus;

  @ApiProperty({ example: '2026-06-28' })
  @IsDateString()
  issueDate: string;

  @ApiProperty({ example: '2026-07-28' })
  @IsDateString()
  validUntil: string;

  @ApiPropertyOptional({ enum: Object.values(Currency), enumName: 'Currency' })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiPropertyOptional({ example: 0, default: 0, description: 'Percent' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number;

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
