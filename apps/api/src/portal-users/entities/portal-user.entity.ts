import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClientPortalUserStatus } from '../../generated/prisma/enums';

export class PortalUserEntity {
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

  @ApiPropertyOptional({ nullable: true, type: Date })
  emailVerifiedAt: Date | null;

  @ApiProperty({
    description:
      'true: sees every project shared into the portal. false: only the shared projects in projectIds.',
  })
  allProjects: boolean;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Projects the user is limited to; empty when allProjects is true',
  })
  projectIds: string[];

  @ApiProperty({ format: 'uuid' })
  clientPortalId: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
