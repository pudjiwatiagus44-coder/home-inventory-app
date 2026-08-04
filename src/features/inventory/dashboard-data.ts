export type HouseholdRow = {
  id: string;
  name: string;
};

export type AreaRow = {
  id: string;
  name: string;
  color: string;
  updatedAt?: string;
};

export type DashboardArea = AreaRow & {
  locationCount: number;
};

export type LocationRow = {
  id: string;
  name: string;
  area_id: string | null;
  updatedAt?: string;
};

export type DashboardLocation = {
  id: string;
  name: string;
  areaId: string | null;
  areaName: string;
};

export type ExpirationStatus = "none" | "expired" | "soon" | "normal";

export type ItemRow = {
  id: string;
  name: string;
  note: string;
  expire_date: string | null;
  location_id: string | null;
  updatedAt?: string;
};

export type DashboardData = {
  household: HouseholdRow;
  areas: AreaRow[];
  locations: LocationRow[];
  items: ItemRow[];
};

export type DashboardSummary = {
  householdId: string;
  householdName: string;
  areaCount: number;
  locationCount: number;
  itemCount: number;
  isEmpty: boolean;
  areas: DashboardArea[];
  locations: DashboardLocation[];
  items: DashboardItem[];
};

export type ExpirationHighlights = {
  soonItems: DashboardItem[];
  expiredItems: DashboardItem[];
};

export type DashboardItem = {
    id: string;
    name: string;
    note: string;
    expireDate: string | null;
    locationId: string | null;
    locationName: string;
    areaId: string | null;
    areaName: string;
    expirationStatus: ExpirationStatus;
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
  const areaNames = new Map(data.areas.map((area) => [area.id, area.name]));
  const locationNames = new Map(
    data.locations.map((location) => [location.id, location.name]),
  );
  const locationAreas = new Map(
    data.locations.map((location) => [location.id, location.area_id]),
  );
  const locationCountsByArea = new Map<string, number>();
  for (const location of data.locations) {
    if (location.area_id) {
      locationCountsByArea.set(
        location.area_id,
        (locationCountsByArea.get(location.area_id) ?? 0) + 1,
      );
    }
  }
  const areas = data.areas.map((area) => ({
    ...area,
    locationCount: locationCountsByArea.get(area.id) ?? 0,
  }));
  const locations = data.locations.map((location) => ({
    id: location.id,
    name: location.name,
    areaId: location.area_id,
    areaName: location.area_id
      ? (areaNames.get(location.area_id) ?? "未知区域")
      : "未分区",
  }));

  return {
    householdId: data.household.id,
    householdName: data.household.name,
    areaCount: data.areas.length,
    locationCount: data.locations.length,
    itemCount: data.items.length,
    isEmpty: data.items.length === 0,
    areas,
    locations,
    items: data.items.map((item) => {
      const areaId = item.location_id
        ? (locationAreas.get(item.location_id) ?? null)
        : null;

      const expireDate = normalizeDateOnly(item.expire_date);

      return {
        id: item.id,
        name: item.name,
        note: item.note,
        expireDate,
        locationId: item.location_id,
        locationName: item.location_id
          ? (locationNames.get(item.location_id) ?? "未知位置")
          : "未设置位置",
        areaId,
        areaName: item.location_id
          ? areaNameForLocation(areaId, areaNames)
          : "未分区",
        expirationStatus: getExpirationStatus(expireDate),
      };
    }),
  };
}

export function filterInventoryItems(
  items: DashboardItem[],
  filters: { search: string; areaId: string; locationId: string },
): DashboardItem[] {
  const search = filters.search.trim().toLocaleLowerCase();

  return items.filter((item) => {
    const matchesSearch =
      !search ||
      item.name.toLocaleLowerCase().includes(search) ||
      item.note.toLocaleLowerCase().includes(search);
    const matchesArea = !filters.areaId || item.areaId === filters.areaId;
    const matchesLocation =
      !filters.locationId || item.locationId === filters.locationId;

    return matchesSearch && matchesArea && matchesLocation;
  });
}

export function filterInventoryLocations(
  locations: DashboardLocation[],
  areaId: string,
): DashboardLocation[] {
  if (!areaId) {
    return locations;
  }

  if (areaId === "__unassigned__") {
    return locations.filter((location) => !location.areaId);
  }

  return locations.filter((location) => location.areaId === areaId);
}

export function getLocationAreaFilterValue(
  locations: DashboardLocation[],
  locationId: string | null | undefined,
) {
  if (!locationId) {
    return "";
  }

  const location = locations.find((candidate) => candidate.id === locationId);
  if (!location) {
    return "";
  }

  return location.areaId ?? "__unassigned__";
}

export function getExpirationHighlights(
  items: DashboardItem[],
): ExpirationHighlights {
  const byExpireDate = (left: DashboardItem, right: DashboardItem) =>
    (left.expireDate ?? "").localeCompare(right.expireDate ?? "");

  return {
    soonItems: items
      .filter((item) => item.expirationStatus === "soon")
      .sort(byExpireDate),
    expiredItems: items
      .filter((item) => item.expirationStatus === "expired")
      .sort(byExpireDate),
  };
}

export function getExpirationStatus(
  expireDate: string | null,
  now: Date = new Date(),
): ExpirationStatus {
  const normalizedExpireDate = normalizeDateOnly(expireDate);

  if (!normalizedExpireDate) {
    return "none";
  }

  const today = startOfDay(now).getTime();
  const target = startOfDay(
    new Date(`${normalizedExpireDate}T00:00:00`),
  ).getTime();
  const daysUntilExpiration = Math.floor(
    (target - today) / (24 * 60 * 60 * 1000),
  );

  if (daysUntilExpiration < 0) {
    return "expired";
  }

  if (daysUntilExpiration <= 30) {
    return "soon";
  }

  return "normal";
}

function areaNameForLocation(
  areaId: string | null | undefined,
  areaNames: Map<string, string>,
) {
  if (!areaId) {
    return "未分区";
  }

  return areaNames.get(areaId) ?? "未知区域";
}

function normalizeDateOnly(value: string | null) {
  if (!value) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const parsedDate = new Date(value);

    if (!Number.isNaN(parsedDate.getTime())) {
      return formatLocalDate(parsedDate);
    }
  }

  const dateOnlyMatch = value.match(/^\d{4}-\d{2}-\d{2}/);
  return dateOnlyMatch?.[0] ?? value;
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
