/*
  Warnings:

  - You are about to drop the column `active` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `pax` on the `Guest` table. All the data in the column will be lost.
  - The `role` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'ORGANIZER', 'STAFF');

-- CreateEnum
CREATE TYPE "CheckInMethod" AS ENUM ('QR', 'SEARCH');

-- AlterTable
ALTER TABLE "Event" DROP COLUMN "active",
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "themeColor" TEXT;

-- AlterTable
ALTER TABLE "Guest" DROP COLUMN "pax",
ADD COLUMN     "arrivedPax" INTEGER,
ADD COLUMN     "invitedPax" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "PhotoLog" ADD COLUMN     "waError" TEXT,
ADD COLUMN     "waMessageId" TEXT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "role",
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'ADMIN';

-- CreateTable
CREATE TABLE "CheckInLog" (
    "id" SERIAL NOT NULL,
    "arrivedPax" INTEGER NOT NULL,
    "method" "CheckInMethod" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "guestId" INTEGER NOT NULL,
    "eventId" INTEGER NOT NULL,
    "staffId" INTEGER,

    CONSTRAINT "CheckInLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CheckInLog" ADD CONSTRAINT "CheckInLog_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInLog" ADD CONSTRAINT "CheckInLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInLog" ADD CONSTRAINT "CheckInLog_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
