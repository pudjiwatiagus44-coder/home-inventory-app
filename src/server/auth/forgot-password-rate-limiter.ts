export class RateLimitExceededError extends Error {
  constructor() {
    super("请求过于频繁，请稍后再试");
    this.name = "RateLimitExceededError";
  }
}

type ForgotPasswordRateLimiterDependencies = {
  maxRequests?: number;
  windowMs?: number;
  now?: () => number;
};

export type ForgotPasswordRateLimiter = {
  check: (key: string) => void;
};

export function createForgotPasswordRateLimiter(
  deps: ForgotPasswordRateLimiterDependencies = {},
): ForgotPasswordRateLimiter {
  const maxRequests = deps.maxRequests ?? 5;
  const windowMs = deps.windowMs ?? 60 * 60 * 1000;
  const now = deps.now ?? Date.now;
  const hits = new Map<string, number[]>();

  return {
    check(key) {
      const currentTime = now();
      const recent = (hits.get(key) ?? []).filter(
        (timestamp) => timestamp > currentTime - windowMs,
      );

      if (recent.length >= maxRequests) {
        hits.set(key, recent);
        throw new RateLimitExceededError();
      }

      recent.push(currentTime);
      hits.set(key, recent);
    },
  };
}
