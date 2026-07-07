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
