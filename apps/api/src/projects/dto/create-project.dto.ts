import { IsApiDate } from '../../common/api-date';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ProjectStatus } from '../../generated/prisma/enums';

export class CreateProjectDto {
  @ApiProperty({ example: 'Marketing site redesign' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientId: string;

  @ApiPropertyOptional({
    enum: Object.values(ProjectStatus),
    enumName: 'ProjectStatus',
  })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @ApiPropertyOptional({ example: 24000, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  budget?: number;

  @ApiPropertyOptional({ example: 150 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  @ApiPropertyOptional({
    example: 10,
    default: 0,
    description:
      'Percent of each priced milestone held back until the retention-releasing milestone is invoiced',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  retentionPercent?: number;

  @ApiProperty({ example: '2026-05-01' })
  @IsApiDate()
  startDate: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsApiDate()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description:
      'Internal notes for the workspace team - never exposed through the client portal',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  notes?: string;
}
