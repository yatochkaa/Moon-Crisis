-- CreateTable
CREATE TABLE "GameSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "currentDay" INTEGER NOT NULL,
    "maxDays" INTEGER NOT NULL,
    "credits" INTEGER NOT NULL,
    "targetCredits" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "minimumRating" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "distance" REAL NOT NULL,
    "zoneType" TEXT NOT NULL,
    "batteryModifier" REAL NOT NULL,
    "speedModifier" REAL NOT NULL,
    "riskBonus" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Rover" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "battery" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "speed" REAL NOT NULL,
    "efficiency" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "reward" INTEGER NOT NULL,
    "urgency" TEXT NOT NULL,
    "baseRisk" INTEGER NOT NULL,
    "deadlineDay" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameSessionId" TEXT NOT NULL,
    "roverId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "calculatedBatteryCost" INTEGER NOT NULL,
    "calculatedRisk" INTEGER NOT NULL,
    "calculatedDuration" INTEGER NOT NULL,
    "reward" INTEGER NOT NULL,
    "result" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Delivery_gameSessionId_fkey" FOREIGN KEY ("gameSessionId") REFERENCES "GameSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Delivery_roverId_fkey" FOREIGN KEY ("roverId") REFERENCES "Rover" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Delivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GameEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameSessionId" TEXT NOT NULL,
    "deliveryId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" TEXT,
    "day" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GameEvent_gameSessionId_fkey" FOREIGN KEY ("gameSessionId") REFERENCES "GameSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GameEvent_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Location_name_key" ON "Location"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Rover_name_key" ON "Rover"("name");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_locationId_idx" ON "Order"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_idempotencyKey_key" ON "Delivery"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Delivery_gameSessionId_idx" ON "Delivery"("gameSessionId");

-- CreateIndex
CREATE INDEX "Delivery_orderId_idx" ON "Delivery"("orderId");

-- CreateIndex
CREATE INDEX "Delivery_roverId_idx" ON "Delivery"("roverId");

-- CreateIndex
CREATE INDEX "GameEvent_gameSessionId_createdAt_idx" ON "GameEvent"("gameSessionId", "createdAt");
