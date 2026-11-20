/**
 * Resolves with `work`'s result, but no sooner than `floorMs` after the
 * call. Sign-up uses it so that a new address (Supabase sends an email
 * inside the request) and a taken one (no email) take the same time, and
 * timing can't tell anyone who has an account.
 */
export async function atLeast<T>(floorMs: number, work: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    return await work();
  } finally {
    const left = floorMs - (Date.now() - started);
    if (left > 0) await new Promise((resolve) => setTimeout(resolve, left));
  }
}
