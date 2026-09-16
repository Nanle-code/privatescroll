// PrivateScroll — server-to-server client for the Midnight local relayer.
//
// The backend never trusts a client-reported "proof passed" flag. For
// every write that matters (authorship, work-history, sharing) it
// independently asks the relayer to check the actual ledger state of the
// compiled contracts before persisting anything to MongoDB. See
// contracts/relayer.ts for what actually runs behind these endpoints.

const RELAYER_URL = process.env.MIDNIGHT_RELAYER_URL || "http://localhost:8788";

type RelayerResponse = { ok: boolean; result?: any; error?: string };

/**
 * Thrown when the relayer itself couldn't be reached (network failure,
 * connection refused, etc.) — distinct from the relayer responding with a
 * well-formed rejection (bad input, failed circuit assertion). Callers use
 * this to return 502 (retryable infra failure) instead of treating an
 * outage as if it were a legitimate denial.
 */
export class RelayerUnavailableError extends Error {}

async function fetchJson(path: string, init?: RequestInit): Promise<RelayerResponse> {
  let res: Response;
  try {
    res = await fetch(`${RELAYER_URL}${path}`, init);
  } catch (err) {
    throw new RelayerUnavailableError(
      `Could not reach the relayer at ${RELAYER_URL}${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return (await res.json()) as RelayerResponse;
}

async function get(path: string): Promise<any> {
  const data = await fetchJson(path);
  if (!data.ok) {
    throw new Error(data.error ?? `relayer GET ${path} failed`);
  }
  return data.result;
}

async function post(path: string, body: unknown): Promise<any> {
  const data = await fetchJson(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!data.ok) {
    throw new Error(data.error ?? `relayer POST ${path} failed`);
  }
  return data.result;
}

export async function getRegisteredAuthor(documentHash: string): Promise<{ registered: boolean; author?: string }> {
  return get(`/ledger/authorship/document/${documentHash}`);
}

export async function isWorkProofRecorded(documentHash: string, modifiedHash: string): Promise<boolean> {
  const result = await get(
    `/ledger/authorship/work-proof?documentHash=${encodeURIComponent(documentHash)}&modifiedHash=${encodeURIComponent(modifiedHash)}`,
  );
  return result.recorded;
}

export type OnChainShareGrant = {
  exists: boolean;
  senderKeyHash?: string;
  documentHash?: string;
  recipientKeyHash?: string;
  accessLevel?: "read" | "read_verify" | "full";
  revoked?: boolean;
};

export async function getOnChainShare(shareId: string): Promise<OnChainShareGrant> {
  return get(`/ledger/authorship/share/${shareId}`);
}

// There is no getAuthorKeyHash or verifySharedAccessOnChain here anymore.
// Both required the relayer to resolve a caller's secret key server-side —
// exactly the pattern removed so a shared, publicly-reachable deployment of
// this relayer never becomes a store of every user's private key (see
// contracts/relayer.ts). Recipient-access verification (proving you hold
// the secret behind a share's recipientKeyHash) now happens directly in
// the caller's own browser against the relayer — see
// front/services/midnight.ts's verifySharedAccess — which is the only
// place that legitimately holds the secret needed to run that circuit.
// This backend still authoritatively checks the parts that don't require
// anyone's secret: share existence and revocation status, both plain
// public ledger reads (see getOnChainShare above).
