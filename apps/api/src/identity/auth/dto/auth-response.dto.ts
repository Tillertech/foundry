import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WorkspaceEntity } from '../../../workspaces/entities/workspace.entity';

export class AuthUserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  createdAt: Date;
}

export class AuthResponseDto {
  @ApiProperty({ description: 'JWT bearer token' })
  accessToken: string;

  @ApiProperty({ type: AuthUserDto })
  user: AuthUserDto;

  @ApiPropertyOptional({
    type: WorkspaceEntity,
    description: 'The user default workspace (created at signup)',
  })
  defaultWorkspace?: WorkspaceEntity;
}

export class MeResponseDto extends AuthUserDto {
  @ApiProperty({ type: [WorkspaceEntity] })
  workspaces: WorkspaceEntity[];
}

export class MessageResponseDto {
  @ApiProperty()
  message: string;
}

export class SignupResponseDto {
  @ApiProperty({
    description: 'The address a verification code was sent to',
    example: 'ada@example.com',
  })
  email: string;

  @ApiProperty({
    example: 'We sent a 6-digit verification code to your email.',
  })
  message: string;
}

export class LoginChallengeDto {
  @ApiProperty({
    description: 'The address a sign-in code was sent to',
    example: 'ada@example.com',
  })
  email: string;

  @ApiProperty({ example: 'We sent a 6-digit sign-in code to your email.' })
  message: string;
}
