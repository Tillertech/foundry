import { IsApiDate } from '../../common/api-date';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { QuoteLineItemDto } from './quote-line-item.dto';
import { QuoteStatus } from '../../generated/prisma/enums';
import { CURRENCY_SCHEMA, IsCurrencyCode } from '../../common/currency';

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
  @IsApiDate()
  issueDate: string;

  @ApiProperty({ example: '2026-07-28' })
  @IsApiDate()
  validUntil: string;

  @ApiPropertyOptional(CURRENCY_SCHEMA)
  @IsOptional()
  @IsCurrencyCode()
  currency?: string;

  @ApiPropertyOptional({ example: 0, default: 0, description: 'Percent' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number;

  @ApiPropertyOptional({
    example: 10,
    default: 0,
    description:
      'Percent held back from each milestone invoice until the final milestone',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  retentionPercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      "Supporting documents, in display order: documents of the quote's client or its projects. Replaces the current list; locked with the lines",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  attachmentIds?: string[];

  @ApiProperty({ type: [QuoteLineItemDto], description: 'In display order' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuoteLineItemDto)
  items: QuoteLineItemDto[];
}
