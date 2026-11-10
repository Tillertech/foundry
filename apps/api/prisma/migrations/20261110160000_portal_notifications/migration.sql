-- CreateEnum
CREATE TYPE "PortalNotificationKind" AS ENUM ('quote_sent', 'invoice_sent', 'document_shared', 'milestone_started', 'milestone_delivered', 'milestone_accepted');

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'milestone_invoiced';

-- CreateTable
CREATE TABLE "portal_notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "PortalNotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "resourceId" UUID,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientPortalUserId" UUID NOT NULL,

    CONSTRAINT "portal_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portal_notifications_clientPortalUserId_createdAt_idx" ON "portal_notifications"("clientPortalUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "portal_notifications" ADD CONSTRAINT "portal_notifications_clientPortalUserId_fkey" FOREIGN KEY ("clientPortalUserId") REFERENCES "clientPortalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

