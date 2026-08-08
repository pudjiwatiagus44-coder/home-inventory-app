type ForgotPasswordResponse = {
  ok?: boolean;
  message?: string;
};

export class ForgotPasswordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForgotPasswordError";
  }
}

export async function requestPasswordReset({
  email,
  fetcher = fetch,
}: {
  email: string;
  fetcher?: typeof fetch;
}) {
  const response = await fetcher("/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
    }),
  });
  const body = (await response.json()) as ForgotPasswordResponse;

  if (!response.ok || body.ok === false) {
    throw new ForgotPasswordError(body.message ?? "请求失败，请稍后再试");
  }
}
