import { initializeDefaultHousehold } from "../auth/default-household";

type HouseholdBootstrapClient = {
  from: {
    (table: "household_members"): {
      select: (columns: "household_id") => {
        eq: (
          column: "user_id",
          value: string,
        ) => {
          limit: (count: 1) => {
            maybeSingle: () => Promise<{
              data: { household_id: string } | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
    (table: "households"): {
      select: (columns: "id") => {
        eq: (
          column: "id",
          value: string,
        ) => {
          maybeSingle: () => Promise<{
            data: { id: string } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  rpc: Parameters<typeof initializeDefaultHousehold>[0]["rpc"];
};

type HouseholdBootstrapUser = {
  id: string;
  email?: string;
};

export async function getOrCreateDefaultHouseholdId(
  supabase: HouseholdBootstrapClient,
  user: HouseholdBootstrapUser,
): Promise<string> {
  const membershipResult = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membershipResult.error) {
    throw new Error(membershipResult.error.message);
  }

  if (membershipResult.data?.household_id) {
    const visibleHouseholdResult = await supabase
      .from("households")
      .select("id")
      .eq("id", membershipResult.data.household_id)
      .maybeSingle();

    if (visibleHouseholdResult.error) {
      throw new Error(visibleHouseholdResult.error.message);
    }

    if (visibleHouseholdResult.data?.id) {
      return visibleHouseholdResult.data.id;
    }
  }

  return initializeDefaultHousehold(supabase, user.email ?? user.id);
}
