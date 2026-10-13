import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectStatus } from '../../generated/prisma/enums';
import { PortalUserEntity } from '../../portal-users/entities/portal-user.entity';
import {
  PortalPermissionEntity,
  PortalPermissionFlagsEntity,
} from './portal-permission.entity';

export class ClientPortalProjectSummaryEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({
    enum: Object.values(ProjectStatus),
    enumName: 'ProjectStatus',
  })
  status: ProjectStatus;
}

export class ClientPortalProjectEntity {
  @ApiProperty({ format: 'uuid', description: 'Id of the share itself' })
  id: string;

  @ApiProperty({ description: 'Whether the project is visible in the portal' })
  active: boolean;

  @ApiProperty({ type: ClientPortalProjectSummaryEntity })
  project: ClientPortalProjectSummaryEntity;
}

export class ClientPortalEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    description:
      'URL-safe identifier the portal is reachable at, derived from the client name',
  })
  slug: string;

  @ApiProperty()
  active: boolean;

  @ApiProperty({ format: 'uuid' })
  clientId: string;

  @ApiPropertyOptional({
    type: PortalPermissionEntity,
    description: "The portal's own flags and whether it inherits instead",
  })
  permission?: PortalPermissionEntity;

  @ApiProperty({
    type: PortalPermissionFlagsEntity,
    description:
      'What the portal can actually see: the workspace defaults while it inherits, its own flags otherwise',
  })
  effectivePermission: PortalPermissionFlagsEntity;

  @ApiProperty({ type: [PortalUserEntity] })
  clientPortalUsers: PortalUserEntity[];

  @ApiProperty({ type: [ClientPortalProjectEntity] })
  clientPortalProjects: ClientPortalProjectEntity[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
