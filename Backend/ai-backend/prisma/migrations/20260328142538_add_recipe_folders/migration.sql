-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "folderId" INTEGER;

-- CreateTable
CREATE TABLE "RecipeFolder" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecipeFolder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecipeFolder_userId_name_key" ON "RecipeFolder"("userId", "name");

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "RecipeFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeFolder" ADD CONSTRAINT "RecipeFolder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
