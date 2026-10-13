import { ApiProperty } from '@nestjs/swagger';

/** The four view flags, wherever they are reported. */
export class PortalPermissionFlagsEntity {
  @ApiProperty()
  viewProjects: boolean;

  @ApiProperty()
  viewDocuments: boolean;

  @ApiProperty()
  viewQuotes: boolean;

  @ApiProperty({ description: 'Gates both invoices and payments' })
  viewPayments: boolean;
}

export class PortalPermissionEntity extends PortalPermissionFlagsEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    description:
      "While true the portal follows its workspace's default permissions and the view* flags here are ignored",
  })
  inherit: boolean;

  @ApiProperty({ format: 'uuid' })
  clientPortalId: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
