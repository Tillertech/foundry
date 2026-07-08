import { Module } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';

@Module({
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
