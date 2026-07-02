type SupabaseEnvSource = Record<string, string | undefined> & {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
};

export type SupabaseBrowserEnv = {
  url: string;
  publishableKey: string;
};

export function readSupabaseBrowserEnv(
  source: SupabaseEnvSource = process.env,
): SupabaseBrowserEnv {
  const url = source.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  }

  return { url, publishableKey };
}
