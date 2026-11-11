import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsDateString } from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * An ISO 8601 date or date-time in a request body, normalised to a full UTC
 * timestamp. Prisma's DateTime only takes complete timestamps, so a plain
 * `2026-11-10` (valid per @IsDateString, and what the API docs show) used to
 * reach the database as-is and fail with a 500; it now means midnight UTC on
 * that day. Values that aren't valid dates are left untouched so validation
 * still rejects them with a 400.
 */
export function IsApiDate(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }) => toApiTimestamp(value)),
    IsDateString(),
  );
}

export function toApiTimestamp(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  const date = new Date(DATE_ONLY.test(trimmed) ? `${trimmed}T00:00:00.000Z` : trimmed);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}
