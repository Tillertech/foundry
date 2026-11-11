-- CreateEnum
CREATE TYPE "MilestoneBillingTrigger" AS ENUM ('on_acceptance', 'upfront', 'manual');

-- CreateEnum
CREATE TYPE "QuoteItemKind" AS ENUM ('standard', 'milestone', 'recurring', 'pass_through', 'option');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MilestoneStatus" ADD VALUE 'delivered';
ALTER TYPE "MilestoneStatus" ADD VALUE 'accepted';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "milestoneId" UUID;

-- AlterTable
ALTER TABLE "milestones" ADD COLUMN     "acceptanceCriteria" TEXT,
ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "acceptedBy" VARCHAR(250),
ADD COLUMN     "amount" DECIMAL(12,2),
ADD COLUMN     "billingTrigger" "MilestoneBillingTrigger" NOT NULL DEFAULT 'on_acceptance',
ADD COLUMN     "deliverables" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "releasesRetention" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "retainedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "retentionPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "quote_items" ADD COLUMN     "details" TEXT,
ADD COLUMN     "estimatedHours" INTEGER,
ADD COLUMN     "kind" "QuoteItemKind" NOT NULL DEFAULT 'standard',
ADD COLUMN     "milestoneId" UUID,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "selected" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "projectId" UUID,
ADD COLUMN     "retentionPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "invoices_milestoneId_key" ON "invoices"("milestoneId");

-- CreateIndex
CREATE UNIQUE INDEX "quote_items_milestoneId_key" ON "quote_items"("milestoneId");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_projectId_key" ON "quotes"("projectId");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

