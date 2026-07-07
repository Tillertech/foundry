import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CacheModule } from '@nestjs/cache-manager';
import KeyvRedis from '@keyv/redis';
import { Keyv } from 'keyv';
import { CacheableMemory } from 'cacheable';
import { BullModule } from '@nestjs/bullmq';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ClientsModule } from '../clients/clients.module';
import { PaginationModule } from '../common/pagination/pagination.module';
import { DocumentsModule } from '../documents/documents.module';
import { EventsModule } from '../events/events.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { AuthModule } from '../identity/auth/auth.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { NotificationModule } from '../notification/notification.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProjectsModule } from '../projects/projects.module';
import { QuotesModule } from '../quotes/quotes.module';
import { StorageModule } from '../storage/storage.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' }),
    ServeStaticModule.forRoot({
      rootPath: process.env.UPLOADS_DIR ?? join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        return {
          stores: [
            new Keyv({
              store: new CacheableMemory(),
            }),
            new KeyvRedis(
              `redis://${config.get('REDIS_HOST', 'foundrycache')}:${config.get('REDIS_PORT', 6379)}`,
            ),
          ],
        };
      },
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'foundrycache'),
          port: Number(config.get('REDIS_PORT', 6379)),
        },
      }),
    }),
    PrismaModule,
    PaginationModule,
    StorageModule,
    AuthModule,
    WorkspacesModule,
    ClientsModule,
    ProjectsModule,
    InvoicesModule,
    QuotesModule,
    PaymentsModule,
    ExpensesModule,
    DocumentsModule,
    NotificationModule,
    EventsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
