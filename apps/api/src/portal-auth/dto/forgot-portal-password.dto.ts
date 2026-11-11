import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class ForgotPortalPasswordDto {
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
}
