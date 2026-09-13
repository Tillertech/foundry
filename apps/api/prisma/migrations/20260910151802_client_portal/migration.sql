-- CreateEnum
CREATE TYPE "ClientPortalUserStatus" AS ENUM ('invited', 'active', 'suspended');

-- CreateTable
CREATE TABLE "clientPortal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientId" UUID NOT NULL,

    CONSTRAINT "clientPortal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientPortalUser" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "otpSecret" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "status" "ClientPortalUserStatus" NOT NULL DEFAULT 'invited',
    "clientPortalId" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientPortalUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portalPermission" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "viewProjects" BOOLEAN NOT NULL DEFAULT true,
    "viewDocuments" BOOLEAN NOT NULL DEFAULT true,
    "viewQuotes" BOOLEAN NOT NULL DEFAULT true,
    "viewPayments" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientPortalId" UUID NOT NULL,

    CONSTRAINT "portalPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientPortalProject" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientPortalId" UUID NOT NULL,
    "projectId" UUID NOT NULL,

    CONSTRAINT "clientPortalProject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clientPortal_clientId_key" ON "clientPortal"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "clientPortalUser_email_clientPortalId_key" ON "clientPortalUser"("email", "clientPortalId");

-- CreateIndex
CREATE UNIQUE INDEX "portalPermission_clientPortalId_key" ON "portalPermission"("clientPortalId");

-- CreateIndex
CREATE UNIQUE INDEX "clientPortalProject_clientPortalId_projectId_key" ON "clientPortalProject"("clientPortalId", "projectId");

-- AddForeignKey
ALTER TABLE "clientPortal" ADD CONSTRAINT "clientPortal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientPortalUser" ADD CONSTRAINT "clientPortalUser_clientPortalId_fkey" FOREIGN KEY ("clientPortalId") REFERENCES "clientPortal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portalPermission" ADD CONSTRAINT "portalPermission_clientPortalId_fkey" FOREIGN KEY ("clientPortalId") REFERENCES "clientPortal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientPortalProject" ADD CONSTRAINT "clientPortalProject_clientPortalId_fkey" FOREIGN KEY ("clientPortalId") REFERENCES "clientPortal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientPortalProject" ADD CONSTRAINT "clientPortalProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
