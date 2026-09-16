# What is PrivateScroll?

*A guide for anyone — no blockchain or cryptography background required. If you want the full technical architecture (diagrams, contract code, verification steps), see the [main README](../README.md); this page is the plain-language explanation that sits underneath it.*

---

## The one-sentence version

PrivateScroll is a private document editor where you can **prove** things about your writing — who wrote it, that it's genuine, who's allowed to read it — instead of having to **trust** someone's word for it, including PrivateScroll's own.

---

## The problem, in plain terms

Think about any private notes app, document tool, or cloud drive you use today. When you save something private in it, you're trusting the company behind it on a few things at once:

- Trusting them not to look at your content.
- Trusting them not to get hacked.
- Trusting them not to quietly alter or fabricate a record of who wrote what, or when.

Most of the time that trust is fine. But for anything where it actually matters — a journalist protecting a source, a researcher establishing they had an idea first, a team that wants a real audit trail rather than a company's assurance — there's usually no way to actually *check* that trust was honored. You just have to believe it.

## How PrivateScroll solves it

PrivateScroll replaces "trust us" with "check for yourself," using a kind of math called a **zero-knowledge proof**.

Here's the idea in everyday terms: imagine proving you know the password to a locked door — without ever saying the password out loud, and without the person checking ever learning it either. They just get a yes/no: *this person genuinely knows it.* That's a zero-knowledge proof. You prove a fact is true without revealing the private information behind it.

PrivateScroll uses this for three things about your documents:

1. **Who wrote it.** When you save a document for the first time, PrivateScroll proves you're the one registering it — tied to a private identity only you control, not your name or account.
2. **That it's genuine writing, not a paste-dump.** Every save proves you actually typed more than you pasted — without ever revealing exactly how much you wrote. The exact number stays private; only the pass/fail result becomes public.
3. **Who's allowed to read it.** When you share a document, only the real recipient can prove they're the one it was shared with — and only they can decrypt it. Not PrivateScroll, not anyone who happens to find the link.

None of these are promises from PrivateScroll about how the app behaves. They're facts anyone can independently check, because they're backed by real cryptographic circuits — not application code that could quietly change or lie.

### Choosing what to reveal

You don't have to choose between total anonymity and full transparency — PrivateScroll lets the same proof serve either purpose:

- **Stay anonymous.** Prove you're a document's author without revealing who you are — useful if you want credit to exist without your identity being attached.
- **Claim credit publicly.** Opt in to revealing your identity for a specific document, whenever you choose to.

Same underlying proof, different choices about what gets shown. This is called **selective disclosure**.

---

## A quick example

Say Alice is a researcher who wants to establish she had a specific idea first, without publishing it yet.

1. She writes it in PrivateScroll. The moment she saves it, PrivateScroll registers her as the author — permanently, tied to a private key only she holds.
2. She keeps working on it over the next few weeks. Every save proves it's real, evolving work — not a single paste-dump backdated to look old.
3. Months later, she wants to loop in a collaborator, Bob, without making the document public. She shares it directly with him: only Bob's key can unlock it, and only Bob's key can prove he was the one granted access.
4. If Alice ever needs to demonstrate she authored the idea before anyone else, the proof already exists — she doesn't need PrivateScroll (the company/project) to vouch for her. Anyone can check it independently.

At no point did a server need to be trusted with the actual content, or with an honest account of who did what.

---

## What you can actually do with it today

- Write and save documents, encrypted before they ever leave your browser.
- Prove you authored a document, permanently, the first time you save it.
- Prove a save is genuine effort, not a paste-dump — without revealing your write count.
- Choose whether to stay anonymous or claim credit publicly, per document.
- See a real edit history for each document, each version provably tied to you.
- Share a document with exactly one other person, end-to-end encrypted, with sharing itself gated by an on-chain check that only the real author can authorize it.
- Do all of this without a wallet, via a temporary local identity — or connect a real Midnight-compatible wallet (like 1AM or Lace) if you have one.

## What it can't do yet

Being upfront about limits matters as much as explaining the features:

- This build runs against a local simulator of the proving system, not a live public Midnight blockchain node — see the main README for exactly what that means and what's planned next.
- Read permissions currently have one shared meaning ("can this person open it") rather than fine-grained levels like "can view but not verify."
- There's no "list everything shared with me" view yet — you need the specific share link someone sent you.

---

## Frequently asked questions

**Do I need a cryptocurrency wallet to use this?**
No. A local identity is created automatically the first time you open the app, so every feature — saving, proving, sharing — works without one. Connecting a real Midnight-compatible wallet is optional.

**Can PrivateScroll's creators read my documents?**
No. Content is encrypted in your browser before it's ever sent anywhere, using a key that isn't sent along with it. Sharing works the same way — the document's key is individually wrapped for the specific recipient using their own key, so only they can unlock it.

**What is Midnight Network, and why does it matter here?**
Midnight is a blockchain built specifically so applications can make provable claims about data without exposing the data itself. PrivateScroll's proofs (authorship, genuine effort, read permission) are written in Midnight's own smart-contract language, Compact, rather than being ordinary application logic that has to be trusted.

**What happens if I lose access to my browser/identity?**
Today, a lost local identity or wallet means losing access to whatever was tied to it — there's no account-recovery flow yet. This is a known, listed limitation (see "What it can't do yet" above).

**Is this "real," or a mockup?**
Every proof described here runs against real, compiled cryptographic circuits — not a simulated response. What's not yet real is a live connection to Midnight's public network; see the main README's verification section for exactly what has and hasn't been tested end-to-end.

---

## For developers

This section assumes familiarity with smart contracts and web app architecture. For the full picture — architecture diagrams, the exact contracts, how to run and verify it yourself — see the [main README](../README.md), especially:

- [Architecture](../README.md#architecture) — system diagrams and save/share sequence flows
- [Midnight's dual-ledger model](../README.md#midnights-dual-ledger-model) — how public ledger state and private witness state are split, and why that split is what makes selective disclosure possible
- [How Midnight Network features are used](../README.md#how-midnight-network-features-are-used)
- [Verifying it actually works](../README.md#verifying-it-actually-works) — how to independently confirm every claim on this page

In short: authorship, work-history, and sharing permissions are enforced by Compact circuits (`contracts/src/authorship.compact`, `contracts/src/document_change.compact`), executed by a relayer that never generates or stores anyone's secret key — every proof call carries the caller's key for that one request only. The backend independently re-verifies every proof against the relayer's ledger state before persisting anything, rather than trusting a client-reported pass/fail flag.

---

## Glossary

- **Zero-knowledge proof** — a way to prove a fact is true without revealing the private information behind it.
- **Compact** — Midnight's smart-contract language, used to write the circuits behind every proof in this app.
- **Circuit** — a piece of provable logic (e.g. "prove writes outnumber pastes") compiled from Compact source code.
- **Selective disclosure** — choosing, per proof, exactly what gets revealed publicly versus kept private.
- **Ledger** — the public, on-chain record a circuit can read and write; anyone can verify what's in it.
- **Witness** — a private value (like your secret key) that a circuit uses locally but never transmits.
- **Relayer** — the service that runs compiled circuits on request; in PrivateScroll it's deliberately stateless, so it never becomes a store of anyone's secret.
