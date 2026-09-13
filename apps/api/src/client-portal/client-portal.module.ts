import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module';
import { PortalUsersModule } from '../portal-users/portal-users.module';
import { ClientPortalService } from './client-portal.service';
import { ClientPortalController } from './client-portal.controller';

@Module({
  imports: [ClientsModule, PortalUsersModule],
  controllers: [ClientPortalController],
  providers: [ClientPortalService],
  exports: [ClientPortalService],
})
export class ClientPortalModule {}
