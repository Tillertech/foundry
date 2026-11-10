import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ConvertQuoteDto {
  @ApiProperty({ example: 'Griid Android app' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  name: string;

  @ApiProperty({ example: '2026-11-17' })
  @IsDateString()
  startDate: string;

  @ApiPropertyOptional({ example: '2027-02-28' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: 2500, description: 'Rate for out-of-scope work' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  @ApiPropertyOptional({
    default: false,
    description:
      'Raise a draft invoice for the first milestone straight away (deposit) instead of waiting for its acceptance',
  })
  @IsOptional()
  @IsBoolean()
  invoiceFirstMilestone?: boolean;
}
