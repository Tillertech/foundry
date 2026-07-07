import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ClientStatus } from '../../generated/prisma/enums';

export class ListClientsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @ApiPropertyOptional({ enum: Object.values(ClientStatus), enumName: 'ClientStatus' })
  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @ApiPropertyOptional({ description: 'Case-insensitive match on name, email or company' })
  @IsOptional()
  @IsString()
  search?: string;
}
