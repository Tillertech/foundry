import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class AcceptInviteDto {
  @ApiProperty({
    example: 'acme-logistics',
    description:
      'Slug of the portal being signed into - an email can belong to several portals',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  slug: string;

  @ApiProperty({ example: 'elena@acmestudio.co' })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Invite token from the emailed accept-invite link',
  })
  @IsString()
  @MinLength(1)
  token: string;

  @ApiProperty({ minLength: 8, example: 'correct-horse-battery' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
