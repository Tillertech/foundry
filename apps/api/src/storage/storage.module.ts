import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalStorageService } from './local-storage.service';
import { S3StorageService } from './s3-storage.service';
import { StorageService } from './storage.service';

/**
 * Storage driver selection: local disk in dev, S3 in prod.
 * Override with STORAGE_DRIVER=local|s3.
 */
@Global()
@Module({
  providers: [
    {
      provide: StorageService,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const driver =
          config.get<string>('STORAGE_DRIVER') ??
          (config.get<string>('NODE_ENV') === 'production' ? 's3' : 'local');
        return driver === 's3'
          ? new S3StorageService(config)
          : new LocalStorageService(config);
      },
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
