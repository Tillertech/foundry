import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module';
import { ProjectsModule } from '../projects/projects.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { PdfGeneratorService } from './pdf-generator.service';

@Module({
  imports: [ClientsModule, ProjectsModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, PdfGeneratorService],
  exports: [InvoicesService, PdfGeneratorService],
})
export class InvoicesModule {}
