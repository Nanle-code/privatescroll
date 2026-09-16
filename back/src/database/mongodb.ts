import { MongoClient, Db } from "mongodb";

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB;

  if (!uri) {
    throw new Error("Please define the MONGODB_URI environment variable");
  }
  if (!dbName) {
    throw new Error("Please define the MONGODB_DB environment variable");
  }

  const client = await MongoClient.connect(uri);
  const db = client.db(dbName);

  await db.collection("document_shares").createIndex({ shareId: 1 }, { unique: true });

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}
