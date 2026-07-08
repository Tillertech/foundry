import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [InvoicesModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
