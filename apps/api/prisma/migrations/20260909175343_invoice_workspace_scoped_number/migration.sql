-- Invoice numbering is a per-workspace sequence (see InvoicesService.nextNumber),
-- but `number` was only ever globally unique - so two workspaces both on the
-- default "INV-" prefix collide on their very first invoice. Denormalize
-- workspaceId onto Invoice (from client.workspaceId) and scope uniqueness there.

-- 1. Add the column nullable so the existing rows can be backfilled.
ALTER TABLE "invoices" ADD COLUMN "workspaceId" UUID;

-- 2. Backfill from each invoice's client.
UPDATE "invoices" i
SET "workspaceId" = c."workspaceId"
FROM "clients" c
WHERE c.id = i."clientId";

-- 3. Every row now has a value - enforce it going forward.
ALTER TABLE "invoices" ALTER COLUMN "workspaceId" SET NOT NULL;

-- 4. Replace the global uniqueness on `number` with a per-workspace one.
DROP INDEX "invoices_number_key";
CREATE UNIQUE INDEX "invoices_workspaceId_number_key" ON "invoices"("workspaceId", "number");

-- 5. Foreign key for the new relation.
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
