import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  imports: [ClientsModule],
  controllers: [QuotesController],
  providers: [QuotesService],
  exports: [QuotesService],
})
export class QuotesModule {}
