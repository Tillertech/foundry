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
  MinLength,
} from 'class-validator';
import { Currency, ExpenseCategory } from '../../generated/prisma/enums';

export class CreateExpenseDto {
  @ApiProperty({ example: 'Figma' })
  @IsString()
  @MinLength(1)
  vendor: string;

  @ApiPropertyOptional({ enum: Object.values(ExpenseCategory), enumName: 'ExpenseCategory' })
  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @ApiProperty({ example: 45 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ enum: Object.values(Currency), enumName: 'Currency' })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiProperty({ example: '2026-07-01' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  billable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;
}
