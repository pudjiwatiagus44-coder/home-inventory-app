import { createHmac, randomBytes } from "node:crypto";

export type SessionRecord = {
  expiresAt: Date;
  revokedAt: Date | null;
};

export const SESSION_DURATION_DAYS = 30;

export function createSessionToken(
  getRandomBytes: (size: number) => Buffer = randomBytes,
): string {
  return getRandomBytes(32).toString("base64url");
}

export function createSessionExpiry(now: Date = new Date()): Date {
  return new Date(
    now.getTime() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000,
  );
}

export function hashSessionToken(token: string, secret: string): string {
  if (!secret) {
    throw new Error("SESSION_SECRET is required");
  }

  return createHmac("sha256", secret).update(token).digest("hex");
}

export function isSessionUsable(
  session: SessionRecord,
  now: Date = new Date(),
): boolean {
  if (session.revokedAt) {
    return false;
  }

  return session.expiresAt.getTime() > now.getTime();
}
