import { Module } from '@nestjs/common';
import { PortalUsersService } from './portal-users.service';
import { PortalUsersController } from './portal-users.controller';

@Module({
  controllers: [PortalUsersController],
  providers: [PortalUsersService],
  exports: [PortalUsersService],
})
export class PortalUsersModule {}
