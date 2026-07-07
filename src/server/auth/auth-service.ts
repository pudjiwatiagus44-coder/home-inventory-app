import { validateAuthCredentials } from "../../features/auth/auth-validation";
import { hashPassword, verifyPassword } from "./password-security";
import {
  createSessionExpiry,
  createSessionToken,
  hashSessionToken,
  isSessionUsable,
} from "./session-security";

export type AuthUserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  status: "active" | "disabled";
};

export type AuthRepository = {
  findUserByEmail: (email: string) => Promise<AuthUserRecord | null>;
  findSessionByHash: (
    sessionTokenHash: string,
  ) => Promise<AuthSessionRecord | null>;
  createUserWithDefaultHousehold: (input: {
    email: string;
    passwordHash: string;
  }) => Promise<{ userId: string }>;
  createSession: (input: {
    userId: string;
    sessionTokenHash: string;
    expiresAt: Date;
  }) => Promise<void>;
  revokeSessionByHash: (sessionTokenHash: string) => Promise<void>;
};

export type AuthSessionRecord = {
  userId: string;
  email: string;
  status: "active" | "disabled";
  expiresAt: Date;
  revokedAt: Date | null;
};

export type AuthResult = {
  userId: string;
  sessionToken: string;
  expiresAt: Date;
};

export type CurrentUser = {
  userId: string;
  email: string;
};

type AuthServiceDependencies = {
  repository: AuthRepository;
  hashPassword?: (password: string) => Promise<string>;
  verifyPassword?: (password: string, passwordHash: string) => Promise<boolean>;
  createSessionToken?: () => string;
  hashSessionToken?: (token: string) => string;
  createSessionExpiry?: () => Date;
};

type AuthCredentials = {
  email: string;
  password: string;
};

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password");
    this.name = "InvalidCredentialsError";
  }
}

export class DuplicateEmailError extends Error {
  constructor() {
    super("Email is already registered");
    this.name = "DuplicateEmailError";
  }
}

export class DisabledUserError extends Error {
  constructor() {
    super("User is disabled");
    this.name = "DisabledUserError";
  }
}

export function normalizeAuthEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createAuthService({
  repository,
  hashPassword: hashPasswordDependency = hashPassword,
  verifyPassword: verifyPasswordDependency = verifyPassword,
  createSessionToken: createSessionTokenDependency = createSessionToken,
  hashSessionToken: hashSessionTokenDependency = (token) =>
    hashSessionToken(token, getRequiredSessionSecret()),
  createSessionExpiry: createSessionExpiryDependency = createSessionExpiry,
}: AuthServiceDependencies) {
  async function issueSession(userId: string): Promise<AuthResult> {
    const sessionToken = createSessionTokenDependency();
    const sessionTokenHash = hashSessionTokenDependency(sessionToken);
    const expiresAt = createSessionExpiryDependency();

    await repository.createSession({
      userId,
      sessionTokenHash,
      expiresAt,
    });

    return { userId, sessionToken, expiresAt };
  }

  return {
    async register(credentials: AuthCredentials): Promise<AuthResult> {
      assertValidCredentials(credentials);
      const email = normalizeAuthEmail(credentials.email);
      const existingUser = await repository.findUserByEmail(email);

      if (existingUser) {
        throw new DuplicateEmailError();
      }

      const passwordHash = await hashPasswordDependency(credentials.password);
      const { userId } = await repository.createUserWithDefaultHousehold({
        email,
        passwordHash,
      });

      return issueSession(userId);
    },

    async login(credentials: AuthCredentials): Promise<AuthResult> {
      assertValidCredentials(credentials);
      const email = normalizeAuthEmail(credentials.email);
      const user = await repository.findUserByEmail(email);

      if (!user) {
        throw new InvalidCredentialsError();
      }

      if (user.status !== "active") {
        throw new DisabledUserError();
      }

      const passwordMatches = await verifyPasswordDependency(
        credentials.password,
        user.passwordHash,
      );

      if (!passwordMatches) {
        throw new InvalidCredentialsError();
      }

      return issueSession(user.id);
    },

    async logout(sessionToken: string): Promise<void> {
      const sessionTokenHash = hashSessionTokenDependency(sessionToken);
      await repository.revokeSessionByHash(sessionTokenHash);
    },

    async getCurrentUser(
      sessionToken: string,
      now: Date = new Date(),
    ): Promise<CurrentUser | null> {
      if (!sessionToken) {
        return null;
      }

      const sessionTokenHash = hashSessionTokenDependency(sessionToken);
      const session = await repository.findSessionByHash(sessionTokenHash);

      if (!session || session.status !== "active") {
        return null;
      }

      if (!isSessionUsable(session, now)) {
        return null;
      }

      return {
        userId: session.userId,
        email: session.email,
      };
    },
  };
}

function assertValidCredentials(credentials: AuthCredentials) {
  const validation = validateAuthCredentials(credentials);

  if (!validation.ok) {
    throw new Error(validation.message);
  }
}

function getRequiredSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error("SESSION_SECRET is required");
  }

  return secret;
}
