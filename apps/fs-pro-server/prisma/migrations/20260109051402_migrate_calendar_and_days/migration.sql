-- CreateTable
CREATE TABLE "Calendars" (
    "_id" UUID NOT NULL,
    "mongoId" TEXT,
    "Name" TEXT NOT NULL,
    "YearString" TEXT NOT NULL,
    "YearDigits" TEXT NOT NULL,
    "CurrentDay" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isEnded" BOOLEAN NOT NULL DEFAULT false,
    "allSeasonsCompleted" BOOLEAN NOT NULL DEFAULT false,
    "Days" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Calendars_pkey" PRIMARY KEY ("_id")
);

-- CreateTable
CREATE TABLE "Days" (
    "_id" UUID NOT NULL,
    "mongoId" TEXT,
    "Matches" JSONB[],
    "isFree" BOOLEAN NOT NULL,
    "Day" INTEGER,
    "Year" TEXT NOT NULL,
    "Calendar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Days_pkey" PRIMARY KEY ("_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Calendars_mongoId_key" ON "Calendars"("mongoId");

-- CreateIndex
CREATE UNIQUE INDEX "Days_mongoId_key" ON "Days"("mongoId");
