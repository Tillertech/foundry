import type { PaymentModel as Payment } from '../../generated/prisma/models';

export const PaymentEvents = {
  RECEIVED: 'payment.received',
} as const;

export type PaymentReceivedEvent = Payment;
