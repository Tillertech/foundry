import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({ example: 'ada@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: '6-digit code sent by email', example: '123456' })
  @IsString()
  @Length(6, 6)
  otp: string;
}

export class ResendVerificationDto {
  @ApiProperty({ example: 'ada@example.com' })
  @IsEmail()
  email: string;
}

export class VerifyLoginDto {
  @ApiProperty({ example: 'ada@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: '6-digit sign-in code sent by email', example: '123456' })
  @IsString()
  @Length(6, 6)
  otp: string;
}
