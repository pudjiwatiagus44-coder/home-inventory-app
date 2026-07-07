export type SelfHostedDashboardUser = {
  userId: string;
  email: string;
};

export function createInitialDashboardState(
  _selfHostedUser: SelfHostedDashboardUser | null,
) {
  void _selfHostedUser;
  return { status: "loading" as const };
}
