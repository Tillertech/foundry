import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ClientPortalUserStatus } from '../../generated/prisma/enums';

const MUTABLE_STATUSES = [
  ClientPortalUserStatus.active,
  ClientPortalUserStatus.suspended,
];

export class UpdatePortalUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    enum: MUTABLE_STATUSES,
    description:
      'Suspend or reactivate a user. "invited" is set automatically and cannot be assigned here, and a user who has not accepted their invite cannot be activated.',
  })
  @IsOptional()
  @IsIn(MUTABLE_STATUSES)
  status?: 'active' | 'suspended';

  @ApiPropertyOptional({
    description:
      'true: every project shared into the portal. false: only the projects in projectIds.',
  })
  @IsOptional()
  @IsBoolean()
  allProjects?: boolean;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      "Replaces the user's project list. Must be non-empty when the user is (or becomes) limited to specific projects.",
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  projectIds?: string[];
}
