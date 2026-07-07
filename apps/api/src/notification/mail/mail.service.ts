import { Injectable, Logger } from '@nestjs/common';
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

  constructor(private readonly mailerService: MailerService) {}

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
