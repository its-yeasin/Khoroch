import mongoose, { type ClientSession } from "mongoose";

let cachedTxSupport: boolean | null = null;

export function resetTransactionSupportCache(): void {
  cachedTxSupport = null;
}

function detectTopologySupportsTransactions(): boolean {
  if (cachedTxSupport !== null) {
    return cachedTxSupport;
  }
  try {
    const client = mongoose.connection.getClient() as unknown as {
      topology?: {
        description?: {
          type?: string;
        };
      };
    };
    const topoType = client?.topology?.description?.type;
    if (
      topoType === "ReplicaSetWithPrimary" ||
      topoType === "ReplicaSetNoPrimary" ||
      topoType === "Sharded" ||
      topoType === "LoadBalanced"
    ) {
      cachedTxSupport = true;
      return true;
    }
    if (topoType === "Single") {
      cachedTxSupport = false;
      return false;
    }
  } catch {
    // Fall through and let runtime probe decide
  }
  return true;
}

function isUnsupportedTransactionError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: number }).code;
  const message = String((err as { message?: string }).message ?? "");
  return (
    code === 20 ||
    code === 303 ||
    message.includes(
      "Transaction numbers are only allowed on a replica set member or mongos",
    ) ||
    message.includes("does not support transactions")
  );
}

/**
 * Executes `fn` inside a MongoDB ACID transaction when supported by the deployment
 * (e.g., MongoDB Atlas replica set or ReplicaSet test server).
 *
 * If connected to a standalone MongoDB instance that does not support multi-document
 * transactions, executes `fn(null)` safely relying on single-document atomic guards,
 * optimistic concurrency version checks, and explicit compensation logic in services.
 */
export async function withDatabaseTransaction<T>(
  fn: (session: ClientSession | null) => Promise<T>,
): Promise<T> {
  if (!detectTopologySupportsTransactions()) {
    return fn(null);
  }

  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    cachedTxSupport = true;
    return result;
  } catch (err) {
    if (isUnsupportedTransactionError(err)) {
      cachedTxSupport = false;
      await session.endSession();
      return fn(null);
    }
    throw err;
  } finally {
    await session.endSession().catch(() => undefined);
  }
}
