/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `clientPortal` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `slug` to the `clientPortal` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "clientPortal" ADD COLUMN     "slug" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "clientPortal_slug_key" ON "clientPortal"("slug");
