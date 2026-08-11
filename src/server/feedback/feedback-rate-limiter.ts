export class FeedbackRateLimitExceededError extends Error {
  constructor() {
    super("反馈发送过于频繁，请稍后再试");
    this.name = "FeedbackRateLimitExceededError";
  }
}

type FeedbackRateLimiterDependencies = {
  maxRequests?: number;
  windowMs?: number;
  now?: () => number;
};

export type FeedbackRateLimiter = {
  check: (key: string) => void;
};

export function createFeedbackRateLimiter(
  deps: FeedbackRateLimiterDependencies = {},
): FeedbackRateLimiter {
  const maxRequests = deps.maxRequests ?? 3;
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
        throw new FeedbackRateLimitExceededError();
      }

      recent.push(currentTime);
      hits.set(key, recent);
    },
  };
}
