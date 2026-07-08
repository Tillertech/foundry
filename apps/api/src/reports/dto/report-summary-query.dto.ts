import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class ReportSummaryQueryDto {
  @ApiPropertyOptional({
    description: 'Start of the reporting period (inclusive)',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'End of the reporting period (inclusive)',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}
