-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'milestone_completed';

-- AlterTable
ALTER TABLE "invoice_items" ADD COLUMN     "expenseId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "invoice_items_expenseId_key" ON "invoice_items"("expenseId");

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

