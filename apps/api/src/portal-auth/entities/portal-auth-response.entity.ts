import { ApiProperty } from '@nestjs/swagger';

export class PortalAuthUserEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ format: 'uuid' })
  clientPortalId: string;

  @ApiProperty({
    description:
      'Slug this portal is reached at (e.g. /:slug/...) - navigate here after auth.',
  })
  portalSlug: string;
}

export class PortalAuthResponseEntity {
  @ApiProperty({ description: 'Portal-user JWT bearer token' })
  accessToken: string;

  @ApiProperty({ type: PortalAuthUserEntity })
  user: PortalAuthUserEntity;
}

export class PortalMessageResponseEntity {
  @ApiProperty()
  message: string;
}
