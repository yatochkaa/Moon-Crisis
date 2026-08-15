-- Adds the challenge-contract flag to orders (Task 3).
ALTER TABLE "Order" ADD COLUMN "isChallenge" BOOLEAN NOT NULL DEFAULT false;
