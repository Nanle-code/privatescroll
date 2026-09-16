// PrivateScroll — private state shape and witness implementations.
//
// The witnesses objects below are the bridge between each Compact
// contract's `witness` declarations and the TS-side private state a
// caller controls. They never touch the ledger — their return values are
// only as public as the circuit that consumes them chooses to disclose().

import type { WitnessContext } from "@midnight-ntwrk/compact-runtime";
import type { Ledger as AuthorshipLedger } from "./managed/authorship/contract/index.js";
import type { Ledger as DocumentChangeLedger } from "./managed/document_change/contract/index.js";

export type PrivateScrollPrivateState = {
  readonly secretKey: Uint8Array;
  readonly writeCount: bigint;
};

export const createPrivateScrollPrivateState = (
  secretKey: Uint8Array,
  writeCount: bigint = 0n,
): PrivateScrollPrivateState => ({ secretKey, writeCount });

export const authorshipWitnesses = {
  userSecretKey: ({
    privateState,
  }: WitnessContext<AuthorshipLedger, PrivateScrollPrivateState>): [
    PrivateScrollPrivateState,
    Uint8Array,
  ] => [privateState, privateState.secretKey],

  localWriteCount: ({
    privateState,
  }: WitnessContext<AuthorshipLedger, PrivateScrollPrivateState>): [
    PrivateScrollPrivateState,
    bigint,
  ] => [privateState, privateState.writeCount],
};

export const documentChangeWitnesses = {
  userSecretKey: ({
    privateState,
  }: WitnessContext<DocumentChangeLedger, PrivateScrollPrivateState>): [
    PrivateScrollPrivateState,
    Uint8Array,
  ] => [privateState, privateState.secretKey],
};
