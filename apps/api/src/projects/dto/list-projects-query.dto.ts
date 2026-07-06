import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ProjectStatus } from '../../generated/prisma/enums';

export class ListProjectsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ enum: Object.values(ProjectStatus), enumName: 'ProjectStatus' })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;
}
