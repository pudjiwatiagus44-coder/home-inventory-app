export type AreaInput = {
  name: string;
  color?: string;
};

export type ValidAreaInput = {
  name: string;
  color: string;
};

export type LocationInput = {
  name: string;
  areaId?: string | null;
};

export type ValidLocationInput = {
  name: string;
  areaId: string | null;
};

export type InventoryItemInput = {
  name: string;
  locationId: string | null;
  note: string;
  expireDate: string | null;
  createdBy?: string;
};

export type ValidInventoryItemInput = {
  name: string;
  locationId: string | null;
  note: string;
  expireDate: string | null;
};

export type InventoryLocationRow = {
  id: string;
  name: string;
};

export type InventoryAreaRow = {
  id: string;
  name: string;
  color: string;
};

export type InventoryItemRow = {
  id: string;
  name: string;
  note: string;
  expire_date: string | null;
  location_id: string | null;
};

type ValidationResult<T> =
  | { isValid: true; value: T }
  | { isValid: false; error: string };

type InsertBuilder<TData> = {
  insert: (payload: Record<string, unknown>) => {
    select: (columns?: string) => {
      single: () => Promise<{
        data: TData | null;
        error: { message: string } | null;
      }>;
    };
  };
};

type UpdateBuilder<TData> = {
  update: (payload: Record<string, unknown>) => {
    eq: (
      column: "household_id" | "id",
      value: string,
    ) => {
      eq: (
        column: "household_id" | "id",
        value: string,
      ) => {
        select: (columns?: string) => {
          single: () => Promise<{
            data: TData | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
};

type DeleteBuilder = {
  delete: () => {
    eq: (
      column: "household_id" | "id",
      value: string,
    ) => {
      eq: (
        column: "household_id" | "id",
        value: string,
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
};

export type InventoryActionClient = {
  from: {
    (table: "areas"): InsertBuilder<InventoryAreaRow> &
      UpdateBuilder<InventoryAreaRow> &
      DeleteBuilder;
    (table: "locations"): InsertBuilder<InventoryLocationRow> &
      UpdateBuilder<InventoryLocationRow> &
      DeleteBuilder;
    (table: "items"): InsertBuilder<InventoryItemRow> &
      UpdateBuilder<InventoryItemRow> &
      DeleteBuilder;
  };
};

export function validateAreaInput(
  input: AreaInput,
): ValidationResult<ValidAreaInput> {
  const name = input.name.trim();
  const color = input.color?.trim() || "#64748b";

  if (!name) {
    return { isValid: false, error: "请输入区域名称" };
  }

  if (name.length > 80) {
    return { isValid: false, error: "区域名称最多 80 个字" };
  }

  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return { isValid: false, error: "请选择有效的区域颜色" };
  }

  return { isValid: true, value: { name, color } };
}

export function validateLocationInput(
  input: LocationInput,
): ValidationResult<ValidLocationInput> {
  const name = input.name.trim();
  const areaId = normalizeOptionalText(input.areaId ?? null);

  if (!name) {
    return { isValid: false, error: "请输入位置名称" };
  }

  if (name.length > 80) {
    return { isValid: false, error: "位置名称最多 80 个字" };
  }

  return { isValid: true, value: { name, areaId } };
}

export function validateInventoryItemInput(
  input: InventoryItemInput,
): ValidationResult<ValidInventoryItemInput> {
  const name = input.name.trim();
  const note = input.note.trim();
  const locationId = normalizeOptionalText(input.locationId);
  const expireDate = normalizeOptionalText(input.expireDate);

  if (!name) {
    return { isValid: false, error: "请输入物品名称" };
  }

  if (name.length > 120) {
    return { isValid: false, error: "物品名称最多 120 个字" };
  }

  if (note.length > 1000) {
    return { isValid: false, error: "备注最多 1000 个字" };
  }

  return {
    isValid: true,
    value: { name, locationId, note, expireDate },
  };
}

export async function createInventoryLocation(
  supabase: InventoryActionClient,
  input: LocationInput & { householdId: string },
): Promise<InventoryLocationRow> {
  const validated = validateLocationInput(input);

  if (!validated.isValid) {
    throw new Error(validated.error);
  }

  const { data, error } = await supabase
    .from("locations")
    .insert({
      household_id: input.householdId,
      area_id: validated.value.areaId,
      name: validated.value.name,
    })
    .select("id,name")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("新增位置后没有返回数据");
  }

  return data;
}

export async function updateInventoryLocation(
  supabase: InventoryActionClient,
  input: LocationInput & { householdId: string; locationId: string },
): Promise<InventoryLocationRow> {
  const validated = validateLocationInput(input);

  if (!validated.isValid) {
    throw new Error(validated.error);
  }

  const { data, error } = await supabase
    .from("locations")
    .update({
      area_id: validated.value.areaId,
      name: validated.value.name,
    })
    .eq("id", input.locationId)
    .eq("household_id", input.householdId)
    .select("id,name")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("更新位置后没有返回数据");
  }

  return data;
}

export async function deleteInventoryLocation(
  supabase: InventoryActionClient,
  input: { householdId: string; locationId: string },
): Promise<void> {
  const { error } = await supabase
    .from("locations")
    .delete()
    .eq("id", input.locationId)
    .eq("household_id", input.householdId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function createInventoryArea(
  supabase: InventoryActionClient,
  input: AreaInput & { householdId: string },
): Promise<InventoryAreaRow> {
  const validated = validateAreaInput(input);

  if (!validated.isValid) {
    throw new Error(validated.error);
  }

  const { data, error } = await supabase
    .from("areas")
    .insert({
      household_id: input.householdId,
      name: validated.value.name,
      color: validated.value.color,
    })
    .select("id,name,color")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("新增区域后没有返回数据");
  }

  return data;
}

export async function updateInventoryArea(
  supabase: InventoryActionClient,
  input: AreaInput & { householdId: string; areaId: string },
): Promise<InventoryAreaRow> {
  const validated = validateAreaInput(input);

  if (!validated.isValid) {
    throw new Error(validated.error);
  }

  const { data, error } = await supabase
    .from("areas")
    .update({
      name: validated.value.name,
      color: validated.value.color,
    })
    .eq("id", input.areaId)
    .eq("household_id", input.householdId)
    .select("id,name,color")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("更新区域后没有返回数据");
  }

  return data;
}

export async function deleteInventoryArea(
  supabase: InventoryActionClient,
  input: { householdId: string; areaId: string },
): Promise<void> {
  const { error } = await supabase
    .from("areas")
    .delete()
    .eq("id", input.areaId)
    .eq("household_id", input.householdId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function createInventoryItem(
  supabase: InventoryActionClient,
  input: InventoryItemInput & { householdId: string },
): Promise<InventoryItemRow> {
  const validated = validateInventoryItemInput(input);

  if (!validated.isValid) {
    throw new Error(validated.error);
  }

  const { data, error } = await supabase
    .from("items")
    .insert({
      household_id: input.householdId,
      location_id: validated.value.locationId,
      name: validated.value.name,
      note: validated.value.note,
      expire_date: validated.value.expireDate,
      ...(input.createdBy ? { created_by: input.createdBy } : {}),
    })
    .select("id,name,note,expire_date,location_id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("新增物品后没有返回数据");
  }

  return data;
}

export async function updateInventoryItem(
  supabase: InventoryActionClient,
  input: InventoryItemInput & { householdId: string; itemId: string },
): Promise<InventoryItemRow> {
  const validated = validateInventoryItemInput(input);

  if (!validated.isValid) {
    throw new Error(validated.error);
  }

  const { data, error } = await supabase
    .from("items")
    .update({
      location_id: validated.value.locationId,
      name: validated.value.name,
      note: validated.value.note,
      expire_date: validated.value.expireDate,
    })
    .eq("id", input.itemId)
    .eq("household_id", input.householdId)
    .select("id,name,note,expire_date,location_id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("更新物品后没有返回数据");
  }

  return data;
}

export async function deleteInventoryItem(
  supabase: InventoryActionClient,
  input: { householdId: string; itemId: string },
): Promise<void> {
  const { error } = await supabase
    .from("items")
    .delete()
    .eq("id", input.itemId)
    .eq("household_id", input.householdId);

  if (error) {
    throw new Error(error.message);
  }
}

function normalizeOptionalText(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}
