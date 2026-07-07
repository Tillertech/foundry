import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { QuoteStatus } from '../../generated/prisma/enums';

export class ListQuotesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ enum: Object.values(QuoteStatus), enumName: 'QuoteStatus' })
  @IsOptional()
  @IsEnum(QuoteStatus)
  status?: QuoteStatus;
}
