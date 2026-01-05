-- CreateTable
CREATE TABLE "Competitions" (
    "_id" UUID NOT NULL,
    "mongoId" TEXT,
    "Name" TEXT NOT NULL,
    "Type" TEXT NOT NULL,
    "CompetitionCode" TEXT NOT NULL,
    "CompetitionID" TEXT NOT NULL,
    "League" BOOLEAN NOT NULL DEFAULT false,
    "Tournament" BOOLEAN NOT NULL DEFAULT false,
    "Cup" BOOLEAN NOT NULL DEFAULT false,
    "Division" INTEGER NOT NULL DEFAULT 0,
    "NumberOfTeams" INTEGER NOT NULL,
    "NumberOfWeeks" INTEGER NOT NULL,
    "TeamsPromoted" INTEGER,
    "TeamsRelegated" INTEGER,
    "Country" TEXT,
    "Clubs" TEXT[],
    "Seasons" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competitions_pkey" PRIMARY KEY ("_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Competitions_mongoId_key" ON "Competitions"("mongoId");

-- CreateIndex
CREATE UNIQUE INDEX "Competitions_CompetitionCode_key" ON "Competitions"("CompetitionCode");

-- CreateIndex
CREATE UNIQUE INDEX "Competitions_CompetitionID_key" ON "Competitions"("CompetitionID");
