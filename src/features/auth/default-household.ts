type DefaultHouseholdClient = {
  rpc: (
    name: "create_default_household",
    params: { display_name: string },
  ) => Promise<{
    data: string | null;
    error: { message: string } | null;
  }>;
};

export async function initializeDefaultHousehold(
  supabase: DefaultHouseholdClient,
  displayName: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("create_default_household", {
    display_name: displayName.trim(),
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Default household initialization returned no id");
  }

  return data;
}
