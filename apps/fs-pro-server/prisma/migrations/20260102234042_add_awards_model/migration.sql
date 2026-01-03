-- CreateTable
CREATE TABLE "Awards" (
    "_id" UUID NOT NULL,
    "mongoId" TEXT,
    "Name" TEXT NOT NULL,
    "Type" TEXT NOT NULL,
    "Period" TEXT NOT NULL,
    "Category" TEXT NOT NULL,
    "Recipient" TEXT NOT NULL,
    "Club" TEXT,
    "Remarks" TEXT,
    "Season" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Awards_pkey" PRIMARY KEY ("_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Awards_mongoId_key" ON "Awards"("mongoId");
