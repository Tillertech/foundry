-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationKind" ADD VALUE 'quote_accepted';
ALTER TYPE "NotificationKind" ADD VALUE 'quote_declined';

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "respondedAt" TIMESTAMP(3),
ADD COLUMN     "respondedBy" VARCHAR(500),
ADD COLUMN     "responseNote" TEXT;

