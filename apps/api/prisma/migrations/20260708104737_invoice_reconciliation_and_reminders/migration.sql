-- CreateEnum
CREATE TYPE "ReconciliationKind" AS ENUM ('payment_applied', 'payment_reversed');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "lastRemindedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "workspace" ADD COLUMN     "reminderDaysBefore" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "remindersEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "reconciliation_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "ReconciliationKind" NOT NULL DEFAULT 'payment_applied',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "invoiceBalance" DECIMAL(12,2),
    "projectBalance" DECIMAL(12,2),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentId" UUID,
    "invoiceId" UUID,
    "projectId" UUID,

    CONSTRAINT "reconciliation_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reconciliation_entries_invoiceId_idx" ON "reconciliation_entries"("invoiceId");

-- CreateIndex
CREATE INDEX "reconciliation_entries_projectId_idx" ON "reconciliation_entries"("projectId");

-- AddForeignKey
ALTER TABLE "reconciliation_entries" ADD CONSTRAINT "reconciliation_entries_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_entries" ADD CONSTRAINT "reconciliation_entries_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_entries" ADD CONSTRAINT "reconciliation_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
