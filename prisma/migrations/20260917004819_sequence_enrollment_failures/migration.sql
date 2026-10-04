-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SequenceEnrollmentStatus" ADD VALUE 'FAILED';
ALTER TYPE "SequenceEnrollmentStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "wa_sequence_enrollments" ADD COLUMN     "last_error" TEXT,
ADD COLUMN     "send_attempts" INTEGER NOT NULL DEFAULT 0;

