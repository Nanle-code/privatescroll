// PrivateScroll — local contract client.
//
// Runs the real compiled Compact contracts in-process via
// @midnight-ntwrk/compact-runtime, persisting ledger state to disk. This
// is the same pattern other local Midnight projects use for development
// without a live node + indexer + proof server (those need Docker, which
// is not available in this environment). Every circuit call below
// executes the real compiled logic and real asserts, and every rejection
// (duplicate proof, wrong caller, revoked share, etc.) is a real circuit
// assertion failure — none of this is mocked or stubbed.
//
// What this is NOT: a real zero-knowledge proof submitted to a network.
// Generating an actual SNARK proof and having a live Midnight node accept
// a transaction requires the separate proof-server pipeline, which also
// needs Docker. That step has not been exercised in this environment.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ContractState,
  createCircuitContext,
  createConstructorContext,
  CostModel,
  emptyZswapLocalState,
  sampleContractAddress,
  type CircuitContext,
  type ContractAddress,
} from "@midnight-ntwrk/compact-runtime";
import {
  Contract as AuthorshipContract,
  ledger as authorshipLedger,
  AccessLevel,
  type Ledger as AuthorshipLedger,
  type ShareGrant,
} from "./managed/authorship/contract/index.js";
import {
  Contract as DocumentChangeContract,
  ledger as documentChangeLedger,
  type Ledger as DocumentChangeLedger,
} from "./managed/document_change/contract/index.js";
import {
  authorshipWitnesses,
  documentChangeWitnesses,
  type PrivateScrollPrivateState,
} from "./witnesses.js";

export { AccessLevel };
export type { ShareGrant, AuthorshipLedger, DocumentChangeLedger };

const GENESIS_SEED = "0".repeat(64);

/**
 * One shared, disk-persisted deployment of a single compiled contract.
 * Every identity that calls it shares the same ledger; only the witness
 * values (the secret key/write count resolved by `PrivateScrollPrivateState`)
 * differ per call.
 */
class LocalDeployment {
  private readonly ledgerPath: string;
  private readonly addressPath: string;
  readonly address: ContractAddress;

  private constructor(dataDir: string, address: ContractAddress) {
    this.ledgerPath = join(dataDir, "ledger.bin");
    this.addressPath = join(dataDir, "address.hex");
    this.address = address;
  }

  static open(dataDir: string, initialState: () => ContractState): LocalDeployment {
    mkdirSync(dataDir, { recursive: true });
    const ledgerPath = join(dataDir, "ledger.bin");
    const addressPath = join(dataDir, "address.hex");
    if (!existsSync(ledgerPath)) {
      const address = sampleContractAddress();
      writeFileSync(ledgerPath, initialState().serialize());
      writeFileSync(addressPath, address);
      return new LocalDeployment(dataDir, address);
    }
    const address = readFileSync(addressPath, "utf8") as ContractAddress;
    return new LocalDeployment(dataDir, address);
  }

  loadState(): ContractState {
    return ContractState.deserialize(new Uint8Array(readFileSync(this.ledgerPath)));
  }

  saveState(state: ContractState): void {
    writeFileSync(this.ledgerPath, state.serialize());
  }

  freshContext<PS>(state: ContractState, privateState: PS): CircuitContext<PS> {
    return createCircuitContext<PS>(
      this.address,
      emptyZswapLocalState(GENESIS_SEED),
      state,
      privateState,
      undefined,
      CostModel.initialCostModel(),
    );
  }

  updateState<PS>(original: ContractState, context: CircuitContext<PS>): ContractState {
    original.data = context.currentQueryContext.state;
    return original;
  }
}

export class LocalPrivateScrollClient {
  private readonly authorship: AuthorshipContract<PrivateScrollPrivateState>;
  private readonly documentChange: DocumentChangeContract<PrivateScrollPrivateState>;
  private readonly authorshipDeployment: LocalDeployment;
  private readonly documentChangeDeployment: LocalDeployment;

  private constructor(dataDir: string) {
    this.authorship = new AuthorshipContract<PrivateScrollPrivateState>(authorshipWitnesses);
    this.documentChange = new DocumentChangeContract<PrivateScrollPrivateState>(documentChangeWitnesses);

    this.authorshipDeployment = LocalDeployment.open(join(dataDir, "authorship"), () => {
      const { currentContractState } = this.authorship.initialState(
        createConstructorContext({ secretKey: new Uint8Array(32), writeCount: 0n }, GENESIS_SEED),
      );
      return currentContractState;
    });

    this.documentChangeDeployment = LocalDeployment.open(join(dataDir, "document_change"), () => {
      const { currentContractState } = this.documentChange.initialState(
        createConstructorContext({ secretKey: new Uint8Array(32), writeCount: 0n }, GENESIS_SEED),
      );
      return currentContractState;
    });
  }

  /** Opens (or, on first use, deploys) the shared local deployments backing `dataDir`. */
  static open(dataDir: string): LocalPrivateScrollClient {
    return new LocalPrivateScrollClient(dataDir);
  }

