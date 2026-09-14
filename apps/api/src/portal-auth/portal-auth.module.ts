import { Module } from '@nestjs/common';
import { PortalAuthController } from './portal-auth.controller';
import { PortalAuthService } from './portal-auth.service';
import { PortalJwtAuthGuard } from './portal-jwt-auth.guard';

@Module({
  controllers: [PortalAuthController],
  providers: [PortalAuthService, PortalJwtAuthGuard],
  exports: [PortalJwtAuthGuard],
})
export class PortalAuthModule {}
