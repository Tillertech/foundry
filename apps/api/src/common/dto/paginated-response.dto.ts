import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PaginatedResponseDto<T> {
  @ApiPropertyOptional({ description: 'Total records matching the filter' })
  count?: number;

  @ApiProperty({ nullable: true, type: String })
  next: string | null;

  @ApiProperty({ nullable: true, type: String })
  previous: string | null;

  results: T[];
}
