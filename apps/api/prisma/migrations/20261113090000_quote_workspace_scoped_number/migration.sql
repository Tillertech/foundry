-- 1. Add the column nullable so the existing rows can be backfilled.
ALTER TABLE "quotes" ADD COLUMN "workspaceId" UUID;

-- 2. Backfill from each quote's client (a client never changes workspace).
UPDATE "quotes" q
SET "workspaceId" = c."workspaceId"
FROM "clients" c
WHERE c.id = q."clientId";

-- 3. Every row now has a value - enforce it going forward.
ALTER TABLE "quotes" ALTER COLUMN "workspaceId" SET NOT NULL;

-- 4. Replace the global uniqueness on `number` with a per-workspace one.
DROP INDEX "quotes_number_key";
CREATE UNIQUE INDEX "quotes_workspaceId_number_key" ON "quotes"("workspaceId", "number");

-- 5. Foreign key for the new relation.
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
