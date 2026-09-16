// PrivateScroll — persistent local MongoDB for dev use.
//
// There's no system-wide `mongod` in this environment and no Docker to run
// one in a container. mongodb-memory-server downloads a real mongod binary
// and runs it directly — this script just points it at a fixed, persistent
// data directory instead of a throwaway temp one, so data survives restarts
// across dev sessions. Standard port (27017) so back/.env's default
// MONGODB_URI works unmodified.

import { MongoMemoryServer } from "mongodb-memory-server";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, ".mongodb-data");
mkdirSync(dbPath, { recursive: true });

const mongod = await MongoMemoryServer.create({
  instance: { port: 27017, dbName: "privatescroll", dbPath, storageEngine: "wiredTiger" },
});

console.log(`PrivateScroll dev MongoDB running at ${mongod.getUri()}`);
console.log(`Data persisted under ${dbPath}`);

process.on("SIGTERM", async () => {
  await mongod.stop();
  process.exit(0);
});
process.on("SIGINT", async () => {
  await mongod.stop();
  process.exit(0);
});
