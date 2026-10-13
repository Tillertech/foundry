import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreatePortalUserDto {
  @ApiProperty({
    format: 'uuid',
    description: 'The client portal to invite this user into',
  })
  @IsUUID()
  clientPortalId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    default: true,
    description:
      'true (default): the user sees every project shared into the portal, now and later. false: only the projects in projectIds.',
  })
  @IsOptional()
  @IsBoolean()
  allProjects?: boolean;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      "Required (non-empty) when allProjects is false. Each must be a project of the portal's client.",
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  projectIds?: string[];
}
