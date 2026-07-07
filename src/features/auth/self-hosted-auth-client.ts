export type SelfHostedAuthMode = "sign-in" | "sign-up";

type AuthInput = {
  mode: SelfHostedAuthMode;
  email: string;
  password: string;
  fetcher?: typeof fetch;
};

type AuthResponse = {
  ok?: boolean;
  message?: string;
};

export class SelfHostedAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SelfHostedAuthError";
  }
}

export async function authenticateWithSelfHostedApi({
  mode,
  email,
  password,
  fetcher = fetch,
}: AuthInput) {
  const endpoint =
    mode === "sign-in" ? "/api/auth/login" : "/api/auth/register";
  const response = await fetcher(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
    }),
  });
  const body = (await response.json()) as AuthResponse;

  if (!response.ok || body.ok === false) {
    throw new SelfHostedAuthError(body.message ?? "认证请求失败");
  }
}
