type AuthCredentials = {
  email: string;
  password: string;
};

type AuthValidationResult =
  | { ok: true }
  | { ok: false; message: string };

export function validateAuthCredentials({
  email,
  password,
}: AuthCredentials): AuthValidationResult {
  const normalizedEmail = email.trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { ok: false, message: "请输入有效邮箱" };
  }

  if (password.length < 8) {
    return { ok: false, message: "密码至少需要 8 位" };
  }

  return { ok: true };
}
