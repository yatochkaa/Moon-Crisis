/*
  Warnings:

  - You are about to drop the column `credits` on the `GameSession` table. All the data in the column will be lost.
  - You are about to drop the column `battery` on the `Rover` table. All the data in the column will be lost.
  - Added the required column `completesAt` to the `Delivery` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startedAt` to the `Delivery` table without a default value. This is not possible if the table is not empty.
  - Added the required column `status` to the `Delivery` table without a default value. This is not possible if the table is not empty.
  - Added the required column `balanceCredits` to the `GameSession` table without a default value. This is not possible if the table is not empty.
  - Added the required column `earnedCredits` to the `GameSession` table without a default value. This is not possible if the table is not empty.
  - Added the required column `batteryCapacity` to the `Rover` table without a default value. This is not possible if the table is not empty.
  - Added the required column `batteryCharge` to the `Rover` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Delivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameSessionId" TEXT NOT NULL,
    "roverId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "calculatedBatteryCost" INTEGER NOT NULL,
    "calculatedRisk" INTEGER NOT NULL,
    "calculatedDuration" INTEGER NOT NULL,
    "reward" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "completesAt" DATETIME NOT NULL,
    "result" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Delivery_gameSessionId_fkey" FOREIGN KEY ("gameSessionId") REFERENCES "GameSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Delivery_roverId_fkey" FOREIGN KEY ("roverId") REFERENCES "Rover" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Delivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Delivery" ("calculatedBatteryCost", "calculatedDuration", "calculatedRisk", "createdAt", "gameSessionId", "id", "idempotencyKey", "orderId", "result", "reward", "roverId") SELECT "calculatedBatteryCost", "calculatedDuration", "calculatedRisk", "createdAt", "gameSessionId", "id", "idempotencyKey", "orderId", "result", "reward", "roverId" FROM "Delivery";
DROP TABLE "Delivery";
ALTER TABLE "new_Delivery" RENAME TO "Delivery";
CREATE UNIQUE INDEX "Delivery_idempotencyKey_key" ON "Delivery"("idempotencyKey");
CREATE INDEX "Delivery_gameSessionId_idx" ON "Delivery"("gameSessionId");
CREATE INDEX "Delivery_orderId_idx" ON "Delivery"("orderId");
CREATE INDEX "Delivery_roverId_idx" ON "Delivery"("roverId");
CREATE TABLE "new_GameSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "currentDay" INTEGER NOT NULL,
    "maxDays" INTEGER NOT NULL,
    "balanceCredits" INTEGER NOT NULL,
    "earnedCredits" INTEGER NOT NULL,
    "targetCredits" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "minimumRating" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_GameSession" ("createdAt", "currentDay", "id", "maxDays", "minimumRating", "rating", "status", "targetCredits", "updatedAt") SELECT "createdAt", "currentDay", "id", "maxDays", "minimumRating", "rating", "status", "targetCredits", "updatedAt" FROM "GameSession";
DROP TABLE "GameSession";
ALTER TABLE "new_GameSession" RENAME TO "GameSession";
CREATE TABLE "new_Rover" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "batteryCharge" INTEGER NOT NULL,
    "batteryCapacity" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "speed" REAL NOT NULL,
    "efficiency" REAL NOT NULL,
    "capacityLevel" INTEGER NOT NULL DEFAULT 0,
    "speedLevel" INTEGER NOT NULL DEFAULT 0,
    "efficiencyLevel" INTEGER NOT NULL DEFAULT 0,
    "batteryLevel" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Rover" ("capacity", "createdAt", "efficiency", "id", "name", "speed", "status", "updatedAt") SELECT "capacity", "createdAt", "efficiency", "id", "name", "speed", "status", "updatedAt" FROM "Rover";
DROP TABLE "Rover";
ALTER TABLE "new_Rover" RENAME TO "Rover";
CREATE UNIQUE INDEX "Rover_name_key" ON "Rover"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
