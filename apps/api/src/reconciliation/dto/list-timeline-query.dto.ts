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
  // Read the untransformed source (`obj`) instead so "false"/
  // "true" are parsed from the original query string, not its broken cast.
  @Transform(({ obj, key }) => obj[key] === true || obj[key] === 'true')
  @IsBoolean()
  includeProject?: boolean;
}
