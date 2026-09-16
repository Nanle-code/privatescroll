// PrivateScroll — storage backend for the relayer's ledger state.
//
// LocalDeployment (see localContractClient.ts) needs somewhere durable to
// keep each contract's serialized ContractState between requests. Locally
// that's just a file — simple, and fine for a machine that stays up. On a
// host with no persistent disk (e.g. Render's free web-service tier, whose
// filesystem resets on every restart or spin-down from inactivity), a file
// doesn't survive: the next request after a restart would find no
// registered authors, no recorded work-history proofs, no shares — every
// previously-saved document would silently become un-appendable, since its
// author registration would simply be gone. MongoLedgerStore below exists
// so a deployed relayer can keep this state in the same MongoDB cluster the
// backend already needs for document storage, which does survive restarts.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Binary, MongoClient, type Collection } from "mongodb";

export interface LedgerStore {
  hasState(): Promise<boolean>;
  loadState(): Promise<Uint8Array>;
  saveState(bytes: Uint8Array): Promise<void>;
  loadAddress(): Promise<string>;
  saveAddress(address: string): Promise<void>;
}

export class FileLedgerStore implements LedgerStore {
  private readonly ledgerPath: string;
  private readonly addressPath: string;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.ledgerPath = join(dataDir, "ledger.bin");
    this.addressPath = join(dataDir, "address.hex");
  }

  async hasState(): Promise<boolean> {
    return existsSync(this.ledgerPath);
  }

  async loadState(): Promise<Uint8Array> {
    return new Uint8Array(readFileSync(this.ledgerPath));
  }

  async saveState(bytes: Uint8Array): Promise<void> {
    writeFileSync(this.ledgerPath, bytes);
  }

  async loadAddress(): Promise<string> {
    return readFileSync(this.addressPath, "utf8");
  }

  async saveAddress(address: string): Promise<void> {
    writeFileSync(this.addressPath, address);
  }
}

type LedgerDoc = { _id: string; ledger: Binary; address: string };

let sharedClient: Promise<MongoClient> | null = null;

function getClient(uri: string): Promise<MongoClient> {
  if (!sharedClient) {
    sharedClient = new MongoClient(uri).connect();
  }
  return sharedClient;
}

export class MongoLedgerStore implements LedgerStore {
  private constructor(
    private readonly collection: Collection<LedgerDoc>,
    private readonly name: string,
  ) {}

  static async open(uri: string, dbName: string, name: string): Promise<MongoLedgerStore> {
    const client = await getClient(uri);
    const collection = client.db(dbName).collection<LedgerDoc>("relayer_ledger_state");
    return new MongoLedgerStore(collection, name);
  }

  async hasState(): Promise<boolean> {
    return (await this.collection.countDocuments({ _id: this.name })) > 0;
  }

  async loadState(): Promise<Uint8Array> {
    const doc = await this.collection.findOne({ _id: this.name });
    if (!doc) throw new Error(`No ledger state found for "${this.name}"`);
    return new Uint8Array(doc.ledger.buffer);
  }

  async saveState(bytes: Uint8Array): Promise<void> {
    await this.collection.updateOne({ _id: this.name }, { $set: { ledger: new Binary(Buffer.from(bytes)) } }, { upsert: true });
  }

  async loadAddress(): Promise<string> {
    const doc = await this.collection.findOne({ _id: this.name });
    if (!doc) throw new Error(`No ledger state found for "${this.name}"`);
    return doc.address;
  }

  async saveAddress(address: string): Promise<void> {
    await this.collection.updateOne({ _id: this.name }, { $set: { address } }, { upsert: true });
  }
}

/**
 * Picks the store based on environment: MONGODB_URI present means this is a
 * deployed relayer that needs durable state beyond local disk; its absence
 * (the default for local dev — see contracts/.env) keeps the existing
 * file-based behavior exactly as it was.
 */
export async function createLedgerStore(name: string, dataDir: string): Promise<LedgerStore> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    return new FileLedgerStore(join(dataDir, name));
  }
  const dbName = process.env.MONGODB_DB ?? "privatescroll";
  return MongoLedgerStore.open(uri, dbName, name);
}
