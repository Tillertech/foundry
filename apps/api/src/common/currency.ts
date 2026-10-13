import { Matches } from 'class-validator';

export const DEFAULT_CURRENCY = 'USD';

/** Swagger schema fragment shared by every currency property. */
export const CURRENCY_SCHEMA = {
  type: String,
  example: 'USD',
  pattern: '^[A-Z]{3}$',
} as const;

/** Three uppercase letters - the same shape the database CHECK enforces. */
export function IsCurrencyCode(): PropertyDecorator {
  return Matches(/^[A-Z]{3}$/, {
    message: '$property must be a 3-letter ISO 4217 currency code',
  });
}
