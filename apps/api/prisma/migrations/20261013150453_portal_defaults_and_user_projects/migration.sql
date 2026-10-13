-- AlterTable
ALTER TABLE "clientPortalUser" ADD COLUMN     "allProjects" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "portalPermission" ADD COLUMN     "inherit" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "workspace" ADD COLUMN     "portalViewDocuments" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "portalViewPayments" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "portalViewProjects" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "portalViewQuotes" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "clientPortalUserProject" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientPortalUserId" UUID NOT NULL,
    "projectId" UUID NOT NULL,

    CONSTRAINT "clientPortalUserProject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clientPortalUserProject_projectId_idx" ON "clientPortalUserProject"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "clientPortalUserProject_clientPortalUserId_projectId_key" ON "clientPortalUserProject"("clientPortalUserId", "projectId");

-- AddForeignKey
ALTER TABLE "clientPortalUserProject" ADD CONSTRAINT "clientPortalUserProject_clientPortalUserId_fkey" FOREIGN KEY ("clientPortalUserId") REFERENCES "clientPortalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientPortalUserProject" ADD CONSTRAINT "clientPortalUserProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A portal whose flags were already switched away from the all-on defaults keeps them as its own.
UPDATE "portalPermission"
SET "inherit" = false
WHERE NOT ("viewProjects" AND "viewDocuments" AND "viewQuotes" AND "viewPayments");
