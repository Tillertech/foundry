import { Module } from '@nestjs/common';
import { PortalAuthModule } from '../portal-auth/portal-auth.module';
import { PortalNotificationsController } from './portal-notifications.controller';
import { PortalNotificationsGateway } from './portal-notifications.gateway';
import { PortalNotificationsListener } from './portal-notifications.listener';
import { PortalNotificationsService } from './portal-notifications.service';

@Module({
  imports: [PortalAuthModule],
  controllers: [PortalNotificationsController],
  providers: [
    PortalNotificationsGateway,
    PortalNotificationsService,
    PortalNotificationsListener,
  ],
  exports: [PortalNotificationsService],
})
export class PortalNotificationsModule {}
