import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { ProjectsModule } from '../projects/projects.module';
import { MilestoneBillingService } from './milestone-billing.service';
import { MilestonesController } from './milestones.controller';
import { MilestonesService } from './milestones.service';

@Module({
  imports: [ProjectsModule, InvoicesModule],
  controllers: [MilestonesController],
  providers: [MilestonesService, MilestoneBillingService],
  exports: [MilestonesService, MilestoneBillingService],
})
export class MilestonesModule {}
