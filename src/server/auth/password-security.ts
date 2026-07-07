import bcrypt from "bcryptjs";

export const BCRYPT_COST = 12;
export const MIN_PASSWORD_LENGTH = 8;

export async function hashPassword(password: string): Promise<string> {
  assertPasswordCanBeHashed(password);
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

function assertPasswordCanBeHashed(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error("密码至少需要 8 位");
  }
}
