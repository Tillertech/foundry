import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsUUID } from 'class-validator';

export class CreatePortalUserDto {
  @ApiProperty({ format: 'uuid', description: 'The client portal to invite this user into' })
  @IsUUID()
  clientPortalId: string;

  @ApiProperty()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsEmail()
  email: string;
}
