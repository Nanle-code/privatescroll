import express from "express";
import {
  appendDocument,
  createDocument,
  createDocumentShare,
  getDocumentById,
  getDocumentByIdAndOwner,
  getDocumentShareByShareId,
  getSharesForRecipient,
  getUserDocuments,
  markDocumentShareRevoked,
} from "./controller";
import {
  RelayerUnavailableError,
  getOnChainShare,
  getRegisteredAuthor,
  isWorkProofRecorded,
} from "./relayerClient";

const router = express.Router();

/** Relayer connectivity failures are a retryable infra problem (502), not a client error (400). */
function respondToError(res: express.Response, error: unknown) {
  if (error instanceof RelayerUnavailableError) {
    return res.status(502).json({ message: error.message });
  }
  return res.status(400).json({ message: error instanceof Error ? error.message : String(error) });
}

router.get("/status", (_req, res) => {
  return res.json({ message: "OK" });
});

router.post("/document/create", async (req, res) => {
  try {
    const { userAddress, contentTitle } = req.body;
    if (!userAddress) {
      return res.status(400).json({ message: "Missing userAddress" });
    }
    const result = await createDocument(userAddress, contentTitle || "Untitled");
    return res.json({ message: result });
  } catch (error) {
    return respondToError(res, error);
  }
});

router.post("/documents", async (req, res) => {
  try {
    const { userAddress, limit, skip } = req.body;
    if (!userAddress) {
      return res.status(400).json({ message: "Missing userAddress" });
    }
    const documents = await getUserDocuments(userAddress, limit, skip);
    return res.json({ message: { documents } });
  } catch (error) {
    return respondToError(res, error);
  }
});

router.get("/document/shares/mine", async (req, res) => {
  try {
    const { recipientKeyHash } = req.query as { recipientKeyHash?: string };
    if (!recipientKeyHash) {
      return res.status(400).json({ message: "Missing recipientKeyHash query parameter" });
    }
    const shares = await getSharesForRecipient(recipientKeyHash);
    return res.json({ message: { shares } });
  } catch (error) {
    return respondToError(res, error);
  }
});

router.get("/document/:id", async (req, res) => {
  try {
    const { userAddress } = req.query as { userAddress?: string };
    if (!userAddress) {
      return res.status(400).json({ message: "Missing userAddress query parameter" });
    }
    const document = await getDocumentByIdAndOwner(req.params.id, userAddress);
    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }
    return res.json({ document });
  } catch (error) {
    return respondToError(res, error);
  }
});

router.post("/document/append", async (req, res) => {
  try {
    const { documentId, userAddress, document, documentHash, modifiedHash } = req.body;
    let { documentTitle } = req.body;

    if (!documentId) return res.status(400).json({ message: "Missing documentId" });
    if (!userAddress) return res.status(400).json({ message: "Missing userAddress" });
    if (!document) return res.status(400).json({ message: "Missing document" });
    if (!documentHash) return res.status(400).json({ message: "Missing documentHash" });
    if (!modifiedHash) return res.status(400).json({ message: "Missing modifiedHash" });

    const existing = await getDocumentByIdAndOwner(documentId, userAddress);
    if (!existing) {
      return res.status(404).json({ message: "Document not found" });
    }

    if (!existing.documentHash) {
      // First save for this document: the client should have already
      // called proveAuthorship. Confirm that actually happened on-chain
      // rather than trusting the request. There's no further "does the
      // on-chain author match this caller" check here — the relayer only
      // ever runs proveAuthorship with the caller's own secret (see
      // contracts/relayer.ts), so a registered author already implies it
      // was this caller who registered it.
      const { registered } = await getRegisteredAuthor(documentHash);
      if (!registered) {
        return res.status(400).json({ message: "Document authorship is not registered on-chain — call proveAuthorship first" });
      }
    } else if (existing.documentHash !== documentHash) {
      return res.status(400).json({ message: "documentHash does not match the document's registered identifier" });
    }

    const workProofRecorded = await isWorkProofRecorded(documentHash, modifiedHash);
    if (!workProofRecorded) {
      return res.status(400).json({ message: "Work-history proof not found on-chain — call proveWorkHistory first" });
    }

    const updated = await appendDocument(documentId, document, documentTitle, documentHash, {
      modifiedHash,
      verifiedAt: new Date(),
    });
    return res.json({ message: updated });
  } catch (error) {
    return respondToError(res, error);
  }
});

