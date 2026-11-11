import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module';
import { MilestonesModule } from '../milestones/milestones.module';
import { NotificationModule } from '../notification/notification.module';
import { ProjectsModule } from '../projects/projects.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  imports: [ClientsModule, ProjectsModule, MilestonesModule, NotificationModule],
  controllers: [QuotesController],
  providers: [QuotesService],
  exports: [QuotesService],
})
export class QuotesModule {}
