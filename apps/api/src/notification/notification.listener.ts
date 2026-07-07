import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { InvoiceSentEvent } from '../invoices/invoices.service';
import type { PaymentModel as Payment } from '../generated/prisma/models';
import { MailService } from './mail/mail.service';
import { NotificationService } from './notification.service';

/**
 * A failed notification must not undo the state
 * change that triggered it.
 */
@Injectable()
export class NotificationListener {
  private readonly logger = new Logger(NotificationListener.name);

  constructor(
    private readonly notifications: NotificationService,
    private readonly mail: MailService,
  ) {}

  @OnEvent('invoice.sent', { async: true })
  handleInvoiceSent(payload: InvoiceSentEvent) {
    return this.notifications
      .onInvoiceSent(payload)
      .catch((err) =>
        this.logger.error('invoice.sent notification failed', err),
      );
  }

  @OnEvent('payment.received', { async: true })
  handlePaymentReceived(payload: Payment) {
    return this.notifications
      .onPaymentReceived(payload)
      .catch((err) =>
        this.logger.error('payment.received notification failed', err),
      );
  }

  @OnEvent('auth.password_reset_requested', { async: true })
  handlePasswordResetRequested(payload: {
    email: string;
    name: string;
    otp: string;
  }) {
    return this.mail
      .sendPasswordResetOtp(payload.email, payload.name, payload.otp)
      .catch((err) => this.logger.error('password reset mail failed', err));
  }
}
