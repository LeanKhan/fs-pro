-- CreateTable
CREATE TABLE "Places" (
    "_id" UUID NOT NULL,
    "Fullname" TEXT NOT NULL,
    "Name" TEXT NOT NULL,
    "Code" TEXT NOT NULL,
    "Region" TEXT,
    "Type" TEXT,
    "Picture" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Places_pkey" PRIMARY KEY ("_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Places_Code_key" ON "Places"("Code");
