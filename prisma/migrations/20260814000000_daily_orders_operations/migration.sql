-- AlterTable: track the number of delivery operations started on the current day.
ALTER TABLE "GameSession" ADD COLUMN "operationsToday" INTEGER NOT NULL DEFAULT 0;
