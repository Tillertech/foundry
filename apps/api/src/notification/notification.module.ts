import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MailService } from './mail/mail.service';
import { NotificationGateway } from './notification.gateway';
import { NotificationListener } from './notification.listener';
import { NotificationService } from './notification.service';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';

import { existsSync } from 'fs';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';

// In dev the bundle runs from dist, so __dirname has no templates — read them from
// the source tree instead. cwd is the workspace root under nx serve (also in the
// docker containers) but apps/api under a bare nest start, so probe both.
const DEV_TEMPLATE_DIRS = [
  join(
    process.cwd(),
    'apps',
    'api',
    'src',
    'notification',
    'mail',
    'templates',
  ),
  join(process.cwd(), 'src', 'notification', 'mail', 'templates'),
];

const TEMPLATE_DIR =
  process.env.NODE_ENV === 'production'
    ? join(__dirname, 'mail', 'templates')
    : (DEV_TEMPLATE_DIRS.find((dir) => existsSync(dir)) ??
      DEV_TEMPLATE_DIRS[0]);

@Module({
  imports: [
    PrismaModule,
    InvoicesModule,
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        transport: {
          host: config.get('SMTP_HOST', 'mailpit'),
          port: config.get('SMTP_PORT', 1025),
          secure: config.get('SMTP_SECURE', false),
          ignoreTLS: false,
          auth: {
            user: config.get('SMTP_USER', 'email'),
            pass: config.get('SMTP_PASS', 'password'),
          },
        },
        defaults: {
          from: `"${config.get('SEND_EMAIL_FROM', 'No Reply')}" <${config.get('SEND_EMAIL_FROM', 'notification@tillertech.io')}>`,
        },
        template: {
          dir: TEMPLATE_DIR,
          adapter: new HandlebarsAdapter(),
          options: {
            strict: true,
          },
        },
      }),
    }),
  ],
  providers: [
    NotificationService,
    MailService,
    NotificationGateway,
    NotificationListener,
  ],
  exports: [NotificationService, MailService],
})
export class NotificationModule {}
