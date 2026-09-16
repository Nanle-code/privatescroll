// PrivateScroll — local identity storage for dev use.
//
// A caller's secret key never leaves the machine that holds it and is
// never sent to the chain — only its one-way hash (via authorKeyHash) is.
// In the real app this key comes from the Lace wallet; here, for the
// local relayer, it's generated with a CSPRNG on first use and persisted
// per named identity so repeat calls resolve to the same author.

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const sha256 = (bytes: Uint8Array): Uint8Array =>
  new Uint8Array(createHash("sha256").update(bytes).digest());

export const randomBytes32 = (): Uint8Array => new Uint8Array(randomBytes(32));

export const loadOrCreateSecretKey = (path: string): Uint8Array => {
  if (existsSync(path)) {
    return new Uint8Array(Buffer.from(readFileSync(path, "utf8").trim(), "hex"));
  }
  const key = randomBytes32();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(key).toString("hex"), { mode: 0o600 });
  return key;
};

export const identitySecretPath = (dataDir: string, identity: string): string =>
  join(dataDir, "identities", identity, "secret.hex");
