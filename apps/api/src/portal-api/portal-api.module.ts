import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { PortalAuthModule } from '../portal-auth/portal-auth.module';
import { PortalContextService } from './portal-context.service';
import { PortalProjectsController } from './projects/portal-projects.controller';
import { PortalProjectsService } from './projects/portal-projects.service';
import { PortalInvoicesController } from './invoices/portal-invoices.controller';
import { PortalInvoicesService } from './invoices/portal-invoices.service';
import { PortalQuotesController } from './quotes/portal-quotes.controller';
import { PortalQuotesService } from './quotes/portal-quotes.service';
import { PortalPaymentsController } from './payments/portal-payments.controller';
import { PortalPaymentsService } from './payments/portal-payments.service';
import { PortalDocumentsController } from './documents/portal-documents.controller';
import { PortalDocumentsService } from './documents/portal-documents.service';

@Module({
  imports: [PortalAuthModule, NotificationModule],
  controllers: [
    PortalProjectsController,
    PortalInvoicesController,
    PortalQuotesController,
    PortalPaymentsController,
    PortalDocumentsController,
  ],
  providers: [
    PortalContextService,
    PortalProjectsService,
    PortalInvoicesService,
    PortalQuotesService,
    PortalPaymentsService,
    PortalDocumentsService,
  ],
})
export class PortalApiModule {}
