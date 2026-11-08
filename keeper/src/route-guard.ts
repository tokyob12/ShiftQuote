const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/// The localhost peer is the tunnel, not a user. A header becomes a client
/// address only when this process is told which single header the tunnel overwrites.
export function clientAddress(
  peer: string | undefined,
  headers: Record<string, string | string[] | undefined>,
  trustedHeader: string | undefined,
): string | null {
  if (!peer || !LOOPBACK.has(peer) || !trustedHeader) return null;
  const raw = headers[trustedHeader.toLowerCase()];
  if (typeof raw !== "string" || raw.trim() === "" || raw.includes(",")) return null;
  const value = raw.trim();
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(value) && !value.includes(":")) return null;
  return value;
}

export function allowRate(
  buckets: Map<string, { at: number; n: number }>,
  key: string,
  now: number,
  max: number,
): boolean {
  const row = buckets.get(key);
  if (!row || now - row.at > 60_000) {
    buckets.set(key, { at: now, n: 1 });
    return true;
  }
  row.n += 1;
  return row.n <= max;
}

export function createGate(maxPending: number) {
  let pending = 0;
  let chain: Promise<void> = Promise.resolve();
  return function run<T>(fn: () => Promise<T>): Promise<T> {
    if (pending >= maxPending) return Promise.reject(new Error("Route book is busy; retry shortly"));
    pending += 1;
    const result = chain.then(fn).finally(() => {
      pending -= 1;
    });
    chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}

export function createSnapshot<T>(ttlMs: number, load: () => Promise<T>) {
  let cached: { at: number; value: T } | null = null;
  let inflight: Promise<T> | null = null;
  return () => {
    if (cached && Date.now() - cached.at < ttlMs) return Promise.resolve(cached.value);
    if (!inflight) {
      inflight = load()
        .then((value) => {
          cached = { at: Date.now(), value };
          return value;
        })
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  };
}
