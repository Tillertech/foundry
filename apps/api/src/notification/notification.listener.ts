import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  AuthEvents,
  InvoiceEvents,
  PaymentEvents,
  type EmailVerificationRequestedEvent,
  type InvoiceSentEvent,
  type LoginOtpRequestedEvent,
  type PasswordResetRequestedEvent,
  type PaymentReceivedEvent,
} from '../common/events';
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

  @OnEvent(InvoiceEvents.SENT, { async: true })
  handleInvoiceSent(payload: InvoiceSentEvent) {
    return this.notifications
      .onInvoiceSent(payload)
      .catch((err) =>
        this.logger.error('invoice.sent notification failed', err),
      );
  }

  @OnEvent(PaymentEvents.RECEIVED, { async: true })
  handlePaymentReceived(payload: PaymentReceivedEvent) {
    return this.notifications
      .onPaymentReceived(payload)
      .catch((err) =>
        this.logger.error('payment.received notification failed', err),
      );
  }

  @OnEvent(AuthEvents.PASSWORD_RESET_REQUESTED, { async: true })
  handlePasswordResetRequested(payload: PasswordResetRequestedEvent) {
    return this.mail
      .sendPasswordResetOtp(payload.email, payload.name, payload.otp)
      .catch((err) => this.logger.error('password reset mail failed', err));
  }

  @OnEvent(AuthEvents.EMAIL_VERIFICATION_REQUESTED, { async: true })
  handleEmailVerificationRequested(payload: EmailVerificationRequestedEvent) {
    return this.mail
      .sendEmailVerificationOtp(payload.email, payload.name, payload.otp)
      .catch((err) => this.logger.error('email verification mail failed', err));
  }

  @OnEvent(AuthEvents.LOGIN_OTP_REQUESTED, { async: true })
  handleLoginOtpRequested(payload: LoginOtpRequestedEvent) {
    return this.mail
      .sendLoginOtp(payload.email, payload.name, payload.otp)
      .catch((err) => this.logger.error('login otp mail failed', err));
  }
}
