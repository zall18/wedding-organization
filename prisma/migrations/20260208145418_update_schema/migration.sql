/*
  Warnings:

  - The values [QR,SEARCH] on the enum `CheckInMethod` will be removed. If these variants are still used in the database, this will fail.
  - The values [PENDING,PRESENT] on the enum `GuestStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [ORGANIZER] on the enum `UserRole` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `arrivedPax` on the `CheckInLog` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `CheckInLog` table. All the data in the column will be lost.
  - You are about to drop the column `staffId` on the `CheckInLog` table. All the data in the column will be lost.
  - You are about to drop the column `location` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `themeColor` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `arrivedPax` on the `Guest` table. All the data in the column will be lost.
  - You are about to drop the column `checkInTime` on the `Guest` table. All the data in the column will be lost.
  - You are about to drop the column `invitedPax` on the `Guest` table. All the data in the column will be lost.
  - You are about to alter the column `phone` on the `Guest` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(20)`.
  - You are about to drop the `PhotoLog` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[photoId]` on the table `CheckInLog` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[shortCode]` on the table `Event` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[shortId]` on the table `Guest` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[eventId,phone]` on the table `Guest` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `address` to the `Event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `brideName` to the `Event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `endTime` to the `Event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `groomName` to the `Event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shortCode` to the `Event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startTime` to the `Event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `venueName` to the `Event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `venueType` to the `Event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `weddingTitle` to the `Event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shortId` to the `Guest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Guest` table without a default value. This is not possible if the table is not empty.
  - Made the column `phone` on table `Guest` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `updatedAt` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "InvitationType" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "VenueType" AS ENUM ('INDOOR', 'OUTDOOR', 'BALLROOM', 'GARDEN', 'BEACH', 'MASJID', 'CHURCH', 'TEMPLE', 'VENUE');

-- CreateEnum
CREATE TYPE "PhotoDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENDING', 'DELIVERED', 'FAILED');

-- AlterEnum
BEGIN;
CREATE TYPE "CheckInMethod_new" AS ENUM ('QR_SCAN', 'MANUAL_SEARCH', 'MANUAL_ENTRY');
ALTER TABLE "CheckInLog" ALTER COLUMN "method" TYPE "CheckInMethod_new" USING ("method"::text::"CheckInMethod_new");
ALTER TYPE "CheckInMethod" RENAME TO "CheckInMethod_old";
ALTER TYPE "CheckInMethod_new" RENAME TO "CheckInMethod";
DROP TYPE "CheckInMethod_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "GuestStatus_new" AS ENUM ('INVITED', 'CONFIRMED', 'ATTENDED', 'CANCELLED', 'NO_SHOW');
ALTER TABLE "Guest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Guest" ALTER COLUMN "status" TYPE "GuestStatus_new" USING ("status"::text::"GuestStatus_new");
ALTER TYPE "GuestStatus" RENAME TO "GuestStatus_old";
ALTER TYPE "GuestStatus_new" RENAME TO "GuestStatus";
DROP TYPE "GuestStatus_old";
ALTER TABLE "Guest" ALTER COLUMN "status" SET DEFAULT 'INVITED';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'STAFF');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'STAFF';
COMMIT;

-- DropForeignKey
ALTER TABLE "CheckInLog" DROP CONSTRAINT "CheckInLog_staffId_fkey";

-- DropForeignKey
ALTER TABLE "PhotoLog" DROP CONSTRAINT "PhotoLog_eventId_fkey";

-- DropForeignKey
ALTER TABLE "PhotoLog" DROP CONSTRAINT "PhotoLog_guestId_fkey";

-- AlterTable
ALTER TABLE "CheckInLog" DROP COLUMN "arrivedPax",
DROP COLUMN "createdAt",
DROP COLUMN "staffId",
ADD COLUMN     "arrivedCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "checkedInById" INTEGER,
ADD COLUMN     "deviceBrowser" TEXT,
ADD COLUMN     "deviceType" TEXT,
ADD COLUMN     "photoId" INTEGER;

-- AlterTable
ALTER TABLE "Event" DROP COLUMN "location",
DROP COLUMN "name",
DROP COLUMN "themeColor",
ADD COLUMN     "address" TEXT NOT NULL,
ADD COLUMN     "allowPhotoOnCheckIn" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "attendedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "autoSendPhotoToWA" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "brideName" TEXT NOT NULL,
ADD COLUMN     "confirmedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "coverImageUrl" TEXT,
ADD COLUMN     "enableRSVP" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "endTime" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "googleMapsUrl" TEXT,
ADD COLUMN     "groomName" TEXT NOT NULL,
ADD COLUMN     "invitationType" "InvitationType" NOT NULL DEFAULT 'PRIVATE',
ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "primaryColor" TEXT NOT NULL DEFAULT '#7C3AED',
ADD COLUMN     "shortCode" VARCHAR(6) NOT NULL,
ADD COLUMN     "showLiveCount" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "startTime" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "totalGuests" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "venueName" TEXT NOT NULL,
ADD COLUMN     "venueType" "VenueType" NOT NULL,
ADD COLUMN     "weddingTitle" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Guest" DROP COLUMN "arrivedPax",
DROP COLUMN "checkInTime",
DROP COLUMN "invitedPax",
ADD COLUMN     "checkedInAt" TIMESTAMP(3),
ADD COLUMN     "checkedInBy" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "groupName" TEXT,
ADD COLUMN     "invitedCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "plusOneAllowed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rsvpDate" TIMESTAMP(3),
ADD COLUMN     "rsvpNote" TEXT,
ADD COLUMN     "rsvpStatus" TEXT DEFAULT 'PENDING',
ADD COLUMN     "shortId" VARCHAR(8) NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "waMessageId" TEXT,
ALTER COLUMN "phone" SET NOT NULL,
ALTER COLUMN "phone" SET DATA TYPE VARCHAR(20),
ALTER COLUMN "category" SET DEFAULT 'REGULAR',
ALTER COLUMN "status" SET DEFAULT 'INVITED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "phone" VARCHAR(20),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "role" SET DEFAULT 'STAFF';

-- DropTable
DROP TABLE "PhotoLog";

-- CreateTable
CREATE TABLE "EventPhoto" (
    "id" SERIAL NOT NULL,
    "filename" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "thumbnailPath" TEXT,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "eventId" INTEGER NOT NULL,
    "guestId" INTEGER,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "takenById" INTEGER,
    "waStatus" "PhotoDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "waMessageId" TEXT,
    "waError" TEXT,
    "waSentAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),

    CONSTRAINT "EventPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppLog" (
    "id" SERIAL NOT NULL,
    "messageId" TEXT NOT NULL,
    "templateId" TEXT,
    "toPhone" VARCHAR(20) NOT NULL,
    "toName" TEXT,
    "messageType" TEXT NOT NULL DEFAULT 'PHOTO',
    "caption" TEXT,
    "photoId" INTEGER,
    "guestId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "error" TEXT,
    "eventId" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),

    CONSTRAINT "WhatsAppLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestWish" (
    "id" SERIAL NOT NULL,
    "message" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "fromPhone" VARCHAR(20),
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "eventId" INTEGER NOT NULL,
    "guestId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestWish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventStats" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "totalGuests" INTEGER NOT NULL DEFAULT 0,
    "guestsArrived" INTEGER NOT NULL DEFAULT 0,
    "guestsPending" INTEGER NOT NULL DEFAULT 0,
    "checkInsLastHour" INTEGER NOT NULL DEFAULT 0,
    "peakHour" TEXT,
    "photosTaken" INTEGER NOT NULL DEFAULT 0,
    "photosSent" INTEGER NOT NULL DEFAULT 0,
    "photosFailed" INTEGER NOT NULL DEFAULT 0,
    "snapshotTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventPhoto_eventId_takenAt_idx" ON "EventPhoto"("eventId", "takenAt");

-- CreateIndex
CREATE INDEX "EventPhoto_guestId_idx" ON "EventPhoto"("guestId");

-- CreateIndex
CREATE INDEX "EventPhoto_waStatus_idx" ON "EventPhoto"("waStatus");

-- CreateIndex
CREATE INDEX "EventPhoto_takenById_idx" ON "EventPhoto"("takenById");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppLog_messageId_key" ON "WhatsAppLog"("messageId");

-- CreateIndex
CREATE INDEX "WhatsAppLog_eventId_sentAt_idx" ON "WhatsAppLog"("eventId", "sentAt");

-- CreateIndex
CREATE INDEX "WhatsAppLog_toPhone_idx" ON "WhatsAppLog"("toPhone");

-- CreateIndex
CREATE INDEX "WhatsAppLog_guestId_idx" ON "WhatsAppLog"("guestId");

-- CreateIndex
CREATE INDEX "WhatsAppLog_photoId_idx" ON "WhatsAppLog"("photoId");

-- CreateIndex
CREATE INDEX "WhatsAppLog_status_idx" ON "WhatsAppLog"("status");

-- CreateIndex
CREATE INDEX "GuestWish_eventId_createdAt_idx" ON "GuestWish"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "GuestWish_guestId_idx" ON "GuestWish"("guestId");

-- CreateIndex
CREATE INDEX "EventStats_eventId_idx" ON "EventStats"("eventId");

-- CreateIndex
CREATE INDEX "EventStats_snapshotTime_idx" ON "EventStats"("snapshotTime");

-- CreateIndex
CREATE UNIQUE INDEX "EventStats_eventId_snapshotTime_key" ON "EventStats"("eventId", "snapshotTime");

-- CreateIndex
CREATE UNIQUE INDEX "CheckInLog_photoId_key" ON "CheckInLog"("photoId");

-- CreateIndex
CREATE INDEX "CheckInLog_eventId_checkedInAt_idx" ON "CheckInLog"("eventId", "checkedInAt");

-- CreateIndex
CREATE INDEX "CheckInLog_guestId_idx" ON "CheckInLog"("guestId");

-- CreateIndex
CREATE INDEX "CheckInLog_checkedInById_idx" ON "CheckInLog"("checkedInById");

-- CreateIndex
CREATE INDEX "CheckInLog_method_idx" ON "CheckInLog"("method");

-- CreateIndex
CREATE UNIQUE INDEX "Event_shortCode_key" ON "Event"("shortCode");

-- CreateIndex
CREATE INDEX "Event_slug_idx" ON "Event"("slug");

-- CreateIndex
CREATE INDEX "Event_shortCode_idx" ON "Event"("shortCode");

-- CreateIndex
CREATE INDEX "Event_isActive_isPublished_idx" ON "Event"("isActive", "isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "Guest_shortId_key" ON "Guest"("shortId");

-- CreateIndex
CREATE INDEX "Guest_eventId_idx" ON "Guest"("eventId");

-- CreateIndex
CREATE INDEX "Guest_phone_idx" ON "Guest"("phone");

-- CreateIndex
CREATE INDEX "Guest_qrCode_idx" ON "Guest"("qrCode");

-- CreateIndex
CREATE INDEX "Guest_shortId_idx" ON "Guest"("shortId");

-- CreateIndex
CREATE INDEX "Guest_status_idx" ON "Guest"("status");

-- CreateIndex
CREATE INDEX "Guest_category_idx" ON "Guest"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Guest_eventId_phone_key" ON "Guest"("eventId", "phone");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_eventId_idx" ON "User"("eventId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- AddForeignKey
ALTER TABLE "CheckInLog" ADD CONSTRAINT "CheckInLog_checkedInById_fkey" FOREIGN KEY ("checkedInById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInLog" ADD CONSTRAINT "CheckInLog_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "EventPhoto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPhoto" ADD CONSTRAINT "EventPhoto_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPhoto" ADD CONSTRAINT "EventPhoto_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPhoto" ADD CONSTRAINT "EventPhoto_takenById_fkey" FOREIGN KEY ("takenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppLog" ADD CONSTRAINT "WhatsAppLog_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "EventPhoto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppLog" ADD CONSTRAINT "WhatsAppLog_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppLog" ADD CONSTRAINT "WhatsAppLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestWish" ADD CONSTRAINT "GuestWish_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestWish" ADD CONSTRAINT "GuestWish_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventStats" ADD CONSTRAINT "EventStats_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
