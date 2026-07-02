import { createBrowserClient } from "@supabase/ssr";
import { readSupabaseBrowserEnv } from "./env";

type SupabaseEnvSource = Parameters<typeof readSupabaseBrowserEnv>[0];
type SupabaseBrowserClientFactory<TClient> = (
  url: string,
  publishableKey: string,
) => TClient;

export function createSupabaseBrowserClient<TClient = ReturnType<typeof createBrowserClient>>(
  source?: SupabaseEnvSource,
  factory: SupabaseBrowserClientFactory<TClient> = createBrowserClient as SupabaseBrowserClientFactory<TClient>,
): TClient {
  const { url, publishableKey } = readSupabaseBrowserEnv(source);
  return factory(url, publishableKey);
}
