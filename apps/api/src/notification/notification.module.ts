import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MailService } from './mail/mail.service';
import { NotificationGateway } from './notification.gateway';
import { NotificationListener } from './notification.listener';
import { NotificationService } from './notification.service';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';

import { join } from 'path';
import { ConfigService } from '@nestjs/config';

// In local dev nest start --watch compiles to dist/src/ (prisma.config.ts at the root
// shifts TypeScript's implicit rootDir), so __dirname lands in dist/src/notification/.
// Use process.cwd()+src in dev to hit the volume-mounted source; __dirname in prod
// where dist/src/notification/mail/templates/ is populated by the CLI asset copy.
const TEMPLATE_DIR =
  process.env.NODE_ENV === 'production'
    ? join(__dirname, 'mail', 'templates')
    : join(process.cwd(), 'src', 'notification', 'mail', 'templates');

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
          secure: false,
          ignoreTLS: false,
          auth: {
            user: config.get('SMTP_USER', 'email'),
            pass: config.get('SMTP_PASS', 'password'),
          },
        },
        defaults: {
          from: `"${config.get('SEND_EMAIL_FROM', 'No Reply')}" <${config.get('SEND_EMAIL_FROM', 'notification@neoafric.com')}>`,
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
