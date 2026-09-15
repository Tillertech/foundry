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

  @ApiProperty({ format: 'uuid' })
  clientPortalId: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
