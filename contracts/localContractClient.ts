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
import { createLedgerStore, type LedgerStore } from "./ledgerStore.js";
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
 * One shared, durably-persisted deployment of a single compiled contract.
 * Every identity that calls it shares the same ledger; only the witness
 * values (the secret key/write count resolved by `PrivateScrollPrivateState`)
 * differ per call. Backed by a LedgerStore (see ledgerStore.ts) — a local
 * file for dev, or MongoDB when deployed somewhere without a persistent
 * disk.
 */
class LocalDeployment {
  private constructor(
    private readonly store: LedgerStore,
    readonly address: ContractAddress,
  ) {}

  static async open(store: LedgerStore, initialState: () => ContractState): Promise<LocalDeployment> {
    if (!(await store.hasState())) {
      const address = sampleContractAddress();
      await store.saveState(initialState().serialize());
      await store.saveAddress(address);
      return new LocalDeployment(store, address);
    }
    const address = (await store.loadAddress()) as ContractAddress;
    return new LocalDeployment(store, address);
  }

  async loadState(): Promise<ContractState> {
    return ContractState.deserialize(await this.store.loadState());
  }

  async saveState(state: ContractState): Promise<void> {
    await this.store.saveState(state.serialize());
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

  private constructor(
    authorship: AuthorshipContract<PrivateScrollPrivateState>,
    documentChange: DocumentChangeContract<PrivateScrollPrivateState>,
    authorshipDeployment: LocalDeployment,
    documentChangeDeployment: LocalDeployment,
  ) {
    this.authorship = authorship;
    this.documentChange = documentChange;
    this.authorshipDeployment = authorshipDeployment;
    this.documentChangeDeployment = documentChangeDeployment;
  }

  /** Opens (or, on first use, deploys) the shared deployments backing `dataDir`. */
  static async open(dataDir: string): Promise<LocalPrivateScrollClient> {
    const authorship = new AuthorshipContract<PrivateScrollPrivateState>(authorshipWitnesses);
    const documentChange = new DocumentChangeContract<PrivateScrollPrivateState>(documentChangeWitnesses);

    const authorshipDeployment = await LocalDeployment.open(await createLedgerStore("authorship", dataDir), () => {
      const { currentContractState } = authorship.initialState(
        createConstructorContext({ secretKey: new Uint8Array(32), writeCount: 0n }, GENESIS_SEED),
      );
      return currentContractState;
    });

    const documentChangeDeployment = await LocalDeployment.open(await createLedgerStore("document_change", dataDir), () => {
      const { currentContractState } = documentChange.initialState(
        createConstructorContext({ secretKey: new Uint8Array(32), writeCount: 0n }, GENESIS_SEED),
      );
      return currentContractState;
    });

    return new LocalPrivateScrollClient(authorship, documentChange, authorshipDeployment, documentChangeDeployment);
  }

  // --- authorship ----------------------------------------------------

  async proveAuthorship(privateState: PrivateScrollPrivateState, documentHash: Uint8Array): Promise<Uint8Array> {
    const state = await this.authorshipDeployment.loadState();
    const context = this.authorshipDeployment.freshContext(state, privateState);
    const result = await this.authorship.impureCircuits.proveAuthorship(context, documentHash);
    await this.authorshipDeployment.saveState(this.authorshipDeployment.updateState(state, result.context));
    return result.result;
  }

  async proveWorkHistory(
    privateState: PrivateScrollPrivateState,
    documentHash: Uint8Array,
    modifiedHash: Uint8Array,
    numPastes: bigint,
  ): Promise<boolean> {
    const state = await this.authorshipDeployment.loadState();
    const context = this.authorshipDeployment.freshContext(state, privateState);
    const result = await this.authorship.impureCircuits.proveWorkHistory(context, documentHash, modifiedHash, numPastes);
    await this.authorshipDeployment.saveState(this.authorshipDeployment.updateState(state, result.context));
    return result.result;
  }

  async proveAuthorshipAnonymous(privateState: PrivateScrollPrivateState, documentHash: Uint8Array): Promise<boolean> {
    const state = await this.authorshipDeployment.loadState();
    const context = this.authorshipDeployment.freshContext(state, privateState);
    const result = await this.authorship.impureCircuits.proveAuthorshipAnonymous(context, documentHash);
    return result.result;
  }

  async proveAuthorshipWithIdentity(privateState: PrivateScrollPrivateState, documentHash: Uint8Array): Promise<Uint8Array> {
    const state = await this.authorshipDeployment.loadState();
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
    const state = await this.authorshipDeployment.loadState();
    const context = this.authorshipDeployment.freshContext(state, privateState);
    const result = await this.authorship.impureCircuits.authorizeDocumentShare(
      context,
      documentHash,
      recipientKeyHash,
      accessLevel,
      nonce,
    );
    await this.authorshipDeployment.saveState(this.authorshipDeployment.updateState(state, result.context));
    return result.result;
  }

  async authorizeSubShare(
    privateState: PrivateScrollPrivateState,
    existingShareId: Uint8Array,
    recipientKeyHash: Uint8Array,
    accessLevel: AccessLevel,
    nonce: Uint8Array,
  ): Promise<Uint8Array> {
    const state = await this.authorshipDeployment.loadState();
    const context = this.authorshipDeployment.freshContext(state, privateState);
    const result = await this.authorship.impureCircuits.authorizeSubShare(
      context,
      existingShareId,
      recipientKeyHash,
      accessLevel,
      nonce,
    );
    await this.authorshipDeployment.saveState(this.authorshipDeployment.updateState(state, result.context));
    return result.result;
  }

  async revokeDocumentShare(privateState: PrivateScrollPrivateState, shareId: Uint8Array): Promise<void> {
    const state = await this.authorshipDeployment.loadState();
    const context = this.authorshipDeployment.freshContext(state, privateState);
    const result = await this.authorship.impureCircuits.revokeDocumentShare(context, shareId);
    await this.authorshipDeployment.saveState(this.authorshipDeployment.updateState(state, result.context));
  }

  async verifyReadPermission(privateState: PrivateScrollPrivateState, shareId: Uint8Array): Promise<AccessLevel> {
    const state = await this.authorshipDeployment.loadState();
    const context = this.authorshipDeployment.freshContext(state, privateState);
    const result = await this.authorship.impureCircuits.verifyReadPermission(context, shareId);
    return result.result;
  }

  async readAuthorshipLedger(): Promise<AuthorshipLedger> {
    return authorshipLedger((await this.authorshipDeployment.loadState()).data);
  }

  // --- document change -------------------------------------------------

  async proveDocumentChange(
    privateState: PrivateScrollPrivateState,
    originalHash: Uint8Array,
    modifiedHash: Uint8Array,
    salt: Uint8Array,
  ): Promise<Uint8Array> {
    const state = await this.documentChangeDeployment.loadState();
    const context = this.documentChangeDeployment.freshContext(state, privateState);
    const result = await this.documentChange.impureCircuits.proveDocumentChange(context, originalHash, modifiedHash, salt);
    await this.documentChangeDeployment.saveState(this.documentChangeDeployment.updateState(state, result.context));
    return result.result;
  }

  async proveChangeByAuthor(
    privateState: PrivateScrollPrivateState,
    originalHash: Uint8Array,
    modifiedHash: Uint8Array,
    salt: Uint8Array,
  ): Promise<Uint8Array> {
    const state = await this.documentChangeDeployment.loadState();
    const context = this.documentChangeDeployment.freshContext(state, privateState);
    const result = await this.documentChange.impureCircuits.proveChangeByAuthor(context, originalHash, modifiedHash, salt);
    await this.documentChangeDeployment.saveState(this.documentChangeDeployment.updateState(state, result.context));
    return result.result;
  }

  async readDocumentChangeLedger(): Promise<DocumentChangeLedger> {
    return documentChangeLedger((await this.documentChangeDeployment.loadState()).data);
  }
}
