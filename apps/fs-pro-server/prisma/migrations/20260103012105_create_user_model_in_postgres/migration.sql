-- CreateTable
CREATE TABLE "Users" (
    "_id" UUID NOT NULL,
    "mongoId" TEXT,
    "FullName" TEXT NOT NULL,
    "Password" TEXT NOT NULL,
    "Age" INTEGER,
    "Username" TEXT NOT NULL,
    "Avatar" TEXT NOT NULL DEFAULT 'default-avatar.png',
    "Alerts" JSONB,
    "Clubs" TEXT[],
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "Session" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Users_pkey" PRIMARY KEY ("_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Users_mongoId_key" ON "Users"("mongoId");

-- CreateIndex
CREATE UNIQUE INDEX "Users_Username_key" ON "Users"("Username");
