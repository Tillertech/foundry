import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPortalPasswordDto {
  @ApiProperty({ example: 'elena@acmestudio.co' })
  @IsEmail()
  email: string;
}
