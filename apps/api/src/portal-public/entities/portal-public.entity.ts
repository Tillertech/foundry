import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Everything the client-portal SPA needs to brand its unauthenticated
 * screens (login, accept-invite, ...) for a given `/:slug` - deliberately
 * minimal, no ids beyond what's already public in the URL, no permission
 * flags or user data.
 */
export class PortalPublicEntity {
  @ApiProperty()
  slug: string;

  @ApiProperty()
  active: boolean;

  @ApiProperty()
  clientName: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  company: string | null;
}
