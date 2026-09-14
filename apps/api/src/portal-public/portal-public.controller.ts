import { Controller, Get, Param } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PortalPublicService } from './portal-public.service';
import { PortalPublicEntity } from './entities/portal-public.entity';

/**
 * Unauthenticated by design: the client-portal SPA calls this to brand its
 * login/accept-invite/reset-password screens before anyone has signed in,
 * given only the slug already in the URL. No sensitive data - see the entity.
 */
@ApiTags('portal-public')
@Controller('portal-public')
export class PortalPublicController {
  constructor(private readonly portalPublicService: PortalPublicService) {}

  @Get(':slug')
  @ApiOperation({ summary: "Get a client portal's public branding by slug" })
  @ApiOkResponse({ type: PortalPublicEntity })
  @ApiNotFoundResponse()
  findBySlug(@Param('slug') slug: string) {
    return this.portalPublicService.findBySlug(slug);
  }
}
