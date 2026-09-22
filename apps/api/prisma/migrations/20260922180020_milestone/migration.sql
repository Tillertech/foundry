-- CreateEnum
CREATE TYPE "MileStoneStatus" AS ENUM ('not_started', 'in_progress', 'completed', 'on_hold', 'cancelled');

-- CreateTable
CREATE TABLE "milestone" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "notes" TEXT,
    "status" "MileStoneStatus" NOT NULL DEFAULT 'not_started',
    "effort" INTEGER,
    "dueDate" TIMESTAMP(3),
    "projectId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "milestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "milestone_name_idx" ON "milestone"("name");

-- CreateIndex
CREATE INDEX "milestone_status_idx" ON "milestone"("status");

-- CreateIndex
CREATE INDEX "milestone_projectId_idx" ON "milestone"("projectId");

-- AddForeignKey
ALTER TABLE "milestone" ADD CONSTRAINT "milestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
