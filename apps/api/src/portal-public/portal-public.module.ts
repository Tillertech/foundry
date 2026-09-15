import { Module } from '@nestjs/common';
import { PortalPublicController } from './portal-public.controller';
import { PortalPublicService } from './portal-public.service';

@Module({
  controllers: [PortalPublicController],
  providers: [PortalPublicService],
})
export class PortalPublicModule {}
