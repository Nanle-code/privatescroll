// PrivateScroll — recipient key delivery via ECDH (P-256) + AES-GCM wrapping.
//
// zkPaper's original scheme wrapped each document's AES key with the
// author's MetaMask public key (eth_encrypt/eth_decrypt). The real Midnight
// DApp Connector API (@midnight-ntwrk/dapp-connector-api, verified against
// its actual .d.ts — see midnight.ts) exposes signData() but no
// encrypt/decrypt primitive, so there's no wallet equivalent to reuse.
//
// Instead: each browser generates its own dedicated ECDH keypair —
// independent of wallet/relayer identity — the first time it's needed, and
// persists the private key non-extractably in IndexedDB (it's a CryptoKey
// object that never becomes a readable string; only public keys are ever
// exported/transmitted). A sender derives an ECDH shared secret with the
// recipient's public key and uses it to AES-GCM-encrypt the document's AES
// key; only the recipient's matching private key can derive the same
// shared secret and unwrap it.

const DB_NAME = 'privatescroll-keys'
const STORE_NAME = 'ecdh'
const KEY_ID = 'primary'
const CURVE = 'P-256'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function loadStoredKeyPair(): Promise<CryptoKeyPair | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(KEY_ID)
    req.onsuccess = () => resolve((req.result as CryptoKeyPair | undefined) ?? null)
    req.onerror = () => reject(req.error)
  })
}

async function storeKeyPair(pair: CryptoKeyPair): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(pair, KEY_ID)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

let cachedKeyPair: CryptoKeyPair | null = null

async function getOrCreateEncryptionKeyPair(): Promise<CryptoKeyPair> {
  if (cachedKeyPair) return cachedKeyPair
  const stored = await loadStoredKeyPair()
  if (stored) {
    cachedKeyPair = stored
    return stored
  }
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: CURVE }, false, ['deriveKey'])
  await storeKeyPair(pair)
  cachedKeyPair = pair
  return pair
}

function bufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

function base64ToBuffer(base64: string): ArrayBuffer {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer
}

/** This browser's public encryption key (Base64 SPKI) — safe to share with anyone. */
export async function getEncryptionPublicKey(): Promise<string> {
  const { publicKey } = await getOrCreateEncryptionKeyPair()
  const spki = await crypto.subtle.exportKey('spki', publicKey)
  return bufferToBase64(spki)
}

async function importPeerPublicKey(base64SpkiKey: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('spki', base64ToBuffer(base64SpkiKey), { name: 'ECDH', namedCurve: CURVE }, false, [])
}

async function deriveSharedAesKey(peerPublicKeyBase64: string, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  const { privateKey } = await getOrCreateEncryptionKeyPair()
  const peerPublicKey = await importPeerPublicKey(peerPublicKeyBase64)
  return crypto.subtle.deriveKey({ name: 'ECDH', public: peerPublicKey }, privateKey, { name: 'AES-GCM', length: 256 }, false, [usage])
}

/** Sender side: wraps a hex AES key so only the holder of recipientPublicKey's matching private key can recover it. */
export async function wrapKeyForRecipient(aesKeyHex: string, recipientPublicKeyBase64: string): Promise<string> {
  const sharedKey = await deriveSharedAesKey(recipientPublicKeyBase64, 'encrypt')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sharedKey, new TextEncoder().encode(aesKeyHex))
  return `${bufferToBase64(iv.buffer)}.${bufferToBase64(ciphertext)}`
}

/** Recipient side: recovers the hex AES key wrapped by wrapKeyForRecipient, using the sender's public key. */
export async function unwrapKeyFromSender(wrapped: string, senderPublicKeyBase64: string): Promise<string> {
  const [ivPart, ciphertextPart] = wrapped.split('.')
  if (!ivPart || !ciphertextPart) {
    throw new Error('Malformed wrapped key')
  }
  const sharedKey = await deriveSharedAesKey(senderPublicKeyBase64, 'decrypt')
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBuffer(ivPart) }, sharedKey, base64ToBuffer(ciphertextPart))
  return new TextDecoder().decode(plaintext)
}
