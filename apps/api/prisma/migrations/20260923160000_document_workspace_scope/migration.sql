-- Documents get their own tenant link. Previously documents linked to neither
-- a client nor a project had no owner at all and were visible to (and
-- downloadable/deletable by) every user.

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "workspaceId" UUID;

-- Backfill from the client link, else from the project's client.
UPDATE "documents" AS d
SET "workspaceId" = c."workspaceId"
FROM "clients" AS c
WHERE d."clientId" = c."id";

UPDATE "documents" AS d
SET "workspaceId" = c."workspaceId"
FROM "projects" AS p
JOIN "clients" AS c ON c."id" = p."clientId"
WHERE d."workspaceId" IS NULL
  AND d."projectId" = p."id";

-- Unlinked documents carry no record of who uploaded them. They are only
-- attributed on a single-tenant database; anywhere else they stay NULL
-- ("visible to nobody") rather than being guessed into another tenant's
-- workspace. Reassign them manually:
--   UPDATE "documents" SET "workspaceId" = '<workspace id>' WHERE "id" IN (...);
UPDATE "documents"
SET "workspaceId" = (SELECT "id" FROM "workspace")
WHERE "workspaceId" IS NULL
  AND (SELECT COUNT(*) FROM "workspace") = 1;

-- CreateIndex
CREATE INDEX "documents_workspaceId_idx" ON "documents"("workspaceId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
