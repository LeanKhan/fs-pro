/*
  Warnings:

  - A unique constraint covering the columns `[mongoId]` on the table `Places` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Places" ADD COLUMN     "mongoId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Places_mongoId_key" ON "Places"("mongoId");
