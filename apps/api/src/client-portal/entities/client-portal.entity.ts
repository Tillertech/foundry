import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PortalPermissionEntity } from './portal-permission.entity';

export class ClientPortalEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ description: 'URL-safe identifier the portal is reachable at, derived from the client name' })
  slug: string;

  @ApiProperty()
  active: boolean;

  @ApiProperty({ format: 'uuid' })
  clientId: string;

  @ApiPropertyOptional({ type: PortalPermissionEntity })
  permission?: PortalPermissionEntity;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
