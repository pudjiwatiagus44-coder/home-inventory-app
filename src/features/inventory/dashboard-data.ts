export type HouseholdRow = {
  id: string;
  name: string;
};

export type AreaRow = {
  id: string;
  name: string;
  color: string;
};

export type ItemRow = {
  id: string;
  name: string;
  note: string;
  expire_date: string | null;
};

export type DashboardData = {
  household: HouseholdRow;
  areas: AreaRow[];
  items: ItemRow[];
};

export type DashboardSummary = {
  householdId: string;
  householdName: string;
  areaCount: number;
  itemCount: number;
  isEmpty: boolean;
  recentItems: Array<{
    id: string;
    name: string;
    note: string;
    expireDate: string | null;
  }>;
};

export function isMissingAuthSessionError(error: { message?: string } | null) {
  return error?.message === "Auth session missing!";
}

export function createDashboardHousehold(
  householdId: string,
  household: HouseholdRow | null,
): HouseholdRow {
  return household ?? { id: householdId, name: "我的家庭" };
}

export function buildDashboardSummary(data: DashboardData): DashboardSummary {
  return {
    householdId: data.household.id,
    householdName: data.household.name,
    areaCount: data.areas.length,
    itemCount: data.items.length,
    isEmpty: data.items.length === 0,
    recentItems: data.items.slice(0, 5).map((item) => ({
      id: item.id,
      name: item.name,
      note: item.note,
      expireDate: item.expire_date,
    })),
  };
}
