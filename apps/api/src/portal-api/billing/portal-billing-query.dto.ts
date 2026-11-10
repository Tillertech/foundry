import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class PortalBillingQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: "Only this project's records (404 if the project isn't shared with you)",
  })
  @IsOptional()
  @IsUUID()
  projectId?: string;
}
