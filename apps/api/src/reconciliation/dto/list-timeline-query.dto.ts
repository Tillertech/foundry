import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListTimelineQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    default: false,
    description:
      "Invoice timeline only: also include the linked project's other entries (combined view)",
  })
  @IsOptional()
  // Implicit query conversion turns "false" into true; convert explicitly.
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeProject?: boolean;
}
