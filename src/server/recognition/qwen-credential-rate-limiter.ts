export type QwenCredentialRateLimiter = {
  tryAcquire: (trustedServerUserId: string) => (() => void) | null;
};

export function createQwenCredentialRateLimiter(options: {
  maxRequests: number;
  windowMs: number;
  maxConcurrent: number;
  now?: () => number;
}): QwenCredentialRateLimiter {
  const hits = new Map<string, number[]>();
  const active = new Map<string, number>();
  const now = options.now ?? Date.now;

  return {
    tryAcquire(trustedServerUserId) {
      const current = now();
      const recent = (hits.get(trustedServerUserId) ?? []).filter(
        (timestamp) => current - timestamp < options.windowMs,
      );
      if ((active.get(trustedServerUserId) ?? 0) >= options.maxConcurrent || recent.length >= options.maxRequests) {
        hits.set(trustedServerUserId, recent);
        return null;
      }
      recent.push(current);
      hits.set(trustedServerUserId, recent);
      active.set(trustedServerUserId, (active.get(trustedServerUserId) ?? 0) + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const remaining = (active.get(trustedServerUserId) ?? 1) - 1;
        if (remaining === 0) active.delete(trustedServerUserId);
        else active.set(trustedServerUserId, remaining);
      };
    },
  };
}
