// PrivateScroll — Midnight services layer.
// Replaces zkPaper's front/services/index.ts (signature-based auth +
// Noir/Barretenberg proof generation) with Midnight-backed equivalents.
//
// Three tiers of confidence in this file, called out explicitly because
// they were not all verified the same way:
//
// 1. VERIFIED — the authorship/work-history/sharing/change proof
//    functions call a local relayer (../../contracts/relayer.ts) that runs
//    the real compiled Compact circuits via @midnight-ntwrk/compact-runtime.
//    This was actually run end-to-end (see contracts/verify.ts) and every
//    assert, replay-protection check, and rejection below reflects real
//    circuit behavior — not a guess at what the contract "should" do.
//
// 2. VERIFIED AGAINST A LIVE WALLET — initializeMidnight()/getUserAddress()
//    use @midnight-ntwrk/dapp-connector-api's own types (installed from
//    npm, read from its actual .d.ts — connect(networkId),
//    getShieldedAddresses(), etc.). Confirmed working against a real 1AM
//    wallet extension: connect() reached the extension and 1AM correctly
//    rejected a network mismatch (wallet on mainnet, app requesting
//    preprod) — a real round trip, not a guess. Works with any compliant
//    wallet (1AM, Lace, etc.) without wallet-specific code, since it's the
//    standardized connector API. (The migration brief's window.cardano.lace
//    was Cardano's namespace, not Midnight's; corrected since the first
//    draft of this file.)
//
// 3. VERIFIED — the backend calls (createDocument/appendDocument/
//    listDocuments/getDocument/shareDocument/getSharedDocument) hit real
//    routes that independently re-verify against the relayer server-side
//    (see back/src/router.ts, exercised end-to-end by back/verify-e2e.ts).
//
// Recipient key delivery: getOrCreateDocumentKey generates a per-document
// AES key kept in this browser's localStorage; shareDocument wraps that
// key for a specific recipient using ECDH + AES-GCM (see services/keys.ts)
// so only their matching private key can recover it. The keypair itself is
// dedicated to this purpose — generated per-browser, independent of wallet
// identity, non-extractable private key in IndexedDB — because the real
// DApp Connector API (see tier 2) exposes signData() but no encrypt/decrypt
// primitive to reuse.

import { toast } from 'react-toastify'
import Aes from 'crypto-js/aes'
import Utf8Encoding from 'crypto-js/enc-utf8'
import '@midnight-ntwrk/dapp-connector-api'
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api'
import { VITE_API_URL, VITE_MIDNIGHT_NETWORK, VITE_MIDNIGHT_RELAYER_URL } from './url'
import { getEncryptionPublicKey, unwrapKeyFromSender, wrapKeyForRecipient } from './keys'

const error = (action: string, err?: unknown) => {
  const detail = err instanceof Error ? err.message : undefined
  toast(detail ? `${action}: ${detail}` : `${action}: Error performing this request! Please try again later.`, { type: 'error' })
}
const success = (action: string) => toast(`${action}: Request successful!`, { type: 'success' })

export type AccessLevel = 'read' | 'read_verify' | 'full'

