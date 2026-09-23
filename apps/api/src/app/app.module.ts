import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import KeyvRedis from '@keyv/redis';
import { Keyv } from 'keyv';
import { CacheableMemory } from 'cacheable';
import { BullModule } from '@nestjs/bullmq';
import { ClientPortalModule } from '../client-portal/client-portal.module';
import { ClientsModule } from '../clients/clients.module';
import { PaginationModule } from '../common/pagination/pagination.module';
import { DocumentsModule } from '../documents/documents.module';
import { EventsModule } from '../events/events.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { AuthModule } from '../identity/auth/auth.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { MilestonesModule } from '../milestones/milestones.module';
import { NotificationModule } from '../notification/notification.module';
import { PaymentsModule } from '../payments/payments.module';
import { PortalApiModule } from '../portal-api/portal-api.module';
import { PortalAuthModule } from '../portal-auth/portal-auth.module';
import { PortalPublicModule } from '../portal-public/portal-public.module';
import { PortalUsersModule } from '../portal-users/portal-users.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProjectsModule } from '../projects/projects.module';
import { QuotesModule } from '../quotes/quotes.module';
import { ReportsModule } from '../reports/reports.module';
import { StorageModule } from '../storage/storage.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' }),
    // No public static route for uploads: documents and logos are only ever
    // served through their owner-scoped endpoints (/documents/:id/download,
    // /workspaces/:id/logo, the portal's download routes). A ServeStatic
    // /uploads mount made every stored file readable by anyone with its URL.
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
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000,
          limit: 120,
        },
      ],
    }),
    PrismaModule,
    PaginationModule,
    StorageModule,
    AuthModule,
    WorkspacesModule,
    ClientsModule,
    ProjectsModule,
    MilestonesModule,
    InvoicesModule,
    QuotesModule,
    PaymentsModule,
    ExpensesModule,
    DocumentsModule,
    ReportsModule,
    NotificationModule,
    EventsModule,
    ClientPortalModule,
    PortalUsersModule,
    PortalAuthModule,
    PortalApiModule,
    PortalPublicModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
