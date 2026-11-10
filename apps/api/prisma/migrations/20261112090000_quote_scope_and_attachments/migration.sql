-- AlterTable
ALTER TABLE "quote_items" ADD COLUMN     "acceptanceCriteria" TEXT,
ADD COLUMN     "deliverables" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "quote_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quoteId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quote_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quote_attachments_quoteId_documentId_key" ON "quote_attachments"("quoteId", "documentId");

-- CreateIndex
CREATE INDEX "quote_attachments_documentId_idx" ON "quote_attachments"("documentId");

-- AddForeignKey
ALTER TABLE "quote_attachments" ADD CONSTRAINT "quote_attachments_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_attachments" ADD CONSTRAINT "quote_attachments_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
