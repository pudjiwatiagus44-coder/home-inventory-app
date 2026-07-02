import { describe, expect, it } from "vitest";
import { validateAuthCredentials } from "./auth-validation";

describe("validateAuthCredentials", () => {
  it("accepts a valid email and password", () => {
    expect(
      validateAuthCredentials({
        email: "user@example.com",
        password: "password123",
      }),
    ).toEqual({ ok: true });
  });

  it("rejects an invalid email", () => {
    expect(
      validateAuthCredentials({
        email: "not-an-email",
        password: "password123",
      }),
    ).toEqual({ ok: false, message: "请输入有效邮箱" });
  });

  it("rejects short passwords", () => {
    expect(
      validateAuthCredentials({
        email: "user@example.com",
        password: "1234567",
      }),
    ).toEqual({ ok: false, message: "密码至少需要 8 位" });
  });
});