router.post("/document/share/authorize", async (req, res) => {
  try {
    const { documentId, documentHash, shareId, senderAddress, recipientKeyHash, accessLevel, wrappedKey, senderEncryptionPublicKey } =
      req.body;

    if (!documentId) return res.status(400).json({ message: "Missing documentId" });
    if (!documentHash) return res.status(400).json({ message: "Missing documentHash" });
    if (!shareId) return res.status(400).json({ message: "Missing shareId" });
    if (!senderAddress) return res.status(400).json({ message: "Missing senderAddress" });
    if (!recipientKeyHash) return res.status(400).json({ message: "Missing recipientKeyHash" });
    if (!accessLevel) return res.status(400).json({ message: "Missing accessLevel" });

    // Deliberately a plain existence lookup, not an ownership check: this
    // route also serves sub-shares (see authorizeSubShare in
    // authorship.compact), where senderAddress is a re-sharer the document
    // was itself shared with, not the document's MongoDB owner. That's
    // fine — the real authorization already happened on-chain, in-circuit
    // (either as the registered author, or as an existing Full-access
    // holder); this lookup only needs the document to exist so the share
    // record can link to a real _id.
    const document = await getDocumentById(documentId);
    if (!document || document.documentHash !== documentHash) {
      return res.status(404).json({ message: "Document not found" });
    }

    const onChainShare = await getOnChainShare(shareId);
    if (!onChainShare.exists) {
      return res.status(400).json({ message: "Share not found on-chain — call authorizeDocumentShare first" });
    }
    if (
      onChainShare.documentHash !== documentHash ||
      onChainShare.recipientKeyHash !== recipientKeyHash ||
      onChainShare.accessLevel !== accessLevel
    ) {
      return res.status(400).json({ message: "On-chain share does not match the request" });
    }

    const record = await createDocumentShare({
      shareId,
      documentId: document._id!,
      documentHash,
      senderAddress,
      recipientKeyHash,
      accessLevel,
      wrappedKey,
      senderEncryptionPublicKey,
    });
    return res.json({ message: record });
  } catch (error) {
    return respondToError(res, error);
  }
});

// Deliberately takes no userAddress/identity: verifying that the caller is
// really the granted recipient requires proving possession of their secret
// key, which only their own browser holds (see verifySharedAccess in
// front/services/midnight.ts — it calls the relayer directly, before this
// route, and the frontend only proceeds here once that real ZK check
// passes). What this route CAN and does check authoritatively, without
// needing anyone's secret, is the on-chain grant's public state: that it
// exists and hasn't been revoked (see getOnChainShare above). shareId
// itself is an unguessable 32-byte hash the sender must deliver to the
// recipient out of band, and the returned content is still ECDH-wrapped to
// the real recipient's key, so a caller who isn't the recipient can fetch
// ciphertext but not read it.
router.get("/document/share/:shareId", async (req, res) => {
  try {
    const { shareId } = req.params;

    const share = await getDocumentShareByShareId(shareId);
    if (!share || share.status !== "active") {
      return res.status(404).json({ message: "Shared document not found" });
    }

    const onChainShare = await getOnChainShare(shareId);
    if (!onChainShare.exists) {
      return res.status(404).json({ message: "Share not found on-chain" });
    }
    if (onChainShare.revoked) {
      await markDocumentShareRevoked(shareId);
      return res.status(403).json({ message: "Share has been revoked on-chain" });
    }

    const document = await getDocumentById(share.documentId.toString());
    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    return res.json({
      message: {
        document,
        accessLevel: onChainShare.accessLevel,
        wrappedKey: share.wrappedKey,
        senderEncryptionPublicKey: share.senderEncryptionPublicKey,
      },
    });
  } catch (error) {
    return respondToError(res, error);
  }
});

export default router;
