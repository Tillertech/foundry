import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ClientPortalUserStatus } from '../../generated/prisma/enums';

export class ListPortalUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  clientPortalId?: string;

  @ApiPropertyOptional({
    enum: Object.values(ClientPortalUserStatus),
    enumName: 'ClientPortalUserStatus',
  })
  @IsOptional()
  @IsEnum(ClientPortalUserStatus)
  status?: ClientPortalUserStatus;
}
