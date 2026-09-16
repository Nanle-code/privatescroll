// PrivateScroll — end-to-end smoke test against a running local relayer.
// Run with: npm run relayer (in one shell) && npm run verify (in another)

import { createHash } from "node:crypto";

const BASE_URL = process.env.PRIVATESCROLL_RELAYER_URL ?? "http://localhost:8788";

const sha256Hex = (text: string): string => createHash("sha256").update(text).digest("hex");
const randomHex32 = (): string => createHash("sha256").update(Math.random().toString()).digest("hex");

let passCount = 0;
let failCount = 0;

type RelayerResponse = { ok: boolean; result?: any; error?: string };

async function post(path: string, body: unknown): Promise<RelayerResponse> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return (await res.json()) as RelayerResponse;
}

async function get(path: string): Promise<RelayerResponse> {
  const res = await fetch(`${BASE_URL}${path}`);
  return (await res.json()) as RelayerResponse;
}

function expect(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passCount++;
    console.log(`  PASS  ${label}`);
  } else {
    failCount++;
    console.log(`  FAIL  ${label}`, detail ?? "");
  }
}

async function main() {
  console.log(`Checking relayer at ${BASE_URL} ...`);
  const status = await get("/status");
  expect("relayer is up", status.ok === true);

  // Secrets are generated here, exactly as a browser would generate and
  // hold its own userSecretKey — never persisted by the relayer, only
  // ever sent per-request to run a circuit.
  const aliceSecret = randomHex32();
  const bobSecret = randomHex32();
  const alice = await post("/authorship/key-hash", { secretKey: aliceSecret });
  const bob = await post("/authorship/key-hash", { secretKey: bobSecret });
  expect("alice key hash derived", alice.ok && typeof alice.result.authorKeyHash === "string");
  expect("bob key hash derived", bob.ok && typeof bob.result.authorKeyHash === "string");
  const aliceKeyHash: string = alice.result.authorKeyHash;
  const bobKeyHash: string = bob.result.authorKeyHash;
  expect("alice and bob have different key hashes", aliceKeyHash !== bobKeyHash);

  const documentHash = sha256Hex(`privatescroll-doc-${Date.now()}`);

  console.log("\n-- authorship --");
  const proveAuthor = await post("/authorship/prove", { secretKey: aliceSecret, documentHash });
  expect("alice registers authorship", proveAuthor.ok === true, proveAuthor.error);
  expect("registered author is alice's key hash", proveAuthor.result?.author === aliceKeyHash);

  const proveAuthorAgain = await post("/authorship/prove", { secretKey: aliceSecret, documentHash });
  expect("re-registering the same document is rejected", proveAuthorAgain.ok === false, proveAuthorAgain);

  const anonAsAlice = await post("/authorship/prove-anonymous", { secretKey: aliceSecret, documentHash });
  expect("proveAuthorshipAnonymous matches for the real author", anonAsAlice.result?.match === true);

  const anonAsBob = await post("/authorship/prove-anonymous", { secretKey: bobSecret, documentHash });
  expect("proveAuthorshipAnonymous does not match for a non-author", anonAsBob.result?.match === false);

  const identityAsBob = await post("/authorship/prove-with-identity", { secretKey: bobSecret, documentHash });
  expect("proveAuthorshipWithIdentity rejects a non-author", identityAsBob.ok === false, identityAsBob);

  console.log("\n-- work history (replay protection keyed on documentHash+modifiedHash) --");
  const modifiedHash1 = sha256Hex("privatescroll-doc-v1");
  const work1 = await post("/authorship/prove-work-history", {
    secretKey: aliceSecret,
    documentHash,
    modifiedHash: modifiedHash1,
    numPastes: 0,
    writeCount: 5,
  });
  expect("first work-history proof for this save succeeds", work1.result?.passed === true, work1.error);

  const work1Again = await post("/authorship/prove-work-history", {
    secretKey: aliceSecret,
    documentHash,
    modifiedHash: modifiedHash1,
    numPastes: 0,
    writeCount: 5,
  });
  expect("replaying the exact same save is rejected", work1Again.ok === false, work1Again);

  const modifiedHash2 = sha256Hex("privatescroll-doc-v2");
  const work2 = await post("/authorship/prove-work-history", {
    secretKey: aliceSecret,
    documentHash,
    modifiedHash: modifiedHash2,
    numPastes: 0,
    writeCount: 6,
  });
  expect("a later, different save of the SAME document succeeds", work2.result?.passed === true, work2.error);

  const modifiedHash3 = sha256Hex("privatescroll-doc-v3-pasted");
  const workPasteHeavy = await post("/authorship/prove-work-history", {
    secretKey: aliceSecret,
    documentHash,
    modifiedHash: modifiedHash3,
    numPastes: 10,
    writeCount: 2,
  });
  expect("a paste-heavy save fails the write/paste assertion", workPasteHeavy.ok === false, workPasteHeavy);

  const modifiedHash4 = sha256Hex("privatescroll-doc-v4-not-author");
  const workByNonAuthor = await post("/authorship/prove-work-history", {
    secretKey: bobSecret,
    documentHash,
    modifiedHash: modifiedHash4,
    numPastes: 0,
    writeCount: 5,
  });
  expect("a non-author cannot record work-history for this document", workByNonAuthor.ok === false, workByNonAuthor);

  console.log("\n-- sharing (ownership-gated) --");
  const shareByNonAuthor = await post("/authorship/share/authorize", {
    secretKey: bobSecret,
    documentHash,
    recipientKeyHash: aliceKeyHash,
    accessLevel: "read",
    nonce: randomHex32(),
  });
  expect("a non-author cannot authorize a share", shareByNonAuthor.ok === false, shareByNonAuthor);

  const nonce = randomHex32();
  const shareByAuthor = await post("/authorship/share/authorize", {
    secretKey: aliceSecret,
    documentHash,
    recipientKeyHash: bobKeyHash,
    accessLevel: "read_verify",
    nonce,
  });
  expect("the real author can authorize a share", shareByAuthor.ok === true, shareByAuthor.error);
  const shareId: string = shareByAuthor.result?.shareId;

  const verifyAsWrongRecipient = await post("/authorship/share/verify", { secretKey: aliceSecret, shareId });
  expect("verifyReadPermission rejects the wrong caller", verifyAsWrongRecipient.ok === false, verifyAsWrongRecipient);

  const verifyAsRecipient = await post("/authorship/share/verify", { secretKey: bobSecret, shareId });
  expect(
    "verifyReadPermission succeeds for the real recipient",
    verifyAsRecipient.ok === true && verifyAsRecipient.result?.accessLevel === "read_verify",
    verifyAsRecipient,
  );

  const revokeByNonSender = await post("/authorship/share/revoke", { secretKey: bobSecret, shareId });
  expect("a non-sender cannot revoke the share", revokeByNonSender.ok === false, revokeByNonSender);

  const revokeBySender = await post("/authorship/share/revoke", { secretKey: aliceSecret, shareId });
  expect("the sender can revoke the share", revokeBySender.ok === true, revokeBySender.error);

  const verifyAfterRevoke = await post("/authorship/share/verify", { secretKey: bobSecret, shareId });
  expect("verifyReadPermission rejects after revocation", verifyAfterRevoke.ok === false, verifyAfterRevoke);

  console.log("\n-- document change --");
  const originalHash = sha256Hex(`privatescroll-change-${Date.now()}`);
  const changedHash = sha256Hex(`privatescroll-change-${Date.now()}-v2`);
  const salt = randomHex32();
  const change1 = await post("/change/prove", { secretKey: aliceSecret, originalHash, modifiedHash: changedHash, salt });
  expect("first document-change proof succeeds", change1.ok === true, change1.error);

  const change1SameSalt = await post("/change/prove", { secretKey: aliceSecret, originalHash, modifiedHash: changedHash, salt });
  expect("replaying the exact same change is rejected", change1SameSalt.ok === false, change1SameSalt);

  const change1DifferentSalt = await post("/change/prove", {
    secretKey: aliceSecret,
    originalHash,
    modifiedHash: changedHash,
    salt: randomHex32(),
  });
  expect(
    "the nullifier ignores salt, so even a different salt for the SAME transition is still rejected",
    change1DifferentSalt.ok === false,
    change1DifferentSalt,
  );

  const secondModifiedHash = sha256Hex(`privatescroll-change-${Date.now()}-v3`);
  const changeByAuthor = await post("/change/prove-by-author", {
    secretKey: aliceSecret,
    originalHash,
    modifiedHash: secondModifiedHash,
    salt: randomHex32(),
  });
  expect("a genuinely different transition succeeds and records the author", changeByAuthor.ok === true, changeByAuthor.error);

  console.log("\n-- ledger state --");
  const authorshipLedger = await get("/ledger/authorship");
  const changeLedger = await get("/ledger/document-change");
  console.log("  authorship:", authorshipLedger.result);
  console.log("  document_change:", changeLedger.result);

  console.log(`\n${passCount} passed, ${failCount} failed`);
  if (failCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
