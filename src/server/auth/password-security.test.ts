import { describe, expect, it } from "vitest";
import {
  BCRYPT_COST,
  hashPassword,
  verifyPassword,
} from "./password-security";

describe("password-security", () => {
  it("uses bcrypt with the confirmed cost", () => {
    expect(BCRYPT_COST).toBe(12);
  });

  it("hashes and verifies a password with bcrypt", async () => {
    const passwordHash = await hashPassword("correct horse battery staple");

    expect(passwordHash).toMatch(/^\$2[aby]\$\d\d\$/);
    await expect(
      verifyPassword("correct horse battery staple", passwordHash),
    ).resolves.toBe(true);
    await expect(verifyPassword("wrong password", passwordHash)).resolves.toBe(
      false,
    );
  });

  it("rejects short passwords before hashing", async () => {
    await expect(hashPassword("1234567")).rejects.toThrow("密码至少需要 8 位");
  });
});
