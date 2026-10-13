-- Currencies are stored as plain ISO 4217 codes from here on instead of a
-- Postgres enum, so supporting another currency never needs a migration.
-- The API validates the code; the CHECKs keep anything malformed out.

ALTER TABLE "workspace"
  ALTER COLUMN "currency" DROP DEFAULT,
  ALTER COLUMN "currency" SET DATA TYPE VARCHAR(3) USING "currency"::text,
  ALTER COLUMN "currency" SET DEFAULT 'USD',
  ADD CONSTRAINT "workspace_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "clients"
  ALTER COLUMN "currency" DROP DEFAULT,
  ALTER COLUMN "currency" SET DATA TYPE VARCHAR(3) USING "currency"::text,
  ALTER COLUMN "currency" SET DEFAULT 'USD',
  ADD CONSTRAINT "clients_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "invoices"
  ALTER COLUMN "currency" DROP DEFAULT,
  ALTER COLUMN "currency" SET DATA TYPE VARCHAR(3) USING "currency"::text,
  ALTER COLUMN "currency" SET DEFAULT 'USD',
  ADD CONSTRAINT "invoices_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "quotes"
  ALTER COLUMN "currency" DROP DEFAULT,
  ALTER COLUMN "currency" SET DATA TYPE VARCHAR(3) USING "currency"::text,
  ALTER COLUMN "currency" SET DEFAULT 'USD',
  ADD CONSTRAINT "quotes_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "payments"
  ALTER COLUMN "currency" DROP DEFAULT,
  ALTER COLUMN "currency" SET DATA TYPE VARCHAR(3) USING "currency"::text,
  ALTER COLUMN "currency" SET DEFAULT 'USD',
  ADD CONSTRAINT "payments_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "reconciliation_entries"
  ALTER COLUMN "currency" DROP DEFAULT,
  ALTER COLUMN "currency" SET DATA TYPE VARCHAR(3) USING "currency"::text,
  ALTER COLUMN "currency" SET DEFAULT 'USD',
  ADD CONSTRAINT "reconciliation_entries_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "expenses"
  ALTER COLUMN "currency" DROP DEFAULT,
  ALTER COLUMN "currency" SET DATA TYPE VARCHAR(3) USING "currency"::text,
  ALTER COLUMN "currency" SET DEFAULT 'USD',
  ADD CONSTRAINT "expenses_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');

-- DropEnum
DROP TYPE "Currency";
