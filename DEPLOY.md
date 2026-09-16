# Deploying PrivateScroll

This deploys all three pieces to free tiers: the frontend to Vercel, the
backend + relayer to Render (two persistent Node services — they need a
long-running process, not serverless, since the relayer holds an
in-process circuit runtime), and MongoDB Atlas for real persistent
storage. Total cost: $0/month.

Nothing here is a mock standing in for deployment — every service below
runs the exact same code already verified locally (see the main
[README](README.md)'s "Verifying it actually works" section). The one
thing that changes for a shared deployment: the relayer never generates
or stores anyone's secret key (see `contracts/relayer.ts`), and its
ledger state lives in MongoDB instead of local disk, since Render's free
tier has no persistent disk (see `contracts/ledgerStore.ts`).

## Order matters

Deploy in this order — later steps need URLs/values from earlier ones:

1. MongoDB Atlas → connection string
2. Render (relayer, then backend) → two public URLs
3. Vercel (frontend) → needs both Render URLs at build time

## 1. MongoDB Atlas

1. Create a free account at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) if you don't have one.
2. Create a new project, then build a free **M0** cluster (any region close to you).
3. **Database Access** → add a database user (username + password, "Read and write to any database").
4. **Network Access** → add IP address `0.0.0.0/0` ("allow access from anywhere"). Free-tier Render services don't have static IPs, so this is required — access is still gated by the username/password.
5. **Connect** → "Drivers" → copy the connection string. It looks like:
   ```
   mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
   ```
   Replace `<username>`/`<password>` with the real values (URL-encode any special characters in the password).

Keep this string — it's `MONGODB_URI` in the next step.

## 2. Render (relayer + backend)

This repo includes a [render.yaml](render.yaml) Blueprint that defines both
services at once.

1. Push this repo to GitHub if it isn't already (`git remote -v` to check).
2. At [dashboard.render.com](https://dashboard.render.com), click **New > Blueprint**, connect your GitHub account, and pick this repo.
3. Render reads `render.yaml` and shows two services: `privatescroll-relayer` and `privatescroll-backend`. Click through to create them.
4. Render will pause on the `sync: false` env vars, asking you to fill them in:
   - **privatescroll-relayer**: `MONGODB_URI` → the Atlas connection string from step 1.
   - **privatescroll-backend**: `MONGODB_URI` → the same Atlas connection string. `MIDNIGHT_RELAYER_URL` → leave blank for now (see step 5).
5. Deploy. The relayer's build installs the Compact toolchain and compiles both contracts with real proving keys — this takes about 1.5–2 minutes, comfortably inside Render's free build timeout. The backend's build is a plain `tsc` compile, well under a minute.
6. Once both services show "Live", copy each one's URL from its dashboard page (top of the service page, looks like `https://privatescroll-relayer-xxxx.onrender.com`).
7. Go to **privatescroll-backend → Environment**, set `MIDNIGHT_RELAYER_URL` to the relayer's URL from step 6 (no trailing slash), and save — this triggers a redeploy of just that env var, no rebuild needed.
8. Sanity check both services from your own machine:
   ```
   curl https://<your-relayer>.onrender.com/status
   curl https://<your-backend>.onrender.com/api/status
   ```
   Both should return `{"ok":true}` / `{"message":"OK"}`. The first request after any period of inactivity will be slow (free-tier services sleep after 15 minutes idle and take ~30–50s to wake up) — that's expected, not a bug.

## 3. Vercel (frontend)

1. At [vercel.com/new](https://vercel.com/new), import this same GitHub repo.
2. Vercel will ask for a **Root Directory** — set it to `front`. It auto-detects Vite; leave the build/output settings on their defaults (`npm run build`, output `dist`).
3. Before deploying, add these **Environment Variables** (Production, and Preview if you want preview deploys to work too):
   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `https://<your-backend>.onrender.com/api` |
   | `VITE_MIDNIGHT_RELAYER_URL` | `https://<your-relayer>.onrender.com` |
   | `VITE_MIDNIGHT_NETWORK` | `preprod` (or whatever network your wallet is on) |

   These are baked into the static bundle at build time (Vite's `import.meta.env` convention) — there's no way to change them after the fact without a rebuild, which Vercel does automatically if you edit them and redeploy.
4. Deploy. Vercel gives you a `https://<project>.vercel.app` URL — that's the link you share.

`front/vercel.json` already includes the SPA rewrite Vercel needs for client-side routes like `/document/:id` to work on a direct load or refresh (without it, those would 404).

## 4. Verify the live deployment

Open the Vercel URL in a real browser and run through the golden path:
create a document, type content, save (this calls the live relayer's
`proveAuthorship`/`proveWorkHistory` and the live backend), reload the
page (confirms the backend + Atlas round trip), and try sharing with a
second browser/incognito window (confirms the relayer's real
`verifyReadPermission` circuit check works cross-origin). If a wallet
extension (1AM/Lace) is installed and set to the same network as
`VITE_MIDNIGHT_NETWORK`, "Connect wallet" should work too; otherwise the
local dev-identity fallback keeps everything else testable.

## Known limitations of this deployment

- **Free-tier cold starts.** Both Render services sleep after 15 minutes of inactivity and take ~30–50s to wake on the next request. Not a correctness issue, just a first-click delay.
- **Still no live Midnight node/proof server.** Exactly as documented in the main README — proof generation runs through `@midnight-ntwrk/compact-runtime`'s in-process simulator, not a real chain submission. Deploying doesn't change that; it makes the same real circuit execution reachable by anyone instead of just localhost.
- **One shared relayer ledger for everyone who uses this deployment.** That's inherent to this being a single demo instance of a local-relayer stand-in for a real node — it's not a privacy issue (the ledger only ever holds what a real Midnight ledger would hold: hashes and key hashes, never secrets, per `contracts/relayer.ts`), but it does mean this deployment is a shared demo environment, not a multi-tenant production service.
