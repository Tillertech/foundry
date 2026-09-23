-- Expenses get their own tenant link. Previously project-less expenses had no
-- owner at all and were visible to (and editable by) every user.

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "workspaceId" UUID;

-- Backfill: project-linked expenses belong to their project's client's workspace.
UPDATE "expenses" AS e
SET "workspaceId" = c."workspaceId"
FROM "projects" AS p
JOIN "clients" AS c ON c."id" = p."clientId"
WHERE e."projectId" = p."id";

-- Project-less expenses carry no record of who created them. They can only be
-- attributed with certainty on a single-tenant database; anywhere else they
-- stay NULL, which every query treats as "visible to nobody" - quarantined
-- rather than guessed into someone else's workspace. Reassign them manually:
--   UPDATE "expenses" SET "workspaceId" = '<workspace id>' WHERE "id" IN (...);
UPDATE "expenses"
SET "workspaceId" = (SELECT "id" FROM "workspace")
WHERE "workspaceId" IS NULL
  AND (SELECT COUNT(*) FROM "workspace") = 1;

-- CreateIndex
CREATE INDEX "expenses_workspaceId_idx" ON "expenses"("workspaceId");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
