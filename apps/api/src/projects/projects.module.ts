import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [ClientsModule, ReconciliationModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
