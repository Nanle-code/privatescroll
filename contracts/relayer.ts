// PrivateScroll — local dev relayer.
//
// The production path is a browser wallet (Lace) submitting real proofs
// to a live Midnight node + indexer + proof server. That stack needs
// Docker, which is not available in this environment (see README in this
// directory / the project's Phase C notes). Rather than ship unverifiable
// browser-wallet wiring, this relayer exposes the same real
// LocalPrivateScrollClient — running the actual compiled Compact circuits
// via @midnight-ntwrk/compact-runtime — over a small local HTTP API, so
// front/services/midnight.ts makes real contract calls end-to-end today.
// It is a local dev relayer, not a mock: every request executes real
// compiled circuit logic and real asserts.

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { AccessLevel, LocalPrivateScrollClient } from "./localContractClient.js";
import { createPrivateScrollPrivateState } from "./witnesses.js";
import { identitySecretPath, loadOrCreateSecretKey } from "./identity.js";
import { fromHex, toHex } from "./hex.js";
import { pureCircuits } from "./managed/authorship/contract/index.js";

const DATA_DIR = process.env.PRIVATESCROLL_DATA_DIR ?? ".privatescroll";
const PORT = Number(process.env.PRIVATESCROLL_RELAYER_PORT ?? 8788);

const client = LocalPrivateScrollClient.open(DATA_DIR);

const privateStateFor = (identity: string, writeCount = 0n) => {
  const secretKey = loadOrCreateSecretKey(identitySecretPath(DATA_DIR, identity));
  return createPrivateScrollPrivateState(secretKey, writeCount);
};

const accessLevelFromString = (value: string): AccessLevel => {
  switch (value) {
    case "read":
      return AccessLevel.Read;
    case "read_verify":
      return AccessLevel.ReadVerify;
    case "full":
      return AccessLevel.Full;
    default:
      throw new Error(`unknown access level: ${value}`);
  }
};

const accessLevelToString = (value: AccessLevel): "read" | "read_verify" | "full" => {
  switch (value) {
    case AccessLevel.Read:
      return "read";
    case AccessLevel.ReadVerify:
      return "read_verify";
    case AccessLevel.Full:
      return "full";
  }
};

const app = express();
app.use(cors());
app.use(express.json());

