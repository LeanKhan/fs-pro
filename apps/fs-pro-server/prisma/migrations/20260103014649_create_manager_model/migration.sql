-- CreateTable
CREATE TABLE "Managers" (
    "_id" UUID NOT NULL,
    "mongoId" TEXT,
    "Key" TEXT NOT NULL,
    "FirstName" TEXT NOT NULL,
    "LastName" TEXT NOT NULL,
    "Age" INTEGER NOT NULL,
    "Picture" TEXT,
    "Club" TEXT,
    "Nationality" TEXT,
    "NationalTeam" BOOLEAN NOT NULL DEFAULT false,
    "Records" JSONB[],
    "isEmployed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Managers_pkey" PRIMARY KEY ("_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Managers_mongoId_key" ON "Managers"("mongoId");

-- CreateIndex
CREATE UNIQUE INDEX "Managers_Key_key" ON "Managers"("Key");
