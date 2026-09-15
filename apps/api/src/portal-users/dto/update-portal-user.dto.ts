import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsNotEmpty, IsOptional } from 'class-validator';
import { ClientPortalUserStatus } from '../../generated/prisma/enums';

const MUTABLE_STATUSES = [ClientPortalUserStatus.active, ClientPortalUserStatus.suspended];

export class UpdatePortalUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    enum: MUTABLE_STATUSES,
    description: 'Suspend or reactivate a user. "invited" is set automatically and cannot be assigned here.',
  })
  @IsOptional()
  @IsIn(MUTABLE_STATUSES)
  status?: 'active' | 'suspended';
}
