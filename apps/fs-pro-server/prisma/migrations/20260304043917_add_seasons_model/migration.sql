-- CreateTable
CREATE TABLE "Seasons" (
    "_id" UUID NOT NULL,
    "mongoId" TEXT,
    "SeasonCode" TEXT NOT NULL,
    "Title" TEXT NOT NULL,
    "StartDate" TIMESTAMP(3) NOT NULL,
    "EndDate" TIMESTAMP(3) NOT NULL,
    "Winner" TEXT,
    "Promoted" TEXT[],
    "Relegated" TEXT[],
    "isFinished" BOOLEAN NOT NULL DEFAULT false,
    "isStarted" BOOLEAN NOT NULL DEFAULT false,
    "Status" TEXT NOT NULL DEFAULT 'Pending',
    "Year" TEXT,
    "Calendar" TEXT,
    "Competition" TEXT,
    "CompetitionCode" TEXT NOT NULL,
    "Fixtures" TEXT[],
    "Standings" JSONB[],
    "Logs" JSONB[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Seasons_pkey" PRIMARY KEY ("_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Seasons_mongoId_key" ON "Seasons"("mongoId");

-- CreateIndex
CREATE UNIQUE INDEX "Seasons_SeasonCode_key" ON "Seasons"("SeasonCode");
