import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { InvoiceSentEvent } from '../invoices/invoices.service';
import type { PaymentModel as Payment } from '../generated/prisma/models';
import { MailService } from './mail/mail.service';
import { NotificationService } from './notification.service';

@Injectable()
export class NotificationListener {
  constructor(
    private readonly notifications: NotificationService,
    private readonly mail: MailService,
  ) {}

  @OnEvent('invoice.sent', { async: true })
  handleInvoiceSent(payload: InvoiceSentEvent) {
    return this.notifications.onInvoiceSent(payload);
  }

  @OnEvent('payment.received', { async: true })
  handlePaymentReceived(payload: Payment) {
    return this.notifications.onPaymentReceived(payload);
  }

  @OnEvent('auth.password_reset_requested', { async: true })
  handlePasswordResetRequested(payload: {
    email: string;
    name: string;
    otp: string;
  }) {
    return this.mail.sendPasswordResetOtp(
      payload.email,
      payload.name,
      payload.otp,
    );
  }
}
