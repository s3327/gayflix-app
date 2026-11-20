import type { Transaction } from "kysely";
import { database } from "@/lib/database";
import type { DB } from "@/lib/db-types";

class Rollback extends Error {}

/**
 * Runs `fn` inside a transaction on the test database and always rolls it
 * back, so integration tests leave nothing behind. Errors thrown by `fn`
 * come out unchanged.
 */
export async function withRollback<T>(fn: (trx: Transaction<DB>) => Promise<T>): Promise<void> {
  try {
    await database.transaction().execute(async (trx) => {
      await fn(trx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
}
