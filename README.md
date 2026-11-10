# Self Wallet

**Self Wallet** is a production-ready, offline-first personal finance management Progressive Web App (PWA) built with **Next.js (App Router)**, **TypeScript**, **Tailwind CSS**, **MongoDB + Mongoose**, and **IndexedDB (Dexie.js)**.

It is designed mobile-first for daily personal use on smartphones and desktops, and deploys directly to **Vercel** with **MongoDB Atlas** — requiring no separate backend server or Docker container.

---

## Core Features

- **Account Management**:
  - **Cash**: Auto-created on registration/sign-in (`isDefault: true`), cannot be deleted or archived accidentally, supports renaming and balance operations.
  - **Bank Accounts**: Multiple banks (e.g., DBBL, IFIC Bank, BRAC Bank) with optional AES-256-GCM encrypted account numbers (masked in UI) and optional **separate Bank Interest balance** tracking.
  - **Custom Accounts**: People or entities (e.g., John, Alex, Office) selectable as loan counterparties even when their account balance is `৳0.00`. Never mixed into Dashboard asset totals.
- **Centralized Financial Transaction Engine (9 Types)**:
  - `ADD_BALANCE`, `EXPENSE`, `INCOME`, `BANK_INTEREST`, `ACCOUNT_TRANSFER`, `LOAN_RECEIVED`, `LOAN_GIVEN`, `LOAN_REPAYMENT`, and `BALANCE_ADJUSTMENT`.
  - Decimal-safe monetary math using `decimal.js` + MongoDB `Decimal128` (zero floating-point arithmetic).
  - Independent **Main Balance** vs **Interest Balance** (`"Use bank interest balance only"`) enforcement.
  - Full edit & delete ledger recalculation ensuring balances always match opening balance + active transactions.
  - Expense category deletion blocked when referenced by any existing transaction.
- **Loans Management**:
  - Separate tabs for **Loans Received (Money I Owe)** and **Loans Given (Others Owe Me)**.
  - **Person-wise filtering** showing total borrowed/lent, total repaid, outstanding balance, loan count, and chronological repayment timeline.
  - Overpayment prevention and persistent history even after full repayment.
- **Offline-First PWA & Synchronization**:
  - Installable via Chrome (`manifest.webmanifest` + Service Worker `public/sw.js` + PNG app icons).
  - Local IndexedDB persistence (`Dexie.js`) with optimistic local ledger validation and persistent UUID idempotency keys.
  - Automatic sync on app boot, network reconnection (`online`), foreground return (`visibilitychange`), and manual retry — with conflict preservation (`Sync Failed` queue inspection/discard/retry).
- **Security**:
  - `scrypt` password hashing with timing-safe verification.
  - `HS256` JWT sessions in `httpOnly`, `sameSite: lax`, `secure` cookies via `jose`.
  - Route & API user-scoping, Zod schema validation, rate limiting, and AES-256-GCM encryption for bank account numbers.

---

## 1. Environment Variables (`.env.example`)

Create `.env.local` for local development (never commit `.env` or `.env.local` to Git):

```env
MONGODB_URI=
AUTH_SECRET=
APP_URL=
```

- `MONGODB_URI`: MongoDB Atlas SRV connection string (or local MongoDB URI).
- `AUTH_SECRET`: Long random secret string (at least 32 characters; e.g. `openssl rand -base64 32`).
- `APP_URL`: Deployed public URL (e.g. `https://self-wallet.vercel.app` or `http://localhost:3000`).

---

## 2. MongoDB Atlas Setup Instructions

1. Sign in to [MongoDB Atlas](https://www.mongodb.com/atlas) and create a free **M0** (or higher) cluster.
2. Under **Database Access**, create a database user with **Read and write to any database** permissions (copy the username and password).
3. Under **Network Access**, add IP access entries:
   - For Vercel serverless deployments with dynamic outbound IPs, allow `0.0.0.0/0` (protected by strong database user credentials and TLS) or configure Vercel Static IPs / Private Link if on an enterprise plan.
4. Click **Connect -> Drivers**, choose Node.js, and copy your connection string:
   ```
   mongodb+srv://<username>:<password>@<cluster>.mongodb.net/self_wallet?retryWrites=true&w=majority
   ```
5. MongoDB Atlas clusters run as replica sets, which enables full multi-document ACID transactions via `withDatabaseTransaction`. If you connect to a standalone MongoDB server without a replica set, the backend automatically enforces optimistic concurrency control (`version`), atomic balance guards, and compensating rollbacks.

---

## 3. Local Development & Testing

```bash
# Install dependencies
npm install

# Copy env template and configure MONGODB_URI, AUTH_SECRET, APP_URL
cp .env.example .env.local

# Run development server
npm run dev

# Run TypeScript, ESLint, automated tests (includes in-memory MongoDB & IndexedDB), and production build
npm run typecheck
npm run lint
npm test
npm run build
```

---

## 4. Vercel Deployment Instructions

1. Push the repository to GitHub / GitLab / Bitbucket.
2. Open [Vercel](https://vercel.com/) and import the repository (**Framework Preset**: Next.js, **Root Directory**: `./`).
3. Add the environment variables in **Project Settings -> Environment Variables**:
   - `MONGODB_URI` = your MongoDB Atlas SRV URI
   - `AUTH_SECRET` = strong random 32+ char secret (`openssl rand -base64 32`)
   - `APP_URL` = your production Vercel URL (`https://your-app.vercel.app`)
4. Click **Deploy**.
5. Vercel serves the app over HTTPS automatically, which enables Service Worker registration and PWA installation in Chrome.

---

## 5. PWA Installation Instructions (Google Chrome)

### Android (Chrome)
1. Open your deployed Self Wallet URL (`https://...`) in **Google Chrome** and sign in so your initial wallet snapshot caches locally.
2. Tap the **three-dot menu** (`⋮`) in the top-right corner (or tap the **Install App** banner/button in **More & Settings**).
3. Tap **Install app** (or **Add to Home screen**) and confirm **Install**.
4. Launch **Self Wallet** from your home screen — it opens in standalone mobile app mode and works offline.

### Desktop (Chrome / Edge)
1. Visit your deployed Self Wallet URL in Chrome.
2. Click the **Install** icon in the right side of the address bar (or open `⋮ -> Cast, save, and share -> Install Self Wallet`).

---

## 6. Backup, Export & Restore Instructions

1. Navigate to **More & Settings** (`/settings`).
2. **Export CSV**: Downloads all active transactions in CSV format for spreadsheet analysis.
3. **Full JSON Backup**: Downloads a complete snapshot of settings, accounts, categories, loans, and transactions (sensitive encrypted account numbers are never exported; masked references are kept).
4. **Restore / Import JSON Backup**: Upload a previously exported JSON backup file. Every transaction is matched by its `clientTransactionId` idempotency key so importing the same backup multiple times will never create duplicate financial transactions.
