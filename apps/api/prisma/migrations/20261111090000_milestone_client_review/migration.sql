-- CreateEnum
CREATE TYPE "MilestoneReviewDecision" AS ENUM ('approved', 'changes_requested');

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'milestone_changes_requested';

-- AlterTable
ALTER TABLE "clientPortalUser" ADD COLUMN     "canApproveMilestones" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "milestone_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "round" INTEGER NOT NULL,
    "decision" "MilestoneReviewDecision" NOT NULL,
    "comments" JSONB NOT NULL DEFAULT '[]',
    "criteriaConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "reviewerName" VARCHAR(250) NOT NULL,
    "reviewerEmail" VARCHAR(320) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "milestoneId" UUID NOT NULL,
    "clientPortalUserId" UUID,

    CONSTRAINT "milestone_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "milestone_reviews_milestoneId_idx" ON "milestone_reviews"("milestoneId");

-- CreateIndex
CREATE UNIQUE INDEX "milestone_reviews_milestoneId_round_key" ON "milestone_reviews"("milestoneId", "round");

-- AddForeignKey
ALTER TABLE "milestone_reviews" ADD CONSTRAINT "milestone_reviews_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_reviews" ADD CONSTRAINT "milestone_reviews_clientPortalUserId_fkey" FOREIGN KEY ("clientPortalUserId") REFERENCES "clientPortalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

