import { cookies } from "next/headers";
import { AppDashboard } from "@/features/inventory/AppDashboard";
import { resolveSelfHostedAppUser } from "./app-auth";

export default async function AppPage() {
  const selfHostedUser = await resolveSelfHostedAppUser(await cookies());

  return <AppDashboard selfHostedUser={selfHostedUser} />;
}
