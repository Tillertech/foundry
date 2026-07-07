import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';

export interface InvoiceMailLineItem {
  description: string;
  quantity: string;
  rate: string;
  amount: string;
}

export interface InvoiceMailContext {
  clientName: string;
  workspaceName: string;
  number: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  items: InvoiceMailLineItem[];
  subtotal: string;
  discount: string;
  taxRate: string;
  tax: string;
  total: string;
  notes: string;
}

interface Attachment {
  filename: string;
  content: Buffer;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly config: ConfigService,
  ) {}

  async sendEmailVerificationOtp(to: string, name: string, otp: string) {
    // Deep link back to the verification screen with the address prefilled, so
    // a mobile user who left to read the code can tap straight back into the
    // right page. The code itself is never in the URL.
    const appUrl = this.config.get<string>('APP_URL')?.replace(/\/+$/, '');
    const verifyUrl = appUrl
      ? `${appUrl}/auth/verify?email=${encodeURIComponent(to)}`
      : '';

    await this.send(to, 'Confirm your email for Foundry', 'email-verification-otp', {
      name,
      otp,
      email: to,
      verifyUrl,
    });
  }

  async sendLoginOtp(to: string, name: string, otp: string) {
    // Deep link back to the sign-in code screen with the address prefilled, so
    // a mobile user who left to read the code can tap straight back in.
    const appUrl = this.config.get<string>('APP_URL')?.replace(/\/+$/, '');
    const verifyUrl = appUrl
      ? `${appUrl}/auth/verify-login?email=${encodeURIComponent(to)}`
      : '';

    await this.send(to, 'Your Foundry sign-in code', 'login-otp', {
      name,
      otp,
      email: to,
      verifyUrl,
    });
  }

  async sendPasswordResetOtp(to: string, name: string, otp: string) {
    await this.send(
      to,
      'Your Foundry password reset code',
      'password-reset-otp',
      {
        name,
        otp,
        email: to,
      },
    );
  }

  async sendInvoice(to: string, context: InvoiceMailContext, pdf?: Buffer) {
    await this.send(
      to,
      `Invoice ${context.number} from ${context.workspaceName}`,
      'invoice-sent',
      { ...context },
      pdf ? [{ filename: `${context.number}.pdf`, content: pdf }] : undefined,
    );
  }

  async sendInvoicePaid(to: string, context: InvoiceMailContext) {
    await this.send(
      to,
      `Payment received for invoice ${context.number}`,
      'invoice-paid',
      { ...context },
    );
  }

  async sendInvoiceReminder(to: string, context: InvoiceMailContext) {
    await this.send(
      to,
      `Reminder: invoice ${context.number} is due`,
      'invoice-reminder',
      { ...context },
    );
  }

  private async send(
    to: string,
    subject: string,
    template: string,
    context: Record<string, unknown>,
    attachments?: Attachment[],
  ) {
    try {
      await this.mailerService.sendMail({
        to,
        subject,
        template,
        context,
        attachments,
      });
      this.logger.log(`Email sent  ${to} | ${subject}`);
    } catch (err) {
      this.logger.error(
        `Email failed  ${to} | ${subject} | ${(err as Error).message}`,
      );
    }
  }
}