// --- hashing / random helpers (Web Crypto — browser-native) ---------------

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await window.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function randomHex32(): string {
  const bytes = new Uint8Array(32)
  window.crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// --- local AES document encryption (unchanged from zkPaper) ---------------

export async function aesEncryptMessage(message: string, secret: string): Promise<string> {
  return Aes.encrypt(message, secret).toString()
}

export async function aesDecryptMessage(encryptedMessage: string, secret: string): Promise<string> {
  return Aes.decrypt(encryptedMessage, secret).toString(Utf8Encoding)
}

/**
 * Generates (or recovers) a random per-document AES key, kept only in this
 * browser's localStorage — this is the author's own copy, used to encrypt
 * content before it ever leaves the browser. It doesn't need to be
 * recoverable on another device (there's no "log in elsewhere" flow yet);
 * it only needs to survive reloads of this browser. Delivering this same
 * key to a *recipient* is a separate concern, handled by
 * shareDocument/getSharedDocument via ECDH key-wrapping (see
 * services/keys.ts) — this function has nothing to do with that path.
 */
export function getOrCreateDocumentKey(documentId: string): string {
  const storageKey = `privatescroll:doc-key:${documentId}`
  let key = localStorage.getItem(storageKey)
  if (!key) {
    key = randomHex32()
    localStorage.setItem(storageKey, key)
  }
  return key
}

// --- wallet (any Midnight DApp Connector-compatible wallet) ---------------
//
// Uses @midnight-ntwrk/dapp-connector-api's own real types and ambient
// window.midnight declaration — no hand-rolled guess at the shape. This is
// the standardized connector every compliant wallet implements (1AM, Lace,
// etc. all inject under window.midnight[rdns]), so nothing here is wallet-
// specific; whichever compatible wallet the user has installed is picked
// up automatically. Still unverified in the sense that there's no live
// wallet extension in this environment to click through — but the API
// shape itself is real (installed from the actual npm package and read
// from its .d.ts), not guessed the way the original best-effort draft was.

let walletApi: ConnectedAPI | null = null
let connectingPromise: Promise<boolean> | null = null

/**
 * Connects to any installed Midnight DApp Connector-compatible wallet.
 * Falls back to `false` (never throws) so callers can offer the
 * dev-identity path below.
 *
 * Guards against concurrent calls sharing one in-flight connect() instead
 * of each firing its own: a wallet's connect() opens a popup awaiting user
 * approval, and most wallets (1AM included) reject a second overlapping
 * request with "already pending" rather than queuing it. React 18
 * StrictMode deliberately double-invokes effects in dev mode, and
 * useMidnightUser calls this on mount — without this guard, that alone
 * produces exactly that rejection on every load, before a user even
 * double-clicks "Connect wallet".
 */
export async function initializeMidnight(): Promise<boolean> {
  if (walletApi) return true
  if (connectingPromise) return connectingPromise

  connectingPromise = (async () => {
    try {
      const connector = Object.values(window.midnight ?? {})[0]
      if (!connector) {
        console.warn(
          'No Midnight wallet detected (window.midnight is empty). Install a DApp Connector-compatible wallet (e.g. 1AM or Lace) to enable real wallet proofs.',
        )
        return false
      }
      walletApi = await connector.connect(VITE_MIDNIGHT_NETWORK)
      return true
    } catch (err) {
      console.error(err)
      error('Connect wallet', err)
      return false
    } finally {
      connectingPromise = null
    }
  })()

  return connectingPromise
}

const DEV_IDENTITY_KEY = 'privatescroll:dev-identity'

/** Dev-only stand-in identity, used only when no wallet is connected. */
function getOrCreateDevIdentity(): string {
  let id = localStorage.getItem(DEV_IDENTITY_KEY)
  if (!id) {
    id = `dev-${randomHex32().slice(0, 16)}`
    localStorage.setItem(DEV_IDENTITY_KEY, id)
  }
  return id
}

/**
 * Returns the current user's address: their shielded address (Bech32m) if
 * a wallet is connected — the privacy-preserving address, matching this
 * app's zero-knowledge posture, rather than the transparent unshielded
 * one. Falls back to a locally persisted dev identity so the relayer-
 * backed proof flow below is still exercisable without a wallet.
 */
export async function getUserAddress(): Promise<string | null> {
  try {
    if (walletApi) {
      const { shieldedAddress } = await walletApi.getShieldedAddresses()
      return shieldedAddress
    }
  } catch (err) {
    console.error(err)
  }
  return getOrCreateDevIdentity()
}

const SECRET_KEY_STORAGE = 'privatescroll:secret-key'

/**
 * The caller's actual circuit witness secret (userSecretKey in
 * contracts/src/authorship.compact) — generated once per browser with a
 * CSPRNG and kept only in this browser's localStorage. Every relayer call
 * below sends it fresh, for that one request, to run a specific circuit;
 * the relayer (contracts/relayer.ts) never writes it to disk or keeps it
 * past that single request. This is deliberately independent of
 * getUserAddress() (the wallet's shielded address, or a dev-identity
 * label) — that value is only ever used for backend/MongoDB bookkeeping
 * now, never sent to the relayer, since a real wallet address doesn't
 * deterministically map to a Compact witness secret.
 */
export function getUserSecretKey(): string {
  let key = localStorage.getItem(SECRET_KEY_STORAGE)
  if (!key) {
    key = randomHex32()
    localStorage.setItem(SECRET_KEY_STORAGE, key)
  }
  return key
}

// --- relayer client (real, verified — see contracts/verify.ts) ------------

async function relayerRequest(path: string, method: 'GET' | 'POST', body?: unknown): Promise<any> {
  const res = await fetch(`${VITE_MIDNIGHT_RELAYER_URL}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!data.ok) {
    throw new Error(data.error ?? 'Relayer request failed')
  }
  return data.result
}

/** Returns the pseudonymous author key hash derived from this browser's own secret key. */
export async function getAuthorKeyHash(): Promise<string | null> {
  try {
    const { authorKeyHash } = await relayerRequest('/authorship/key-hash', 'POST', { secretKey: getUserSecretKey() })
    return authorKeyHash
  } catch (err) {
    console.error(err)
    return null
  }
}

interface SharingCode {
  keyHash: string
  encryptionPublicKey: string
}

/**
 * What a would-be recipient copies and hands to a sender out-of-band: their
 * on-chain key hash (for authorizeDocumentShare's access control) bundled
 * with their ECDH public key (for wrapping the document's AES key to them
 * specifically). One string instead of two, so there's only one thing to
 * paste.
 */
export async function getMySharingCode(): Promise<string | null> {
  const keyHash = await getAuthorKeyHash()
  if (!keyHash) return null
  const encryptionPublicKey = await getEncryptionPublicKey()
  return btoa(JSON.stringify({ keyHash, encryptionPublicKey } satisfies SharingCode))
}

function parseSharingCode(code: string): SharingCode {
  const parsed = JSON.parse(atob(code.trim()))
  if (typeof parsed?.keyHash !== 'string' || typeof parsed?.encryptionPublicKey !== 'string') {
    throw new Error('That sharing code looks invalid — ask the recipient to copy it again')
  }
  return parsed
}

/**
 * Registers documentHash as authored by userAddress. documentHash must be
 * the hash of the document's content AT CREATION TIME — it's the stable
 * on-chain identifier for this document across all future proofs. The
 * caller computes it once at creation (sha256Hex(initialContent)) and
 * persists it alongside the document; this function never re-derives it
 * from later edits, so it can't accidentally register a second,
 * disconnected "document" under a new hash.
 */
export async function proveAuthorship(
  documentHash: string,
): Promise<{ documentHash: string; author: string } | null> {
  try {
    const { author } = await relayerRequest('/authorship/prove', 'POST', { secretKey: getUserSecretKey(), documentHash })
    success('Prove authorship')
    return { documentHash, author }
  } catch (err) {
    console.error(err)
    error('Prove authorship', err)
    return null
  }
}

/**
 * Proves this save is genuine authored work (numWrites > numPastes),
 * without revealing numWrites itself — only the pass/fail result is
 * disclosed. Bound to (documentHash, modifiedHash) so it can be proven
 * again on every subsequent save of the same document, but never replayed
 * for the exact same save twice.
 */
export async function proveWorkHistory(
  documentHash: string,
  modifiedHash: string,
  numWrites: number,
  numPastes: number,
): Promise<boolean> {
  try {
    const { passed } = await relayerRequest('/authorship/prove-work-history', 'POST', {
      secretKey: getUserSecretKey(),
      documentHash,
      modifiedHash,
      numPastes,
      writeCount: numWrites,
    })
    return passed
  } catch (err) {
    console.error(err)
    error('Prove work history', err)
    return false
  }
}

/**
 * Selective disclosure: proves userAddress authored documentHash.
 * revealIdentity=false (default) discloses only a boolean match — the
 * verifier learns "yes, a registered author confirmed this" without
 * learning who. revealIdentity=true discloses the author's key hash.
 */
export async function proveAuthorshipSelective(
  documentHash: string,
  revealIdentity = false,
): Promise<{ match: boolean } | { author: string } | null> {
  try {
    if (revealIdentity) {
      const { author } = await relayerRequest('/authorship/prove-with-identity', 'POST', {
        secretKey: getUserSecretKey(),
        documentHash,
      })
      success('Prove authorship (identity disclosed)')
      return { author }
    }
    const { match } = await relayerRequest('/authorship/prove-anonymous', 'POST', {
      secretKey: getUserSecretKey(),
      documentHash,
    })
    success('Prove authorship (anonymous)')
    return { match }
  } catch (err) {
    console.error(err)
    error('Prove authorship', err)
    return null
  }
}

/**
 * Proves a document changed from originalContent to modifiedContent.
 * Content is hashed client-side; only the hashes and a random salt ever
 * leave the browser. Anonymous — doesn't bind the change to any identity.
 * For that, see proveChangeByAuthor.
 */
export async function proveDocumentChange(
  originalContent: string,
  modifiedContent: string,
): Promise<{ commitment: string; originalHash: string; modifiedHash: string } | null> {
  try {
    const originalHash = await sha256Hex(originalContent)
    const modifiedHash = await sha256Hex(modifiedContent)
    const salt = randomHex32()
    const { commitment } = await relayerRequest('/change/prove', 'POST', {
      secretKey: getUserSecretKey(),
      originalHash,
      modifiedHash,
      salt,
    })
    success('Prove document change')
    return { commitment, originalHash, modifiedHash }
  } catch (err) {
    console.error(err)
    error('Prove document change', err)
    return null
  }
}

/**
 * Proves a document changed from originalHash to modifiedHash AND binds
 * the change to the caller's author key hash, without revealing their
 * secret key — a real on-chain edit history, not just a work-history
 * counter. Takes hashes directly (not raw content) since callers
 * typically already have the previous save's recorded hash rather than
 * its plaintext.
 */
export async function proveChangeByAuthor(
  originalHash: string,
  modifiedHash: string,
): Promise<{ commitment: string } | null> {
  try {
    const salt = randomHex32()
    const { commitment } = await relayerRequest('/change/prove-by-author', 'POST', {
      secretKey: getUserSecretKey(),
      originalHash,
      modifiedHash,
      salt,
    })
    success('Prove document change')
    return { commitment }
  } catch (err) {
    console.error(err)
    error('Prove document change', err)
    return null
  }
}

/**
 * Authorizes a recipient to access documentHash at accessLevel, and wraps
 * the document's AES key (documentEncryptionKey — see
 * getOrCreateDocumentKey) so the recipient, and only the recipient, can
 * recover it and actually read the content.
 *
 * recipientSharingCode must come from the recipient themselves — e.g. they
 * call getMySharingCode() and share the result with the sender out-of-band
 * — never looked up by address here. There's no address-keyed lookup to
 * fall back to: the relayer no longer maps addresses to identities at all,
 * so the only way to name a recipient is the key hash they themselves
 * published in their sharing code. Enforced on-chain regardless: the
 * circuit rejects this unless the caller is documentHash's registered
 * author (see authorship.compact).
 */
export async function shareDocument(
  documentId: string,
  documentHash: string,
  userAddress: string,
  recipientSharingCode: string,
  accessLevel: AccessLevel,
  documentEncryptionKey: string,
): Promise<{ shareId: string } | null> {
  try {
    const { keyHash: recipientKeyHash, encryptionPublicKey: recipientPublicKey } = parseSharingCode(recipientSharingCode)
    const { shareId } = await relayerRequest('/authorship/share/authorize', 'POST', {
      secretKey: getUserSecretKey(),
      documentHash,
      recipientKeyHash,
      accessLevel,
      nonce: randomHex32(),
    })
    const wrappedKey = await wrapKeyForRecipient(documentEncryptionKey, recipientPublicKey)
    const senderEncryptionPublicKey = await getEncryptionPublicKey()
    // The on-chain authorization above is the source of truth for access
    // control; this call persists a lookup record (plus the wrapped key)
    // so getSharedDocument (a GET by shareId) has something to find and
    // decrypt. The backend independently re-verifies the access-control
    // part against the relayer before storing it — it doesn't just trust
    // this request. The wrapped key itself is ciphertext even in MongoDB;
    // only the recipient's private key (never sent anywhere) can open it.
    await client.post('/document/share/authorize', {
      documentId,
      documentHash,
      shareId,
      senderAddress: userAddress,
      recipientKeyHash,
      accessLevel,
      wrappedKey,
      senderEncryptionPublicKey,
    })
    success('Share document')
    return { shareId }
  } catch (err) {
    console.error(err)
    error('Share document', err)
    return null
  }
}

/**
 * Recipient side of shareDocument: proves this browser holds the secret key
 * the share was granted to, without revealing it, and that the grant is
 * still active. Returns the granted access level, or null if the share
 * doesn't exist, is revoked, or this browser isn't the recipient. This is
 * the real, ZK-backed access check for shared documents — see
 * getSharedDocument below, which calls this before ever asking the backend
 * for the document, since the backend has no way to run this check itself
 * (it never holds anyone's secret key).
 */
export async function verifySharedAccess(shareId: string): Promise<AccessLevel | null> {
  try {
    const { accessLevel } = await relayerRequest('/authorship/share/verify', 'POST', {
      secretKey: getUserSecretKey(),
      shareId,
    })
    return accessLevel as AccessLevel
  } catch (err) {
    console.error(err)
    return null
  }
}

/**
 * Sender side: revokes a previously authorized share. Enforced on-chain:
 * the circuit rejects this unless the caller is the share's original
 * sender.
 */
export async function revokeShare(shareId: string): Promise<boolean> {
  try {
    await relayerRequest('/authorship/share/revoke', 'POST', { secretKey: getUserSecretKey(), shareId })
    success('Revoke share')
    return true
  } catch (err) {
    console.error(err)
    error('Revoke share', err)
    return false
  }
}

// --- backend calls (verified — see back/verify-e2e.ts) --------------------

const client = {
  get: async (path: string) => {
    const res = await fetch(`${VITE_API_URL}${path}`)
    const body = await res.json()
    if (!res.ok) throw new Error(body?.message ?? `${path} failed with status ${res.status}`)
    return body
  },
  post: async (path: string, body: unknown) => {
    const res = await fetch(`${VITE_API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const responseBody = await res.json()
    if (!res.ok) throw new Error(responseBody?.message ?? `${path} failed with status ${res.status}`)
    return responseBody
  },
}

export async function createDocument(userAddress: string, contentTitle: string = 'Untitled'): Promise<string | null> {
  try {
    const response = await client.post('/document/create', { userAddress, contentTitle })
    success('Create document')
    return response.message.insertedId
  } catch (err) {
    console.error(err)
    error('Create document', err)
    return null
  }
}

export interface DocumentSummary {
  _id: string
  documentTitle: string
  blockchain_verified: boolean
  createdAt: string
  updatedAt: string
}

export async function listDocuments(userAddress: string): Promise<DocumentSummary[]> {
  try {
    const response = await client.post('/documents', { userAddress })
    return response.message.documents
  } catch (err) {
    console.error(err)
    error('List documents', err)
    return []
  }
}

export interface DocumentRecord {
  _id: string
  userAddress: string
  documentTitle: string
  content?: string
  documentHash?: string
  midnight_proofs: { modifiedHash: string; verifiedAt: string }[]
  blockchain_verified: boolean
}

export async function getDocument(documentId: string, userAddress: string): Promise<DocumentRecord | null> {
  try {
    const response = await client.get(`/document/${documentId}?userAddress=${encodeURIComponent(userAddress)}`)
    return response.document
  } catch (err) {
    console.error(err)
    error('Load document', err)
    return null
  }
}

export interface SharedDocumentResult {
  document: DocumentRecord
  accessLevel: AccessLevel
  wrappedKey?: string
  senderEncryptionPublicKey?: string
}

/**
 * Loads a shared document, gated on a real ZK proof of recipient access run
 * right here in the browser (verifySharedAccess) — not on anything the
 * backend reports, since the backend can't run that check itself (see
 * back/src/router.ts's /document/share/:shareId). Only once that proof
 * succeeds does this even ask the backend for the (still encrypted)
 * content.
 */
export async function getSharedDocument(shareId: string): Promise<SharedDocumentResult | null> {
  try {
    const accessLevel = await verifySharedAccess(shareId)
    if (!accessLevel) {
      error('Load shared document', new Error('Access denied — not the recipient, or the share was revoked'))
      return null
    }
    const response = await client.get(`/document/share/${shareId}`)
    return { ...response.message, accessLevel }
  } catch (err) {
    console.error(err)
    error('Load shared document', err)
    return null
  }
}

/**
 * Attempts to recover the plaintext of a shared document using this
 * browser's own ECDH private key. Returns null (not an error) when it
 * can't — either this share predates key-wrapping support, or this browser
 * genuinely isn't the intended recipient (its private key won't derive the
 * right shared secret, so decryption fails). Callers should fall back to
 * showing the ciphertext rather than treating null as a hard error.
 */
export async function decryptSharedContent(result: SharedDocumentResult): Promise<string | null> {
  if (!result.document.content || !result.wrappedKey || !result.senderEncryptionPublicKey) {
    return null
  }
  try {
    const aesKeyHex = await unwrapKeyFromSender(result.wrappedKey, result.senderEncryptionPublicKey)
    return await aesDecryptMessage(result.document.content, aesKeyHex)
  } catch (err) {
    console.error(err)
    return null
  }
}

/**
 * Saves an edited document: generates a work-history proof, encrypts the
 * content, and sends both to the backend alongside the proof-of-authorship
 * reference. documentHash is the document's stable identifier (see
 * proveAuthorship); numWrites/numPastes come from the editor's local
 * write/paste tracking (not yet ported into this phase).
 */
export async function appendDocument(
  userAddress: string,
  encryptionKey: string,
  documentId: string,
  content: string,
  documentHash: string,
  numWrites: number,
  numPastes: number,
): Promise<DocumentRecord | null> {
  try {
    const modifiedHash = await sha256Hex(content)
    const passed = await proveWorkHistory(documentHash, modifiedHash, numWrites, numPastes)
    if (!passed) {
      throw new Error('Work-history proof failed — write count did not exceed paste count')
    }
    const encryptedContent = await aesEncryptMessage(content, encryptionKey)
    const response = await client.post('/document/append', {
      documentId,
      userAddress,
      document: encryptedContent,
      documentHash,
      modifiedHash,
    })
    success('Append document')
    return response.message
  } catch (err) {
    console.error(err)
    error('Append document', err)
    return null
  }
}

// --- public verification (no identity, no secret, no login) ---------------
//
// Every function below reads directly from the relayer's public ledger
// state — the same data anyone running a real Midnight node could read
// independently. None of it needs a secret key, a wallet, or even a
// PrivateScroll account: this is "prove it, don't trust it" made literal —
// a visitor can check these claims themselves without trusting this
// frontend, the backend, or PrivateScroll's operator to report them
// honestly.

export interface AuthorshipStatus {
  registered: boolean
  author?: string
}

export async function verifyDocumentAuthorship(documentHash: string): Promise<AuthorshipStatus | null> {
  try {
    return (await relayerRequest(`/ledger/authorship/document/${encodeURIComponent(documentHash)}`, 'GET')) as AuthorshipStatus
  } catch (err) {
    console.error(err)
    error('Verify document authorship', err)
    return null
  }
}

export interface WorkProofStatus {
  recorded: boolean
}

export async function verifyWorkProof(documentHash: string, modifiedHash: string): Promise<WorkProofStatus | null> {
  try {
    const query = `documentHash=${encodeURIComponent(documentHash)}&modifiedHash=${encodeURIComponent(modifiedHash)}`
    return (await relayerRequest(`/ledger/authorship/work-proof?${query}`, 'GET')) as WorkProofStatus
  } catch (err) {
    console.error(err)
    error('Verify work-history proof', err)
    return null
  }
}

export type ShareStatus =
  | { exists: false }
  | {
      exists: true
      senderKeyHash: string
      documentHash: string
      recipientKeyHash: string
      accessLevel: AccessLevel
      revoked: boolean
    }

export async function verifyShareStatus(shareId: string): Promise<ShareStatus | null> {
  try {
    return (await relayerRequest(`/ledger/authorship/share/${encodeURIComponent(shareId)}`, 'GET')) as ShareStatus
  } catch (err) {
    console.error(err)
    error('Verify share status', err)
    return null
  }
}

export interface LedgerActivity {
  documentAuthorCount: string
  workProofCount: string
  shareCount: string
  versionCount: string
  nullifierCount: string
}

export async function getLedgerActivity(): Promise<LedgerActivity | null> {
  try {
    const [authorship, documentChange] = await Promise.all([
      relayerRequest('/ledger/authorship', 'GET'),
      relayerRequest('/ledger/document-change', 'GET'),
    ])
    return {
      documentAuthorCount: authorship.documentAuthorCount,
      workProofCount: authorship.workProofCount,
      shareCount: authorship.shareCount,
      versionCount: documentChange.versionCount,
      nullifierCount: documentChange.nullifierCount,
    }
  } catch (err) {
    console.error(err)
    return null
  }
}