  // --- authorship ----------------------------------------------------

  async proveAuthorship(privateState: PrivateScrollPrivateState, documentHash: Uint8Array): Promise<Uint8Array> {
    const state = this.authorshipDeployment.loadState();
    const context = this.authorshipDeployment.freshContext(state, privateState);
    const result = await this.authorship.impureCircuits.proveAuthorship(context, documentHash);
    this.authorshipDeployment.saveState(this.authorshipDeployment.updateState(state, result.context));
    return result.result;
  }

  async proveWorkHistory(
    privateState: PrivateScrollPrivateState,
    documentHash: Uint8Array,
    modifiedHash: Uint8Array,
    numPastes: bigint,
  ): Promise<boolean> {
    const state = this.authorshipDeployment.loadState();
    const context = this.authorshipDeployment.freshContext(state, privateState);
    const result = await this.authorship.impureCircuits.proveWorkHistory(context, documentHash, modifiedHash, numPastes);
    this.authorshipDeployment.saveState(this.authorshipDeployment.updateState(state, result.context));
    return result.result;
  }

  async proveAuthorshipAnonymous(privateState: PrivateScrollPrivateState, documentHash: Uint8Array): Promise<boolean> {
    const state = this.authorshipDeployment.loadState();
    const context = this.authorshipDeployment.freshContext(state, privateState);
    const result = await this.authorship.impureCircuits.proveAuthorshipAnonymous(context, documentHash);
    return result.result;
  }

  async proveAuthorshipWithIdentity(privateState: PrivateScrollPrivateState, documentHash: Uint8Array): Promise<Uint8Array> {
    const state = this.authorshipDeployment.loadState();
    const context = this.authorshipDeployment.freshContext(state, privateState);
    const result = await this.authorship.impureCircuits.proveAuthorshipWithIdentity(context, documentHash);
    return result.result;
  }

  async authorizeDocumentShare(
    privateState: PrivateScrollPrivateState,
    documentHash: Uint8Array,
    recipientKeyHash: Uint8Array,
    accessLevel: AccessLevel,
    nonce: Uint8Array,
  ): Promise<Uint8Array> {
    const state = this.authorshipDeployment.loadState();
    const context = this.authorshipDeployment.freshContext(state, privateState);
    const result = await this.authorship.impureCircuits.authorizeDocumentShare(
      context,
      documentHash,
      recipientKeyHash,
      accessLevel,
      nonce,
    );
    this.authorshipDeployment.saveState(this.authorshipDeployment.updateState(state, result.context));
    return result.result;
  }

  async revokeDocumentShare(privateState: PrivateScrollPrivateState, shareId: Uint8Array): Promise<void> {
    const state = this.authorshipDeployment.loadState();
    const context = this.authorshipDeployment.freshContext(state, privateState);
    const result = await this.authorship.impureCircuits.revokeDocumentShare(context, shareId);
    this.authorshipDeployment.saveState(this.authorshipDeployment.updateState(state, result.context));
  }

  async verifyReadPermission(privateState: PrivateScrollPrivateState, shareId: Uint8Array): Promise<AccessLevel> {
    const state = this.authorshipDeployment.loadState();
    const context = this.authorshipDeployment.freshContext(state, privateState);
    const result = await this.authorship.impureCircuits.verifyReadPermission(context, shareId);
    return result.result;
  }

  async readAuthorshipLedger(): Promise<AuthorshipLedger> {
    return authorshipLedger(this.authorshipDeployment.loadState().data);
  }

  // --- document change -------------------------------------------------

  async proveDocumentChange(
    privateState: PrivateScrollPrivateState,
    originalHash: Uint8Array,
    modifiedHash: Uint8Array,
    salt: Uint8Array,
  ): Promise<Uint8Array> {
    const state = this.documentChangeDeployment.loadState();
    const context = this.documentChangeDeployment.freshContext(state, privateState);
    const result = await this.documentChange.impureCircuits.proveDocumentChange(context, originalHash, modifiedHash, salt);
    this.documentChangeDeployment.saveState(this.documentChangeDeployment.updateState(state, result.context));
    return result.result;
  }

  async proveChangeByAuthor(
    privateState: PrivateScrollPrivateState,
    originalHash: Uint8Array,
    modifiedHash: Uint8Array,
    salt: Uint8Array,
  ): Promise<Uint8Array> {
    const state = this.documentChangeDeployment.loadState();
    const context = this.documentChangeDeployment.freshContext(state, privateState);
    const result = await this.documentChange.impureCircuits.proveChangeByAuthor(context, originalHash, modifiedHash, salt);
    this.documentChangeDeployment.saveState(this.documentChangeDeployment.updateState(state, result.context));
    return result.result;
  }

  async readDocumentChangeLedger(): Promise<DocumentChangeLedger> {
    return documentChangeLedger(this.documentChangeDeployment.loadState().data);
  }
}
