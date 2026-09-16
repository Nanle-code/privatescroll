// PrivateScroll — end-to-end smoke test for the backend, against a real
// in-memory MongoDB (mongodb-memory-server) and a running relayer
// (contracts/relayer.ts must already be up — npm run relayer there).
// Run with: npm run verify (from privatescroll/back)

import { createHash } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.NODE_ENV = "test";

const RELAYER_URL = process.env.MIDNIGHT_RELAYER_URL || "http://localhost:8788";

const sha256Hex = (text: string): string => createHash("sha256").update(text).digest("hex");
const randomHex32 = (): string => createHash("sha256").update(Math.random().toString()).digest("hex");

let passCount = 0;
let failCount = 0;

function expect(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passCount++;
    console.log(`  PASS  ${label}`);
  } else {
    failCount++;
    console.log(`  FAIL  ${label}`, detail ?? "");
  }
}

async function relayerPost(path: string, body: unknown) {
  const res = await fetch(`${RELAYER_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return res.json() as Promise<{ ok: boolean; result?: any; error?: string }>;
}

async function main() {
  const status = await fetch(`${RELAYER_URL}/status`).then((r) => r.json()).catch(() => null);
  if (!(status as any)?.ok) {
    console.error(`Relayer not reachable at ${RELAYER_URL}. Start it first: cd ../contracts && npm run relayer`);
    process.exit(1);
  }

  console.log("Starting in-memory MongoDB...");
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = "privatescroll_e2e";

  const { default: app } = await import("./src/index");
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const BACKEND_URL = `http://localhost:${port}/api`;

  async function backendPost(path: string, body: unknown) {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    return { status: res.status, body: await res.json() };
  }

  async function backendGet(path: string) {
    const res = await fetch(`${BACKEND_URL}${path}`);
    return { status: res.status, body: await res.json() };
  }

  console.log("\n-- setup --");
  // Secrets generated here exactly as a browser would (see
  // front/services/midnight.ts's getUserSecretKey) — the relayer never
  // generates or persists these; "alice"/"bob" below are only backend/
  // MongoDB bookkeeping labels (userAddress), entirely separate from the
  // on-chain identity these secrets establish.
  const aliceSecret = randomHex32();
  const bobSecret = randomHex32();
  const alice = await relayerPost("/authorship/key-hash", { secretKey: aliceSecret });
  const bob = await relayerPost("/authorship/key-hash", { secretKey: bobSecret });
  expect("alice key hash derived", alice.ok === true);
  expect("bob key hash derived", bob.ok === true);
  const bobKeyHash: string = bob.result.authorKeyHash;

  console.log("\n-- create + append without any on-chain proof --");
  const create = await backendPost("/document/create", { userAddress: "alice", contentTitle: "My Doc" });
  expect("create document succeeds", create.status === 200, create.body);
  const documentId: string = create.body.message.insertedId.toString();

  const initialContent = `privatescroll first save ${Date.now()}`;
  const documentHash = sha256Hex(initialContent);

  const appendWithoutAuthorship = await backendPost("/document/append", {
    documentId,
    userAddress: "alice",
    document: "encrypted-blob-1",
    documentHash,
    modifiedHash: documentHash,
  });
  expect(
    "append is rejected when authorship was never proven on-chain",
    appendWithoutAuthorship.status === 400,
    appendWithoutAuthorship.body,
  );

  console.log("\n-- prove authorship, still no work-history proof --");
  const proveAuthorship = await relayerPost("/authorship/prove", { secretKey: aliceSecret, documentHash });
  expect("proveAuthorship succeeds on-chain", proveAuthorship.ok === true, proveAuthorship.error);

  const appendWithoutWorkProof = await backendPost("/document/append", {
    documentId,
    userAddress: "alice",
    document: "encrypted-blob-1",
    documentHash,
    modifiedHash: documentHash,
  });
  expect(
    "append is rejected when work-history proof was never recorded",
    appendWithoutWorkProof.status === 400,
    appendWithoutWorkProof.body,
  );

  console.log("\n-- first real append --");
  const work1 = await relayerPost("/authorship/prove-work-history", {
    secretKey: aliceSecret,
    documentHash,
    modifiedHash: documentHash,
    numPastes: 0,
    writeCount: 5,
  });
  expect("first work-history proof succeeds", work1.result?.passed === true, work1.error);

  const append1 = await backendPost("/document/append", {
    documentId,
    userAddress: "alice",
    document: "encrypted-blob-1",
    documentHash,
    modifiedHash: documentHash,
  });
  expect("first append succeeds once both proofs exist on-chain", append1.status === 200, append1.body);
  expect("appended document is marked blockchain_verified", append1.body.message?.blockchain_verified === true);
  expect("appended document has one proof recorded", append1.body.message?.midnight_proofs?.length === 1);

  console.log("\n-- second save, same document, different content --");
  const secondContent = `privatescroll second save ${Date.now()}`;
  const modifiedHash2 = sha256Hex(secondContent);
  const work2 = await relayerPost("/authorship/prove-work-history", {
    secretKey: aliceSecret,
    documentHash,
    modifiedHash: modifiedHash2,
    numPastes: 1,
    writeCount: 8,
  });
  expect("second work-history proof succeeds", work2.result?.passed === true, work2.error);

  const append2 = await backendPost("/document/append", {
    documentId,
    userAddress: "alice",
    document: "encrypted-blob-2",
    documentHash,
    modifiedHash: modifiedHash2,
  });
  expect("second append succeeds", append2.status === 200, append2.body);
  expect("appended document now has two proofs recorded", append2.body.message?.midnight_proofs?.length === 2);

  console.log("\n-- tamper checks --");
  const wrongHash = sha256Hex("not the real document");
  const appendWrongHash = await backendPost("/document/append", {
    documentId,
    userAddress: "alice",
    document: "encrypted-blob-3",
    documentHash: wrongHash,
    modifiedHash: wrongHash,
  });
  expect(
    "append with a documentHash that doesn't match the registered one is rejected",
    appendWrongHash.status === 400,
    appendWrongHash.body,
  );

  const appendAsNonOwner = await backendPost("/document/append", {
    documentId,
    userAddress: "bob",
    document: "encrypted-blob-evil",
    documentHash,
    modifiedHash: modifiedHash2,
  });
  expect("append as a non-owner is rejected", appendAsNonOwner.status === 404, appendAsNonOwner.body);

  console.log("\n-- sharing --");
  const fabricatedShareId = randomHex32();
  const shareWithoutOnChain = await backendPost("/document/share/authorize", {
    documentId,
    documentHash,
    shareId: fabricatedShareId,
    senderAddress: "alice",
    recipientKeyHash: bobKeyHash,
    accessLevel: "read_verify",
  });
  expect(
    "authorizing a share that was never created on-chain is rejected",
    shareWithoutOnChain.status === 400,
    shareWithoutOnChain.body,
  );

  const nonce = randomHex32();
  const onChainShare = await relayerPost("/authorship/share/authorize", {
    secretKey: aliceSecret,
    documentHash,
    recipientKeyHash: bobKeyHash,
    accessLevel: "read_verify",
    nonce,
  });
  expect("on-chain share authorization succeeds", onChainShare.ok === true, onChainShare.error);
  const shareId: string = onChainShare.result.shareId;

  const shareAuthorize = await backendPost("/document/share/authorize", {
    documentId,
    documentHash,
    shareId,
    senderAddress: "alice",
    recipientKeyHash: bobKeyHash,
    accessLevel: "read_verify",
  });
  expect("backend records the on-chain-verified share", shareAuthorize.status === 200, shareAuthorize.body);

  // The backend's /document/share/:shareId no longer takes an identity —
  // it can't verify who's asking without holding anyone's secret (see
  // back/src/router.ts). It authoritatively serves ciphertext to any
  // caller who has the (unguessable) shareId, as long as the on-chain
  // grant exists and isn't revoked. The actual "are you really the
  // recipient" check is a real ZK proof run directly against the relayer
  // with the caller's own secret — exactly what the frontend does before
  // ever calling this backend route (see verifySharedAccess in
  // front/services/midnight.ts) — so that's what's exercised below instead
  // of a backend-side identity check.
  const getShareRaw = await backendGet(`/document/share/${shareId}`);
  expect("the backend serves the (still encrypted) shared document to any caller with the shareId", getShareRaw.status === 200, getShareRaw.body);
  expect(
    "returned access level matches what was granted",
    getShareRaw.body.message?.accessLevel === "read_verify",
  );

  const verifyAsRecipient = await relayerPost("/authorship/share/verify", { secretKey: bobSecret, shareId });
  expect("the real recipient's own secret proves read access", verifyAsRecipient.ok === true && verifyAsRecipient.result?.accessLevel === "read_verify", verifyAsRecipient);

  const verifyAsSender = await relayerPost("/authorship/share/verify", { secretKey: aliceSecret, shareId });
  expect("the sender's own secret (not the recipient's) fails the same check", verifyAsSender.ok === false, verifyAsSender);

  const revoke = await relayerPost("/authorship/share/revoke", { secretKey: aliceSecret, shareId });
  expect("on-chain revoke succeeds", revoke.ok === true, revoke.error);

  const getShareAfterRevoke = await backendGet(`/document/share/${shareId}`);
  expect(
    "backend rejects access after on-chain revocation, even though its own cached record still says active",
    getShareAfterRevoke.status === 403,
    getShareAfterRevoke.body,
  );

  const verifyAfterRevoke = await relayerPost("/authorship/share/verify", { secretKey: bobSecret, shareId });
  expect("the relayer itself also rejects the recipient's proof after revocation", verifyAfterRevoke.ok === false, verifyAfterRevoke);

  console.log(`\n${passCount} passed, ${failCount} failed`);
  await new Promise((resolve) => server.close(resolve));
  await mongod.stop({ doCleanup: true, force: true });
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
