import { ApiProperty } from '@nestjs/swagger';

export class PortalPermissionEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  viewProjects: boolean;

  @ApiProperty()
  viewDocuments: boolean;

  @ApiProperty()
  viewQuotes: boolean;

  @ApiProperty()
  viewPayments: boolean;

  @ApiProperty({ format: 'uuid' })
  clientPortalId: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
