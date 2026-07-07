import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { InvoiceStatus } from '../../generated/prisma/enums';

export class ListInvoicesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ enum: Object.values(InvoiceStatus), enumName: 'InvoiceStatus' })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;
}
