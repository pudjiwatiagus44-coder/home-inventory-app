type ResetPasswordResponse = {
  ok?: boolean;
  message?: string;
};

export class ResetPasswordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResetPasswordError";
  }
}

export async function resetPassword({
  token,
  password,
  fetcher = fetch,
}: {
  token: string;
  password: string;
  fetcher?: typeof fetch;
}) {
  const response = await fetcher("/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  const body = (await response.json()) as ResetPasswordResponse;

  if (!response.ok || body.ok === false) {
    throw new ResetPasswordError(body.message ?? "重置失败，请稍后再试");
  }
}
