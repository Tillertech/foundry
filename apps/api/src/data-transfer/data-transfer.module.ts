import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AccountExportProcessor } from './account-export.processor';
import { ACCOUNT_EXPORT_QUEUE } from './account-export.queue';
import { AccountExportService } from './account-export.service';
import { AccountExportsService } from './account-exports.service';
import { DataTransferController } from './data-transfer.controller';

@Module({
  imports: [BullModule.registerQueue({ name: ACCOUNT_EXPORT_QUEUE })],
  controllers: [DataTransferController],
  providers: [
    AccountExportService,
    AccountExportsService,
    AccountExportProcessor,
  ],
  exports: [AccountExportService, AccountExportsService],
})
export class DataTransferModule {}
