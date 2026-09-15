import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClientPortalUserStatus } from '../../generated/prisma/enums';

export class PortalPermissionSummaryEntity {
  @ApiProperty()
  viewProjects: boolean;

  @ApiProperty()
  viewDocuments: boolean;

  @ApiProperty()
  viewQuotes: boolean;

  @ApiProperty()
  viewPayments: boolean;
}

export class PortalMeClientEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  company: string | null;
}

export class PortalMeClientPortalEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  active: boolean;

  @ApiProperty({ type: PortalPermissionSummaryEntity })
  permission: PortalPermissionSummaryEntity;

  @ApiProperty({ type: PortalMeClientEntity })
  client: PortalMeClientEntity;
}

export class PortalMeEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiProperty({
    enum: Object.values(ClientPortalUserStatus),
    enumName: 'ClientPortalUserStatus',
  })
  status: ClientPortalUserStatus;

  @ApiProperty({ type: PortalMeClientPortalEntity })
  clientPortal: PortalMeClientPortalEntity;
}
