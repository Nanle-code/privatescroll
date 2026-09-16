import express from "express";
import {
  appendDocument,
  createDocument,
  createDocumentShare,
  getDocumentById,
  getDocumentByIdAndOwner,
  getDocumentShareByShareId,
  getUserDocuments,
  markDocumentShareRevoked,
} from "./controller";
import {
  RelayerUnavailableError,
  getAuthorKeyHash,
  getOnChainShare,
  getRegisteredAuthor,
  isWorkProofRecorded,
  verifySharedAccessOnChain,
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
      // rather than trusting the request.
      const { registered, author } = await getRegisteredAuthor(documentHash);
      if (!registered) {
        return res.status(400).json({ message: "Document authorship is not registered on-chain — call proveAuthorship first" });
      }
      const expectedAuthor = await getAuthorKeyHash(userAddress);
      if (author !== expectedAuthor) {
        return res.status(403).json({ message: "On-chain author does not match the requesting user" });
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

    const document = await getDocumentByIdAndOwner(documentId, senderAddress);
    if (!document) {
      return res.status(404).json({ message: "Document not found for this sender" });
    }

    const onChainShare = await getOnChainShare(shareId);
    if (!onChainShare.exists) {
      return res.status(400).json({ message: "Share not found on-chain — call authorizeDocumentShare first" });
    }
    const expectedSenderKeyHash = await getAuthorKeyHash(senderAddress);
    if (
      onChainShare.senderKeyHash !== expectedSenderKeyHash ||
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

router.get("/document/share/:shareId", async (req, res) => {
  try {
    const { shareId } = req.params;
    const { userAddress } = req.query as { userAddress?: string };
    if (!userAddress) {
      return res.status(400).json({ message: "Missing userAddress query parameter" });
    }

    const share = await getDocumentShareByShareId(shareId);
    if (!share || share.status !== "active") {
      return res.status(404).json({ message: "Shared document not found" });
    }

    const access = await verifySharedAccessOnChain(shareId, userAddress);
    if (access.status === "unavailable") {
      return res.status(502).json({ message: "Could not verify access — the Midnight relayer is unavailable. Try again shortly." });
    }
    if (access.status === "denied") {
      if (access.reason.includes("revoked")) {
        await markDocumentShareRevoked(shareId);
      }
      return res.status(403).json({ message: "Access denied — not the recipient, or the share was revoked on-chain" });
    }

    const document = await getDocumentById(share.documentId.toString());
    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    return res.json({
      message: {
        document,
        accessLevel: access.accessLevel,
        wrappedKey: share.wrappedKey,
        senderEncryptionPublicKey: share.senderEncryptionPublicKey,
      },
    });
  } catch (error) {
    return respondToError(res, error);
  }
});

export default router;
