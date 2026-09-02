-- CreateTable
CREATE TABLE "Clubs" (
    "_id" UUID NOT NULL,
    "mongoId" TEXT,
    "Name" TEXT NOT NULL,
    "ClubCode" TEXT NOT NULL,
    "AttackingClass" INTEGER,
    "DefensiveClass" INTEGER,
    "Rating" INTEGER NOT NULL DEFAULT 0,
    "GK_Rating" INTEGER NOT NULL DEFAULT 0,
    "ATT_Rating" INTEGER NOT NULL DEFAULT 0,
    "DEF_Rating" INTEGER NOT NULL DEFAULT 0,
    "MID_Rating" INTEGER NOT NULL DEFAULT 0,
    "Manager" TEXT,
    "assets" JSONB,
    "Stats" JSONB,
    "Address" JSONB,
    "Budget" INTEGER,
    "Transactions" JSONB,
    "Records" JSONB[],
    "Stadium" JSONB,
    "LeagueCode" TEXT,
    "League" TEXT,
    "Players" TEXT[],
    "User" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clubs_pkey" PRIMARY KEY ("_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Clubs_mongoId_key" ON "Clubs"("mongoId");

-- CreateIndex
CREATE UNIQUE INDEX "Clubs_Name_key" ON "Clubs"("Name");

-- CreateIndex
CREATE UNIQUE INDEX "Clubs_ClubCode_key" ON "Clubs"("ClubCode");
