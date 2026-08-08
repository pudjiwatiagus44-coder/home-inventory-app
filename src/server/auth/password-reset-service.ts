import type { AuthRepository } from "./auth-service";
import { normalizeAuthEmail } from "./auth-service";
import {
  hashPassword,
  MIN_PASSWORD_LENGTH,
} from "./password-security";
import {
  createSessionToken,
  hashSessionToken,
} from "./session-security";
import type { PasswordResetMailer } from "../mail/smtp-mailer";

export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

export class InvalidResetTokenError extends Error {
  constructor() {
    super("重置链接无效或已过期");
    this.name = "InvalidResetTokenError";
  }
}

export type PasswordResetRepository = Pick<
  AuthRepository,
  | "findUserByEmail"
  | "createPasswordResetToken"
  | "findPasswordResetTokenByHash"
  | "markPasswordResetTokenUsed"
  | "revokeUnusedPasswordResetTokensByUserId"
  | "revokeAllSessionsByUserId"
  | "updateUserPassword"
>;

export type PasswordResetServiceDependencies = {
  repository: PasswordResetRepository;
  mailer: PasswordResetMailer;
  hashToken?: (token: string) => string;
  createToken?: () => string;
  hashPassword?: (password: string) => Promise<string>;
  now?: () => Date;
  buildResetUrl?: (token: string) => string;
};

export type PasswordResetService = {
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (input: { token: string; password: string }) => Promise<void>;
};

export function createPasswordResetService(
  deps: PasswordResetServiceDependencies,
): PasswordResetService {
  const hashToken = deps.hashToken ?? defaultHashToken;
  const createToken = deps.createToken ?? createSessionToken;
  const hashPasswordDependency = deps.hashPassword ?? hashPassword;
  const now = deps.now ?? (() => new Date());
  const buildResetUrl = deps.buildResetUrl ?? defaultBuildResetUrl;

  return {
    async requestPasswordReset(rawEmail) {
      const email = normalizeAuthEmail(rawEmail);
      const user = await deps.repository.findUserByEmail(email);

      if (!user || user.status !== "active") {
        return;
      }

      await deps.repository.revokeUnusedPasswordResetTokensByUserId(user.id);

      const token = createToken();
      const tokenHash = hashToken(token);
      const expiresAt = new Date(now().getTime() + RESET_TOKEN_TTL_MS);

      await deps.repository.createPasswordResetToken({
        userId: user.id,
        tokenHash,
        expiresAt,
      });
      await deps.mailer.sendPasswordResetEmail({
        to: user.email,
        resetUrl: buildResetUrl(token),
      });
    },

    async resetPassword({ token, password }) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        throw new Error("密码至少需要 8 位");
      }

      const tokenHash = hashToken(token);
      const record = await deps.repository.findPasswordResetTokenByHash(
        tokenHash,
      );

      if (
        !record ||
        record.status !== "active" ||
        record.usedAt ||
        record.expiresAt.getTime() <= now().getTime()
      ) {
        throw new InvalidResetTokenError();
      }

      const passwordHash = await hashPasswordDependency(password);
      await deps.repository.updateUserPassword({
        userId: record.userId,
        passwordHash,
      });
      await deps.repository.markPasswordResetTokenUsed(tokenHash);
      await deps.repository.revokeAllSessionsByUserId(record.userId);
    },
  };
}

function defaultHashToken(token: string) {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error("SESSION_SECRET is required");
  }

  return hashSessionToken(token, secret);
}

function defaultBuildResetUrl(token: string) {
  const baseUrl = process.env.RESET_BASE_URL?.trim() || "https://homestorag.xyz";
  return `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
}
