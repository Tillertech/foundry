import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ExpenseCategory } from '../../generated/prisma/enums';

export class ListExpensesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Only expenses in this one of your workspaces',
  })
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: "Only expenses on this client's projects",
  })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({
    enum: Object.values(ExpenseCategory),
    enumName: 'ExpenseCategory',
  })
  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @ApiPropertyOptional()
  @IsOptional()
  // Implicit query conversion turns "false" into true (Boolean("false")) -
  // read the raw query string instead, keeping an absent flag absent.
  @Transform(({ obj, key }) => {
    const raw: unknown = obj[key];
    return raw === undefined ? undefined : raw === true || raw === 'true';
  })
  @IsBoolean()
  billable?: boolean;
}
