-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "safetyLevel" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Rover" ("batteryCapacity", "batteryCharge", "batteryLevel", "capacity", "capacityLevel", "createdAt", "efficiency", "efficiencyLevel", "id", "name", "speed", "speedLevel", "status", "updatedAt") SELECT "batteryCapacity", "batteryCharge", "batteryLevel", "capacity", "capacityLevel", "createdAt", "efficiency", "efficiencyLevel", "id", "name", "speed", "speedLevel", "status", "updatedAt" FROM "Rover";
DROP TABLE "Rover";
ALTER TABLE "new_Rover" RENAME TO "Rover";
CREATE UNIQUE INDEX "Rover_name_key" ON "Rover"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
