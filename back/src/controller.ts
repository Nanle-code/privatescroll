import { ObjectId } from "mongodb";
import { connectToDatabase } from "./database/mongodb";

export interface MidnightProofRecord {
  modifiedHash: string;
  verifiedAt: Date;
}

export interface DocumentModel {
  _id?: ObjectId;
  userAddress: string;
  documentTitle: string;
  content?: string;
  documentHash?: string;
  midnight_proofs: MidnightProofRecord[];
  blockchain_verified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentShareModel {
  _id?: ObjectId;
  shareId: string;
  documentId: ObjectId;
  documentHash: string;
  senderAddress: string;
  recipientKeyHash: string;
  accessLevel: "read" | "read_verify" | "full";
  status: "active" | "revoked";
  createdAt: Date;
  // The document's AES key, ECDH+AES-GCM-wrapped client-side for this
  // recipient's public key (see front/services/keys.ts). Ciphertext even
  // at rest here — only the recipient's private key, which never leaves
  // their browser, can unwrap it. Optional: shares created before this
  // field existed won't have it, and getSharedDocument's caller falls back
  // to showing ciphertext rather than failing.
  wrappedKey?: string;
  senderEncryptionPublicKey?: string;
}

export const createDocument = async (userAddress: string, documentTitle: string = "Untitled") => {
  const { db } = await connectToDatabase();
  const collection = db.collection<DocumentModel>("documents");
  const now = new Date();
  return collection.insertOne({
    userAddress,
    documentTitle,
    midnight_proofs: [],
    blockchain_verified: false,
    createdAt: now,
    updatedAt: now,
  });
};

export const getDocumentById = async (documentId: string) => {
  const { db } = await connectToDatabase();
  const collection = db.collection<DocumentModel>("documents");
  return collection.findOne({ _id: new ObjectId(documentId) });
};

export const getDocumentByIdAndOwner = async (documentId: string, userAddress: string) => {
  const { db } = await connectToDatabase();
  const collection = db.collection<DocumentModel>("documents");
  return collection.findOne({ _id: new ObjectId(documentId), userAddress });
};

export const getUserDocuments = async (userAddress: string, limit: number = 10, skip: number = 0) => {
  if (!limit || limit < 0) limit = 10;
  if (limit > 20) limit = 20;
  if (!skip || skip < 0) skip = 0;

  const { db } = await connectToDatabase();
  const collection = db.collection<DocumentModel>("documents");
  return collection.find({ userAddress }, { limit, skip }).project({ content: 0 }).toArray();
};

export const appendDocument = async (
  documentId: string,
  encryptedContent: string,
  documentTitle: string | undefined,
  documentHash: string,
  proofRecord: MidnightProofRecord,
) => {
  const { db } = await connectToDatabase();
  const collection = db.collection<DocumentModel>("documents");
  const update: Record<string, unknown> = {
    $set: {
      content: encryptedContent,
      documentHash,
      blockchain_verified: true,
      updatedAt: new Date(),
    },
    $push: { midnight_proofs: proofRecord },
  };
  if (documentTitle) {
    (update.$set as Record<string, unknown>).documentTitle = documentTitle;
  }
  await collection.updateOne({ _id: new ObjectId(documentId) }, update);
  return collection.findOne({ _id: new ObjectId(documentId) });
};

export const createDocumentShare = async (share: Omit<DocumentShareModel, "_id" | "createdAt" | "status">) => {
  const { db } = await connectToDatabase();
  const collection = db.collection<DocumentShareModel>("document_shares");
  const record: DocumentShareModel = { ...share, status: "active", createdAt: new Date() };
  await collection.insertOne(record);
  return record;
};

export const getDocumentShareByShareId = async (shareId: string) => {
  const { db } = await connectToDatabase();
  const collection = db.collection<DocumentShareModel>("document_shares");
  return collection.findOne({ shareId });
};

export const markDocumentShareRevoked = async (shareId: string) => {
  const { db } = await connectToDatabase();
  const collection = db.collection<DocumentShareModel>("document_shares");
  await collection.updateOne({ shareId }, { $set: { status: "revoked" } });
};

export interface SharedWithMeEntry {
  shareId: string;
  documentTitle: string;
  accessLevel: DocumentShareModel["accessLevel"];
  senderAddress: string;
  createdAt: Date;
}

/**
 * MongoDB-side convenience index for "what's been shared with me" — the
 * same pattern getUserDocuments already uses for "My Documents" (fast,
 * queryable, but not itself the source of truth). The actual access
 * verification a recipient relies on still happens for real, per share,
 * against the relayer's on-chain ledger when they open one from this list
 * (see verifySharedAccess in front/services/midnight.ts) — this only
 * saves them from needing to already have a shareId in hand to discover
 * that a share exists at all.
 */
export const getSharesForRecipient = async (recipientKeyHash: string): Promise<SharedWithMeEntry[]> => {
  const { db } = await connectToDatabase();
  const shares = await db
    .collection<DocumentShareModel>("document_shares")
    .find({ recipientKeyHash, status: "active" })
    .sort({ createdAt: -1 })
    .toArray();
  if (shares.length === 0) return [];

  const documentIds = shares.map((share) => share.documentId);
  const documents = await db
    .collection<DocumentModel>("documents")
    .find({ _id: { $in: documentIds } })
    .project({ documentTitle: 1 })
    .toArray();
  const titleById = new Map(documents.map((doc) => [doc._id!.toString(), doc.documentTitle]));

  return shares.map((share) => ({
    shareId: share.shareId,
    documentTitle: titleById.get(share.documentId.toString()) ?? "Untitled",
    accessLevel: share.accessLevel,
    senderAddress: share.senderAddress,
    createdAt: share.createdAt,
  }));
};