const handle = (fn: (req: express.Request) => Promise<unknown>) => async (
  req: express.Request,
  res: express.Response,
) => {
  try {
    const result = await fn(req);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};

app.get("/status", (_req, res) => res.json({ ok: true }));

app.post(
  "/identity/:identity",
  handle(async (req) => {
    const secretKey = loadOrCreateSecretKey(identitySecretPath(DATA_DIR, req.params.identity));
    return { authorKeyHash: toHex(pureCircuits.authorKeyHash(secretKey)) };
  }),
);

app.post(
  "/authorship/prove",
  handle(async (req) => {
    const { identity, documentHash } = req.body;
    const author = await client.proveAuthorship(privateStateFor(identity), fromHex(documentHash));
    return { author: toHex(author) };
  }),
);

app.post(
  "/authorship/prove-work-history",
  handle(async (req) => {
    const { identity, documentHash, modifiedHash, numPastes, writeCount } = req.body;
    const passed = await client.proveWorkHistory(
      privateStateFor(identity, BigInt(writeCount)),
      fromHex(documentHash),
      fromHex(modifiedHash),
      BigInt(numPastes),
    );
    return { passed };
  }),
);

app.post(
  "/authorship/prove-anonymous",
  handle(async (req) => {
    const { identity, documentHash } = req.body;
    const match = await client.proveAuthorshipAnonymous(privateStateFor(identity), fromHex(documentHash));
    return { match };
  }),
);

app.post(
  "/authorship/prove-with-identity",
  handle(async (req) => {
    const { identity, documentHash } = req.body;
    const author = await client.proveAuthorshipWithIdentity(privateStateFor(identity), fromHex(documentHash));
    return { author: toHex(author) };
  }),
);

app.post(
  "/authorship/share/authorize",
  handle(async (req) => {
    const { identity, documentHash, recipientKeyHash, accessLevel, nonce } = req.body;
    const shareId = await client.authorizeDocumentShare(
      privateStateFor(identity),
      fromHex(documentHash),
      fromHex(recipientKeyHash),
      accessLevelFromString(accessLevel),
      fromHex(nonce),
    );
    return { shareId: toHex(shareId) };
  }),
);

app.post(
  "/authorship/share/revoke",
  handle(async (req) => {
    const { identity, shareId } = req.body;
    await client.revokeDocumentShare(privateStateFor(identity), fromHex(shareId));
    return { revoked: true };
  }),
);

app.post(
  "/authorship/share/verify",
  handle(async (req) => {
    const { identity, shareId } = req.body;
    const accessLevel = await client.verifyReadPermission(privateStateFor(identity), fromHex(shareId));
    return { accessLevel: accessLevelToString(accessLevel) };
  }),
);

app.post(
  "/change/prove",
  handle(async (req) => {
    const { identity, originalHash, modifiedHash, salt } = req.body;
    const commitment = await client.proveDocumentChange(
      privateStateFor(identity),
      fromHex(originalHash),
      fromHex(modifiedHash),
      fromHex(salt),
    );
    return { commitment: toHex(commitment) };
  }),
);

app.post(
  "/change/prove-by-author",
  handle(async (req) => {
    const { identity, originalHash, modifiedHash, salt } = req.body;
    const commitment = await client.proveChangeByAuthor(
      privateStateFor(identity),
      fromHex(originalHash),
      fromHex(modifiedHash),
      fromHex(salt),
    );
    return { commitment: toHex(commitment) };
  }),
);

app.get(
  "/ledger/authorship",
  handle(async () => {
    const ledger = await client.readAuthorshipLedger();
    return {
      documentAuthorCount: ledger.documentAuthor.size().toString(),
      workProofCount: ledger.workProofs.size().toString(),
      shareCount: ledger.shares.size().toString(),
    };
  }),
);

// --- verification endpoints -----------------------------------------------
// Read-only checks a caller (typically the backend, server-to-server) uses
// to independently confirm a proof was actually recorded on-chain, instead
// of trusting a client-reported pass/fail flag.

app.get(
  "/ledger/authorship/document/:documentHash",
  handle(async (req) => {
    const ledger = await client.readAuthorshipLedger();
    const documentHash = fromHex(req.params.documentHash);
    const registered = ledger.documentAuthor.member(documentHash);
    return registered ? { registered, author: toHex(ledger.documentAuthor.lookup(documentHash)) } : { registered };
  }),
);

app.get(
  "/ledger/authorship/work-proof",
  handle(async (req) => {
    const { documentHash, modifiedHash } = req.query as { documentHash?: string; modifiedHash?: string };
    if (!documentHash || !modifiedHash) {
      throw new Error("documentHash and modifiedHash query params are required");
    }
    const proofId = pureCircuits.workProofId(fromHex(documentHash), fromHex(modifiedHash));
    const ledger = await client.readAuthorshipLedger();
    return { recorded: ledger.workProofs.member(proofId) };
  }),
);

app.get(
  "/ledger/authorship/share/:shareId",
  handle(async (req) => {
    const ledger = await client.readAuthorshipLedger();
    const shareId = fromHex(req.params.shareId);
    if (!ledger.shares.member(shareId)) {
      return { exists: false };
    }
    const grant = ledger.shares.lookup(shareId);
    return {
      exists: true,
      senderKeyHash: toHex(grant.senderKeyHash),
      documentHash: toHex(grant.documentHash),
      recipientKeyHash: toHex(grant.recipientKeyHash),
      accessLevel: accessLevelToString(grant.accessLevel),
      revoked: grant.revoked,
    };
  }),
);

app.get(
  "/ledger/document-change",
  handle(async () => {
    const ledger = await client.readDocumentChangeLedger();
    return {
      versionCount: ledger.latestVersion.size().toString(),
      nullifierCount: ledger.changeNullifiers.size().toString(),
    };
  }),
);

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`PrivateScroll local relayer listening on http://localhost:${PORT}`);
  });
}

export { app };
