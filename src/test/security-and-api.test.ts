import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const val = cookieJar.get(name);
      return val ? { name, value: val } : undefined;
    },
    set: (name: string, value: string, opts?: { maxAge?: number }) => {
      if (opts?.maxAge === 0 || value === "") {
        cookieJar.delete(name);
      } else {
        cookieJar.set(name, value);
      }
    },
  }),
}));

import {
  decryptSensitiveText,
  encryptSensitiveText,
  maskAccountNumber,
} from "@/lib/auth/crypto";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { signSessionToken, verifySessionToken } from "@/lib/auth/session";
import { resetTransactionSupportCache } from "@/lib/db/transaction";
import { UserModel } from "@/lib/db/models/User";
import { ensureUserBootstrap } from "@/lib/services/bootstrap";
import { createAccount, getAccountOverview } from "@/lib/services/account-service";
import { createTransaction } from "@/lib/services/ledger";
import { GET as getHealth } from "@/app/api/health/route";
import { POST as registerRoute } from "@/app/api/auth/register/route";
import {
  GET as getAccountsRoute,
  POST as postAccountsRoute,
} from "@/app/api/accounts/route";
import { POST as postTxRoute } from "@/app/api/transactions/route";
import { GET as getDashboardRoute } from "@/app/api/dashboard/route";

let standaloneServer: MongoMemoryServer;

beforeAll(async () => {
  standaloneServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = standaloneServer.getUri();
  await mongoose.connect(standaloneServer.getUri());
  resetTransactionSupportCache();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (standaloneServer) {
    await standaloneServer.stop();
  }
});

beforeEach(async () => {
  cookieJar.clear();
  const collections = await mongoose.connection.db?.collections();
  if (collections) {
    for (const c of collections) {
      await c.deleteMany({});
    }
  }
});

describe("Security, Encryption, JWT, API Route Handlers & Standalone MongoDB Fallback", () => {
  it("hashes and verifies passwords with scrypt and timing-safe compare", async () => {
    const hash = await hashPassword("MySecretPass99!");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("MySecretPass99!", hash)).toBe(true);
    expect(await verifyPassword("WrongPassword", hash)).toBe(false);
  });

  it("encrypts sensitive bank account numbers and masks display values", () => {
    const encrypted = encryptSensitiveText("123456789012");
    expect(encrypted).not.toContain("123456789012");
    expect(decryptSensitiveText(encrypted)).toBe("123456789012");
    expect(maskAccountNumber("123456789012")).toBe("•••• 9012");
    expect(maskAccountNumber("123")).toBe("••••");
  });

  it("signs and verifies JWT sessions and rejects tampered tokens", async () => {
    const token = await signSessionToken({
      userId: "507f1f77bcf86cd799439011",
      email: "a@b.com",
      name: "Alice",
    });
    const verified = await verifySessionToken(token);
    expect(verified?.userId).toBe("507f1f77bcf86cd799439011");

    const tampered = `${token.slice(0, -4)}xxxx`;
    expect(await verifySessionToken(tampered)).toBeNull();
  });

  it("enforces authentication and end-to-end API route validation", async () => {
    const healthRes = await getHealth();
    expect(healthRes.status).toBe(200);

    // Unauthenticated access rejected with 401
    const unauthRes = await getAccountsRoute(
      new NextRequest("http://localhost:3000/api/accounts"),
    );
    expect(unauthRes.status).toBe(401);

    // Register via API route -> auto-provisions Cash + sets sw_session cookie
    const regRes = await registerRoute(
      new NextRequest("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "API Tester",
          email: "api@example.com",
          password: "StrongPassword123",
        }),
      }),
    );
    expect(regRes.status).toBe(201);
    expect(cookieJar.get("sw_session")).toBeTruthy();

    // GET /api/accounts returns auto-created Cash
    const accRes = await getAccountsRoute(
      new NextRequest("http://localhost:3000/api/accounts"),
    );
    expect(accRes.status).toBe(200);
    const accJson = await accRes.json();
    expect(accJson.accounts).toHaveLength(1);
    const cash = accJson.accounts[0];
    expect(cash.name).toBe("Cash");

    // POST /api/accounts creates Bank
    const createBankRes = await postAccountsRoute(
      new NextRequest("http://localhost:3000/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "DBBL",
          category: "BANK",
          initialMainBalance: "1000",
          interestEnabled: true,
        }),
      }),
    );
    expect(createBankRes.status).toBe(201);

    // POST /api/transactions rejects overdraft with 400
    const overdraftRes = await postTxRoute(
      new NextRequest("http://localhost:3000/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "ACCOUNT_TRANSFER",
          amount: "5000",
          fromAccountId: cash.id,
          toAccountId: (await createBankRes.json()).account.id,
        }),
      }),
    );
    expect(overdraftRes.status).toBe(400);

    // Dashboard route returns accurate totals
    const dashRes = await getDashboardRoute(
      new NextRequest("http://localhost:3000/api/dashboard?range=MONTH"),
    );
    expect(dashRes.status).toBe(200);
    const dashJson = await dashRes.json();
    expect(dashJson.totalBankBalance).toBe("1000.00");
    expect(dashJson.totalCash).toBe("0.00");
  });

  it("safely executes financial transfers and compensating rollbacks on standalone MongoDB without replica set", async () => {
    const user = await UserModel.create({
      name: "Standalone Tester",
      email: "standalone@example.com",
      passwordHash: await hashPassword("Pass12345"),
    });
    const userId = user._id.toString();
    await ensureUserBootstrap(userId);

    const { account: bank } = await createAccount(userId, {
      name: "City Bank",
      category: "BANK",
      initialMainBalance: "1000.00",
    });

    const accounts = await mongoose.connection.db
      ?.collection("accounts")
      .find({ userId: user._id, isDefault: true })
      .toArray();
    const cashId = accounts![0]._id.toString();

    await createTransaction(userId, {
      type: "ACCOUNT_TRANSFER",
      amount: "350.00",
      fromAccountId: bank.id,
      toAccountId: cashId,
    });

    const bankOverview = await getAccountOverview(userId, bank.id);
    const cashOverview = await getAccountOverview(userId, cashId);
    expect(bankOverview.account.currentMainBalance).toBe("650.00");
    expect(cashOverview.account.currentMainBalance).toBe("350.00");

    // Attempt overdraft transfer on standalone -> rejects without corrupting source balance
    await expect(
      createTransaction(userId, {
        type: "ACCOUNT_TRANSFER",
        amount: "900.00",
        fromAccountId: bank.id,
        toAccountId: cashId,
      }),
    ).rejects.toThrow(/Insufficient main balance/i);

    expect(
      (await getAccountOverview(userId, bank.id)).account.currentMainBalance,
    ).toBe("650.00");
  });
});
