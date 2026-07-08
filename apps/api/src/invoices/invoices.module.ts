import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module';
import { ProjectsModule } from '../projects/projects.module';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { PdfGeneratorService } from './pdf-generator.service';
import { InvoiceTaskService } from './invoices.tasks';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [ClientsModule, ProjectsModule, ReconciliationModule, HttpModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, PdfGeneratorService, InvoiceTaskService],
  exports: [InvoicesService, PdfGeneratorService],
})
export class InvoicesModule {}
