import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class AcceptInviteDto {
  @ApiProperty({ example: 'elena@acmestudio.co' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Invite token from the emailed accept-invite link' })
  @IsString()
  @MinLength(1)
  token: string;

  @ApiProperty({ minLength: 8, example: 'correct-horse-battery' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
