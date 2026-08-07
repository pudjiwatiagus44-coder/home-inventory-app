export type RecognitionRateLimiter = {
  tryConsume: (key: string) => boolean;
};

export function createRecognitionRateLimiter(options: {
  limit: number;
  windowMs: number;
  now?: () => number;
}): RecognitionRateLimiter {
  const hits = new Map<string, number[]>();
  const now = options.now ?? Date.now;

  return {
    tryConsume(key) {
      const current = now();
      const timestamps = (hits.get(key) ?? []).filter(
        (timestamp) => current - timestamp < options.windowMs,
      );

      if (timestamps.length >= options.limit) {
        hits.set(key, timestamps);
        return false;
      }

      timestamps.push(current);
      hits.set(key, timestamps);
      return true;
    },
  };
}
