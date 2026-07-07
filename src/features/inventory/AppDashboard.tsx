"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  createInitialDashboardState,
  type SelfHostedDashboardUser,
} from "./app-dashboard-state";
import {
  AreaRow,
  buildDashboardSummary,
  createDashboardHousehold,
  DashboardItem,
  DashboardSummary,
  filterInventoryItems,
  filterInventoryLocations,
  getExpirationHighlights,
  getLocationAreaFilterValue,
  HouseholdRow,
  isMissingAuthSessionError,
  ItemRow,
  LocationRow,
} from "./dashboard-data";
import { getOrCreateDefaultHouseholdId } from "./household-bootstrap";
import {
  validateAreaInput,
  validateInventoryItemInput,
  validateLocationInput,
  type AreaInput,
  type InventoryItemInput,
  type LocationInput,
} from "./inventory-actions";
import { createSupabaseInventoryRepository } from "./inventory-repository";
import { createSelfHostedInventoryClient } from "./self-hosted-inventory-client";

type DashboardState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string }
  | { status: "ready"; summary: DashboardSummary; userId: string };

type MobileQuickPanel = "search" | "item" | "location" | "area" | null;

const areaColors = ["#64748b", "#256f6b", "#7c3aed", "#c2410c", "#be123c"];

function createDashboardWriteClient(
  selfHostedUser: SelfHostedDashboardUser | null,
) {
  if (selfHostedUser) {
    const inventory = createSelfHostedInventoryClient();

    return {
      createArea: (input: AreaInput & { householdId?: string }) =>
        inventory.createArea(input),
      updateArea: (input: AreaInput & { householdId?: string; areaId: string }) =>
        inventory.updateArea(input),
      deleteArea: (input: { householdId?: string; areaId: string }) =>
        inventory.deleteArea(input),
      createLocation: (input: LocationInput & { householdId?: string }) =>
        inventory.createLocation(input),
      updateLocation: (
        input: LocationInput & { householdId?: string; locationId: string },
      ) => inventory.updateLocation(input),
      deleteLocation: (input: { householdId?: string; locationId: string }) =>
        inventory.deleteLocation(input),
      createItem: (
        input: InventoryItemInput & { householdId?: string; createdBy?: string },
      ) => inventory.createItem(input),
      updateItem: (
        input: InventoryItemInput & { householdId?: string; itemId: string },
      ) => inventory.updateItem(input),
      deleteItem: (input: { householdId?: string; itemId: string }) =>
        inventory.deleteItem(input),
    };
  }

  const supabase = createSupabaseBrowserClient();
  return createSupabaseInventoryRepository(supabase);
}

export function AppDashboard({
  selfHostedUser = null,
}: {
  selfHostedUser?: SelfHostedDashboardUser | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<DashboardState>(() =>
    createInitialDashboardState(selfHostedUser),
  );
  const [areaForm, setAreaForm] = useState({ name: "", color: areaColors[0] });
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [locationForm, setLocationForm] = useState({ name: "", areaId: "" });
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [locationAreaFilter, setLocationAreaFilter] = useState("");
  const [itemForm, setItemForm] = useState({
    name: "",
    areaId: "",
    locationId: "",
    note: "",
    expireDate: "",
  });
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [mobileQuickPanel, setMobileQuickPanel] = useState<MobileQuickPanel>(null);
  const [filters, setFilters] = useState({
    search: "",
    areaId: "",
    locationId: "",
  });
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadDashboard = useCallback(
    async (shouldUpdate: () => boolean = () => true) => {
      try {
        if (selfHostedUser) {
          const data = await createSelfHostedInventoryClient().getDashboard();
          const summary = buildDashboardSummary(data);

          if (shouldUpdate()) {
            setState({
              status: "ready",
              summary,
              userId: selfHostedUser.userId,
            });
          }
          return;
        }

        const supabase = createSupabaseBrowserClient();
        const userResult = await supabase.auth.getUser();

        if (userResult.error) {
          if (isMissingAuthSessionError(userResult.error)) {
            if (shouldUpdate()) {
              setState({ status: "unauthenticated" });
            }
            return;
          }

          throw new Error(userResult.error.message);
        }

        if (!userResult.data.user) {
          if (shouldUpdate()) {
            setState({ status: "unauthenticated" });
          }
          return;
        }

        const householdId = await getOrCreateDefaultHouseholdId(
          supabase,
          userResult.data.user,
        );

        const [householdResult, areasResult, locationsResult, itemsResult] =
          await Promise.all([
            supabase
              .from("households")
              .select("id,name")
              .eq("id", householdId)
              .maybeSingle(),
            supabase
              .from("areas")
              .select("id,name,color")
              .eq("household_id", householdId)
              .order("sort_order", { ascending: true }),
            supabase
              .from("locations")
              .select("id,name,area_id")
              .eq("household_id", householdId)
              .order("sort_order", { ascending: true }),
            supabase
              .from("items")
              .select("id,name,note,expire_date,location_id")
              .eq("household_id", householdId)
              .order("created_at", { ascending: false }),
          ]);

        if (householdResult.error) {
          throw new Error(householdResult.error.message);
        }
        if (areasResult.error) {
          throw new Error(areasResult.error.message);
        }
        if (locationsResult.error) {
          throw new Error(locationsResult.error.message);
        }
        if (itemsResult.error) {
          throw new Error(itemsResult.error.message);
        }

        const summary = buildDashboardSummary({
          household: createDashboardHousehold(
            householdId,
            householdResult.data as HouseholdRow | null,
          ),
          areas: (areasResult.data ?? []) as AreaRow[],
          locations: (locationsResult.data ?? []) as LocationRow[],
          items: (itemsResult.data ?? []) as ItemRow[],
        });

        if (shouldUpdate()) {
          setState({ status: "ready", summary, userId: userResult.data.user.id });
        }
      } catch (error) {
        if (shouldUpdate()) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "加载失败",
          });
        }
      }
    },
    [selfHostedUser],
  );

  useEffect(() => {
    let isMounted = true;

    void Promise.resolve().then(() => loadDashboard(() => isMounted));

    return () => {
      isMounted = false;
    };
  }, [loadDashboard, selfHostedUser]);

  const visibleItems = useMemo(() => {
    if (state.status !== "ready") {
      return [];
    }

    return filterInventoryItems(state.summary.items, filters);
  }, [filters, state]);

  const expirationHighlights = useMemo(() => {
    if (state.status !== "ready") {
      return { soonItems: [], expiredItems: [] };
    }

    return getExpirationHighlights(state.summary.items);
  }, [state]);

  const filteredLocations = useMemo(() => {
    if (state.status !== "ready") {
      return [];
    }

    return filters.areaId
      ? state.summary.locations.filter((location) => location.areaId === filters.areaId)
      : state.summary.locations;
  }, [filters.areaId, state]);

  const visibleLocations = useMemo(() => {
    if (state.status !== "ready") {
      return [];
    }

    return filterInventoryLocations(state.summary.locations, locationAreaFilter);
  }, [locationAreaFilter, state]);

  const itemFormLocations = useMemo(() => {
    if (state.status !== "ready" || !itemForm.areaId) {
      return [];
    }

    return filterInventoryLocations(state.summary.locations, itemForm.areaId);
  }, [itemForm.areaId, state]);

  async function handleSignOut() {
    if (selfHostedUser) {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  function openMobileQuickPanel(panel: Exclude<MobileQuickPanel, null>) {
    setFormMessage(null);

    if (panel === "area") {
      setEditingAreaId(null);
      setAreaForm({ name: "", color: areaColors[0] });
    }

    if (panel === "location") {
      setEditingLocationId(null);
      setLocationForm({ name: "", areaId: "" });
    }

    if (panel === "item") {
      setEditingItemId(null);
      setItemForm({
        name: "",
        areaId: "",
        locationId: "",
        note: "",
        expireDate: "",
      });
    }

    setMobileQuickPanel(panel);
  }

  async function handleMobileSaveArea(event: FormEvent<HTMLFormElement>) {
    if (await handleSaveArea(event)) {
      setMobileQuickPanel(null);
    }
  }

  async function handleMobileCreateLocation(event: FormEvent<HTMLFormElement>) {
    if (await handleCreateLocation(event)) {
      setMobileQuickPanel(null);
    }
  }

  async function handleMobileSaveItem(event: FormEvent<HTMLFormElement>) {
    if (await handleSaveItem(event)) {
      setMobileQuickPanel(null);
    }
  }

  async function handleSaveArea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormMessage(null);

    const validation = validateAreaInput(areaForm);
    if (!validation.isValid) {
      setFormMessage(validation.error);
      return false;
    }

    if (state.status !== "ready") {
      setFormMessage("家庭空间尚未加载完成");
      return false;
    }

    setIsSaving(true);
    try {
      const inventory = createDashboardWriteClient(selfHostedUser);
      if (editingAreaId) {
        await inventory.updateArea({
          householdId: state.summary.householdId,
          areaId: editingAreaId,
          ...validation.value,
        });
        setFormMessage("区域已更新");
      } else {
        await inventory.createArea({
          householdId: state.summary.householdId,
          ...validation.value,
        });
        setFormMessage("区域已保存");
      }
      setAreaForm({ name: "", color: areaColors[0] });
      setEditingAreaId(null);
      await loadDashboard();
      return true;
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "区域保存失败");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteArea(areaId: string) {
    if (state.status !== "ready" || !window.confirm("确认删除这个区域？")) {
      return;
    }

    setIsSaving(true);
    setFormMessage(null);
    try {
      const inventory = createDashboardWriteClient(selfHostedUser);
      await inventory.deleteArea({
        householdId: state.summary.householdId,
        areaId,
      });
      setFormMessage("区域已删除");
      await loadDashboard();
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "区域删除失败");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormMessage(null);

    const validation = validateLocationInput(locationForm);
    if (!validation.isValid) {
      setFormMessage(validation.error);
      return false;
    }

    if (state.status !== "ready") {
      setFormMessage("家庭空间尚未加载完成");
      return false;
    }

    setIsSaving(true);
    try {
      const inventory = createDashboardWriteClient(selfHostedUser);
      await inventory.createLocation({
        householdId: state.summary.householdId,
        ...validation.value,
      });
      setLocationForm({ name: "", areaId: "" });
      setFormMessage("位置已保存");
      await loadDashboard();
      return true;
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "位置保存失败");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveLocationEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormMessage(null);

    const validation = validateLocationInput(locationForm);
    if (!validation.isValid) {
      setFormMessage(validation.error);
      return;
    }

    if (state.status !== "ready" || !editingLocationId) {
      setFormMessage("位置尚未选择");
      return;
    }

    setIsSaving(true);
    try {
      const inventory = createDashboardWriteClient(selfHostedUser);
      await inventory.updateLocation({
        householdId: state.summary.householdId,
        locationId: editingLocationId,
        ...validation.value,
      });
      setLocationForm({ name: "", areaId: "" });
      setEditingLocationId(null);
      setFormMessage("位置已更新");
      await loadDashboard();
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "位置保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteLocation(locationId: string) {
    if (state.status !== "ready" || !window.confirm("确认删除这个位置？")) {
      return;
    }

    setIsSaving(true);
    setFormMessage(null);
    try {
      const inventory = createDashboardWriteClient(selfHostedUser);
      await inventory.deleteLocation({
        householdId: state.summary.householdId,
        locationId,
      });
      setFormMessage("位置已删除");
      await loadDashboard();
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "位置删除失败");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormMessage(null);

    const validation = validateInventoryItemInput(itemForm);
    if (!validation.isValid) {
      setFormMessage(validation.error);
      return false;
    }

    if (state.status !== "ready") {
      setFormMessage("家庭空间尚未加载完成");
      return false;
    }

    setIsSaving(true);
    try {
      const inventory = createDashboardWriteClient(selfHostedUser);
      if (editingItemId) {
        await inventory.updateItem({
          householdId: state.summary.householdId,
          itemId: editingItemId,
          ...validation.value,
        });
        setFormMessage("物品已更新");
      } else {
        await inventory.createItem({
          householdId: state.summary.householdId,
          createdBy: state.userId,
          ...validation.value,
        });
        setFormMessage("物品已保存");
      }
      setItemForm({
        name: "",
        areaId: "",
        locationId: "",
        note: "",
        expireDate: "",
      });
      setEditingItemId(null);
      await loadDashboard();
      return true;
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "物品保存失败");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteItem(itemId: string) {
    if (state.status !== "ready" || !window.confirm("确认删除这个物品？")) {
      return;
    }

    setIsSaving(true);
    setFormMessage(null);
    try {
      const inventory = createDashboardWriteClient(selfHostedUser);
      await inventory.deleteItem({
        householdId: state.summary.householdId,
        itemId,
      });
      setFormMessage("物品已删除");
      await loadDashboard();
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "物品删除失败");
    } finally {
      setIsSaving(false);
    }
  }

  function startEditArea(area: DashboardSummary["areas"][number]) {
    setEditingAreaId(area.id);
    setAreaForm({ name: area.name, color: area.color });
  }

  function startEditLocation(location: DashboardSummary["locations"][number]) {
    setFormMessage(null);
    setEditingLocationId(location.id);
    setLocationForm({ name: location.name, areaId: location.areaId ?? "" });
  }

  function cancelLocationEdit() {
    setFormMessage(null);
    setEditingLocationId(null);
    setLocationForm({ name: "", areaId: "" });
  }

  function startEditItem(item: DashboardItem) {
    if (state.status !== "ready") {
      return;
    }

    setEditingItemId(item.id);
    setItemForm({
      name: item.name,
      areaId: getLocationAreaFilterValue(state.summary.locations, item.locationId),
      locationId: item.locationId ?? "",
      note: item.note,
      expireDate: item.expireDate ?? "",
    });
  }

  if (state.status === "loading") {
    return <DashboardShell>正在加载你的家庭空间...</DashboardShell>;
  }

  if (state.status === "unauthenticated") {
    return (
      <DashboardShell>
        <div className="space-y-4 text-center">
          <h1 className="text-2xl font-semibold">请先登录</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            登录后才能查看你的家庭物品清单。
          </p>
          <a
            className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--primary)] px-4 text-sm font-medium text-white"
            href="/login"
          >
            去登录
          </a>
        </div>
      </DashboardShell>
    );
  }

  if (state.status === "error") {
    return (
      <DashboardShell>
        <div className="space-y-3 text-center">
          <h1 className="text-2xl font-semibold">加载失败</h1>
          <p className="text-sm text-[var(--muted-foreground)]">{state.message}</p>
        </div>
      </DashboardShell>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div>
            <p className="text-sm text-[var(--muted-foreground)]">家庭空间</p>
            <h1 className="text-xl font-semibold">{state.summary.householdName}</h1>
          </div>
          <button
            className="h-10 rounded-md border border-[var(--border)] px-4 text-sm font-medium"
            onClick={handleSignOut}
            type="button"
          >
            退出
          </button>
        </div>
      </header>

      <section className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-6 xl:hidden">
        <div className="mx-auto grid max-w-7xl gap-3">
          <div>
            <p className="text-xs text-[var(--muted-foreground)]">快捷操作</p>
            <p className="truncate text-sm font-medium">
              {filters.search ? `正在搜索：${filters.search}` : "搜索或新增常用内容"}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              className="h-10 rounded-md bg-[var(--primary)] px-3 text-sm font-medium text-white"
              onClick={() => openMobileQuickPanel("search")}
              type="button"
            >
              搜索物品
            </button>
            <button
              className="h-10 rounded-md border border-[var(--border)] px-3 text-sm font-medium"
              onClick={() => openMobileQuickPanel("item")}
              type="button"
            >
              新增物品
            </button>
            <button
              className="h-10 rounded-md border border-[var(--border)] px-3 text-sm font-medium"
              onClick={() => openMobileQuickPanel("location")}
              type="button"
            >
              新增位置
            </button>
            <button
              className="h-10 rounded-md border border-[var(--border)] px-3 text-sm font-medium"
              onClick={() => openMobileQuickPanel("area")}
              type="button"
            >
              新增区域
            </button>
          </div>
        </div>
      </section>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 xl:grid-cols-[320px_1fr]">
        <aside className="order-1 space-y-4">
          <section className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
            <h2 className="mb-4 text-sm font-semibold">概览</h2>
            <div className="grid grid-cols-3 gap-3 xl:grid-cols-1">
              <Metric label="区域" value={state.summary.areaCount} />
              <Metric label="位置" value={state.summary.locationCount} />
              <Metric label="物品" value={state.summary.itemCount} />
            </div>
          </section>

          <section className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">区域</h2>
              {editingAreaId ? (
                <button
                  className="text-sm text-[var(--muted-foreground)]"
                  onClick={() => {
                    setEditingAreaId(null);
                    setAreaForm({ name: "", color: areaColors[0] });
                  }}
                  type="button"
                >
                  取消
                </button>
              ) : null}
            </div>

            <form className="grid gap-3" onSubmit={handleSaveArea}>
              <label className="grid gap-2 text-sm font-medium">
                区域名称
                <input
                  className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]"
                  maxLength={80}
                  onChange={(event) =>
                    setAreaForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="例如：厨房"
                  value={areaForm.name}
                />
              </label>
              <div className="flex flex-wrap gap-2" role="radiogroup">
                {areaColors.map((color) => (
                  <button
                    aria-label={`区域颜色 ${color}`}
                    className="h-8 w-8 rounded-full border-2"
                    key={color}
                    onClick={() =>
                      setAreaForm((current) => ({ ...current, color }))
                    }
                    style={{
                      backgroundColor: color,
                      borderColor:
                        areaForm.color === color ? "var(--foreground)" : "white",
                    }}
                    type="button"
                  />
                ))}
              </div>
              <button
                className="h-10 rounded-md bg-[var(--primary)] px-3 text-sm font-medium text-white disabled:opacity-60"
                disabled={isSaving}
                type="submit"
              >
                {editingAreaId ? "保存区域" : "新增区域"}
              </button>
            </form>

            <ul className="mt-4 divide-y divide-[var(--border)]">
              {state.summary.areas.map((area) => (
                <li className="flex items-center justify-between gap-3 py-3" key={area.id}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: area.color }}
                      />
                      <p className="truncate text-sm font-medium">{area.name}</p>
                    </div>
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                      {area.locationCount} 个位置
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button className="text-sm" onClick={() => startEditArea(area)} type="button">
                      编辑
                    </button>
                    <button
                      className="text-sm text-red-600"
                      onClick={() => handleDeleteArea(area.id)}
                      type="button"
                    >
                      删除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
            <h2 className="mb-4 text-sm font-semibold">位置</h2>
            <form className="grid gap-3" onSubmit={handleCreateLocation}>
              <label className="grid gap-2 text-sm font-medium">
                位置名称
                <input
                  className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]"
                  maxLength={80}
                  onChange={(event) =>
                    setLocationForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="例如：上层抽屉"
                  value={locationForm.name}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                所属区域
                <select
                  className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]"
                  onChange={(event) =>
                    setLocationForm((current) => ({
                      ...current,
                      areaId: event.target.value,
                    }))
                  }
                  value={locationForm.areaId}
                >
                  <option value="">未分区</option>
                  {state.summary.areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="h-10 rounded-md bg-[var(--primary)] px-3 text-sm font-medium text-white disabled:opacity-60"
                disabled={isSaving}
                type="submit"
              >
                保存位置
              </button>
            </form>

            <label className="mt-4 grid gap-2 text-sm font-medium">
              显示区域
              <select
                className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]"
                onChange={(event) => setLocationAreaFilter(event.target.value)}
                value={locationAreaFilter}
              >
                <option value="">全部区域</option>
                <option value="__unassigned__">未分区</option>
                {state.summary.areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </label>

            <ul className="mt-4 divide-y divide-[var(--border)]">
              {visibleLocations.map((location) => (
                <li className="flex items-center justify-between gap-3 py-3" key={location.id}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{location.name}</p>
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                      {location.areaName}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      className="text-sm"
                      onClick={() => startEditLocation(location)}
                      type="button"
                    >
                      编辑
                    </button>
                    <button
                      className="text-sm text-red-600"
                      onClick={() => handleDeleteLocation(location.id)}
                      type="button"
                    >
                      删除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {visibleLocations.length === 0 ? (
              <p className="mt-4 rounded-md bg-[var(--surface-muted)] p-3 text-sm text-[var(--muted-foreground)]">
                当前区域暂无位置。
              </p>
            ) : null}
          </section>
        </aside>

        <section className="order-2 min-h-[560px] rounded-md border border-[var(--border)] bg-[var(--surface)]">
          <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">物品清单</h2>
              <p className="text-sm text-[var(--muted-foreground)]">
                {visibleItems.length} / {state.summary.itemCount} 个物品
              </p>
            </div>
            <div className="hidden gap-2 xl:grid xl:grid-cols-3">
              <input
                className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]"
                onChange={(event) =>
                  setFilters((current) => ({ ...current, search: event.target.value }))
                }
                placeholder="搜索名称或备注"
                value={filters.search}
              />
              <select
                className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]"
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    areaId: event.target.value,
                    locationId: "",
                  }))
                }
                value={filters.areaId}
              >
                <option value="">全部区域</option>
                {state.summary.areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
              <select
                className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]"
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    locationId: event.target.value,
                  }))
                }
                value={filters.locationId}
              >
                <option value="">全部位置</option>
                {filteredLocations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 border-b border-[var(--border)] p-4 lg:grid-cols-2">
            <ExpirationPanel
              emptyText="暂无即将过期物品"
              items={expirationHighlights.soonItems}
              title="即将过期物品"
              tone="soon"
            />
            <ExpirationPanel
              emptyText="暂无已过期物品"
              items={expirationHighlights.expiredItems}
              title="已过期物品"
              tone="expired"
            />
          </div>

          <form
            className="grid gap-3 border-b border-[var(--border)] p-4 md:grid-cols-2 xl:grid-cols-[1fr_160px_180px_1fr_160px_auto]"
            onSubmit={handleSaveItem}
          >
            <label className="grid gap-2 text-sm font-medium">
              物品名称
              <input
                className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]"
                maxLength={120}
                onChange={(event) =>
                  setItemForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="例如：感冒药"
                value={itemForm.name}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              区域
              <select
                className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]"
                onChange={(event) =>
                  setItemForm((current) => ({
                    ...current,
                    areaId: event.target.value,
                    locationId: "",
                  }))
                }
                value={itemForm.areaId}
              >
                <option value="">不设置位置</option>
                <option value="__unassigned__">未分区</option>
                {state.summary.areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              位置
              <select
                className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]"
                disabled={!itemForm.areaId}
                onChange={(event) =>
                  setItemForm((current) => ({
                    ...current,
                    locationId: event.target.value,
                  }))
                }
                value={itemForm.locationId}
              >
                <option value="">
                  {!itemForm.areaId
                    ? "请先选择区域"
                    : itemFormLocations.length === 0
                      ? "该区域暂无位置"
                      : "请选择位置"}
                </option>
                {itemFormLocations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              备注
              <input
                className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]"
                maxLength={1000}
                onChange={(event) =>
                  setItemForm((current) => ({ ...current, note: event.target.value }))
                }
                placeholder="可选"
                value={itemForm.note}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              过期日
              <input
                className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]"
                onChange={(event) =>
                  setItemForm((current) => ({
                    ...current,
                    expireDate: event.target.value,
                  }))
                }
                type="date"
                value={itemForm.expireDate}
              />
            </label>
            <button
              className="h-10 self-end rounded-md bg-[var(--primary)] px-4 text-sm font-medium text-white disabled:opacity-60"
              disabled={isSaving}
              type="submit"
            >
              {editingItemId ? "保存修改" : "新增物品"}
            </button>
          </form>

          {editingItemId ? (
            <div className="border-b border-[var(--border)] px-4 py-3">
              <button
                className="text-sm text-[var(--muted-foreground)]"
                onClick={() => {
                  setEditingItemId(null);
                  setItemForm({
                    name: "",
                    areaId: "",
                    locationId: "",
                    note: "",
                    expireDate: "",
                  });
                }}
                type="button"
              >
                取消编辑
              </button>
            </div>
          ) : null}

          {formMessage ? (
            <p className="border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
              {formMessage}
            </p>
          ) : null}

          {state.summary.isEmpty ? (
            <EmptyState text="先创建区域和位置，再添加第一个物品。" />
          ) : visibleItems.length === 0 ? (
            <EmptyState text="没有匹配的物品。" />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {visibleItems.map((item) => (
                <li className="p-4" key={item.id}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium">{item.name}</p>
                      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                        {item.areaName} / {item.locationName}
                        {item.note ? ` · ${item.note}` : " · 无备注"}
                      </p>
                      <ExpirationBadge item={item} />
                    </div>
                    <div className="flex shrink-0 gap-3">
                      <button className="text-sm" onClick={() => startEditItem(item)} type="button">
                        编辑
                      </button>
                      <button
                        className="text-sm text-red-600"
                        onClick={() => handleDeleteItem(item.id)}
                        type="button"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {mobileQuickPanel === "search" ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end bg-black/40 px-3 py-3 sm:items-center sm:justify-center sm:px-4"
          role="dialog"
        >
          <section className="max-h-[88vh] w-full overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-lg sm:max-w-xl">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] p-4">
              <div>
                <h2 className="text-base font-semibold">搜索物品</h2>
                <p className="text-sm text-[var(--muted-foreground)]">
                  {visibleItems.length} / {state.summary.itemCount} 个物品
                </p>
              </div>
              <button
                className="text-sm text-[var(--muted-foreground)]"
                onClick={() => setMobileQuickPanel(null)}
                type="button"
              >
                关闭
              </button>
            </div>

            <div className="grid gap-2 border-b border-[var(--border)] p-4">
              <input
                autoFocus
                className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]"
                onChange={(event) =>
                  setFilters((current) => ({ ...current, search: event.target.value }))
                }
                placeholder="搜索名称或备注"
                value={filters.search}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]"
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      areaId: event.target.value,
                      locationId: "",
                    }))
                  }
                  value={filters.areaId}
                >
                  <option value="">全部区域</option>
                  {state.summary.areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
                <select
                  className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]"
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      locationId: event.target.value,
                    }))
                  }
                  value={filters.locationId}
                >
                  <option value="">全部位置</option>
                  {filteredLocations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="max-h-[48vh] overflow-y-auto">
              {visibleItems.length === 0 ? (
                <p className="p-4 text-sm text-[var(--muted-foreground)]">
                  没有匹配的物品。
                </p>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {visibleItems.map((item) => (
                    <li key={item.id}>
                      <button
                        className="block w-full px-4 py-3 text-left"
                        onClick={() => setMobileQuickPanel(null)}
                        type="button"
                      >
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                          {item.areaName} / {item.locationName}
                          {item.note ? ` · ${item.note}` : ""}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {mobileQuickPanel === "item" ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end bg-black/40 px-3 py-3 sm:items-center sm:justify-center sm:px-4"
          role="dialog"
        >
          <section className="max-h-[88vh] w-full overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-lg sm:max-w-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] p-4">
              <h2 className="text-base font-semibold">新增物品</h2>
              <button
                className="text-sm text-[var(--muted-foreground)]"
                onClick={() => setMobileQuickPanel(null)}
                type="button"
              >
                关闭
              </button>
            </div>

            <form className="grid gap-3 p-4" onSubmit={handleMobileSaveItem}>
              <label className="grid gap-2 text-sm font-medium">
                物品名称
                <input
                  className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]"
                  maxLength={120}
                  onChange={(event) =>
                    setItemForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="例如：感冒药"
                  value={itemForm.name}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                区域
                <select
                  className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]"
                  onChange={(event) =>
                    setItemForm((current) => ({
                      ...current,
                      areaId: event.target.value,
                      locationId: "",
                    }))
                  }
                  value={itemForm.areaId}
                >
                  <option value="">不设置位置</option>
                  <option value="__unassigned__">未分区</option>
                  {state.summary.areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium">
                位置
                <select
                  className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]"
                  disabled={!itemForm.areaId}
                  onChange={(event) =>
                    setItemForm((current) => ({
                      ...current,
                      locationId: event.target.value,
                    }))
                  }
                  value={itemForm.locationId}
                >
                  <option value="">
                    {!itemForm.areaId
                      ? "请先选择区域"
                      : itemFormLocations.length === 0
                        ? "该区域暂无位置"
                        : "请选择位置"}
                  </option>
                  {itemFormLocations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium">
                备注
                <input
                  className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]"
                  maxLength={1000}
                  onChange={(event) =>
                    setItemForm((current) => ({ ...current, note: event.target.value }))
                  }
                  placeholder="可选"
                  value={itemForm.note}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                过期日
                <input
                  className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]"
                  onChange={(event) =>
                    setItemForm((current) => ({
                      ...current,
                      expireDate: event.target.value,
                    }))
                  }
                  type="date"
                  value={itemForm.expireDate}
                />
              </label>
              {formMessage ? (
                <p className="rounded-md bg-[var(--surface-muted)] p-3 text-sm text-[var(--muted-foreground)]">
                  {formMessage}
                </p>
              ) : null}
              <button
                className="h-10 rounded-md bg-[var(--primary)] px-4 text-sm font-medium text-white disabled:opacity-60"
                disabled={isSaving}
                type="submit"
              >
                保存物品
              </button>
            </form>
          </section>
        </div>
      ) : null}

      {mobileQuickPanel === "location" ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end bg-black/40 px-3 py-3 sm:items-center sm:justify-center sm:px-4"
          role="dialog"
        >
          <section className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-lg sm:max-w-md">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] p-4">
              <h2 className="text-base font-semibold">新增位置</h2>
              <button
                className="text-sm text-[var(--muted-foreground)]"
                onClick={() => setMobileQuickPanel(null)}
                type="button"
              >
                关闭
              </button>
            </div>

            <form className="grid gap-3 p-4" onSubmit={handleMobileCreateLocation}>
              <label className="grid gap-2 text-sm font-medium">
                位置名称
                <input
                  className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]"
                  maxLength={80}
                  onChange={(event) =>
                    setLocationForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="例如：上层抽屉"
                  value={locationForm.name}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                所属区域
                <select
                  className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]"
                  onChange={(event) =>
                    setLocationForm((current) => ({
                      ...current,
                      areaId: event.target.value,
                    }))
                  }
                  value={locationForm.areaId}
                >
                  <option value="">未分区</option>
                  {state.summary.areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
              </label>
              {formMessage ? (
                <p className="rounded-md bg-[var(--surface-muted)] p-3 text-sm text-[var(--muted-foreground)]">
                  {formMessage}
                </p>
              ) : null}
              <button
                className="h-10 rounded-md bg-[var(--primary)] px-4 text-sm font-medium text-white disabled:opacity-60"
                disabled={isSaving}
                type="submit"
              >
                保存位置
              </button>
            </form>
          </section>
        </div>
      ) : null}

      {mobileQuickPanel === "area" ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end bg-black/40 px-3 py-3 sm:items-center sm:justify-center sm:px-4"
          role="dialog"
        >
          <section className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-lg sm:max-w-md">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] p-4">
              <h2 className="text-base font-semibold">新增区域</h2>
              <button
                className="text-sm text-[var(--muted-foreground)]"
                onClick={() => setMobileQuickPanel(null)}
                type="button"
              >
                关闭
              </button>
            </div>

            <form className="grid gap-3 p-4" onSubmit={handleMobileSaveArea}>
              <label className="grid gap-2 text-sm font-medium">
                区域名称
                <input
                  className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]"
                  maxLength={80}
                  onChange={(event) =>
                    setAreaForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="例如：厨房"
                  value={areaForm.name}
                />
              </label>
              <div className="flex flex-wrap gap-2" role="radiogroup">
                {areaColors.map((color) => (
                  <button
                    aria-label={`区域颜色 ${color}`}
                    className="h-8 w-8 rounded-full border-2"
                    key={color}
                    onClick={() =>
                      setAreaForm((current) => ({ ...current, color }))
                    }
                    style={{
                      backgroundColor: color,
                      borderColor:
                        areaForm.color === color ? "var(--foreground)" : "white",
                    }}
                    type="button"
                  />
                ))}
              </div>
              {formMessage ? (
                <p className="rounded-md bg-[var(--surface-muted)] p-3 text-sm text-[var(--muted-foreground)]">
                  {formMessage}
                </p>
              ) : null}
              <button
                className="h-10 rounded-md bg-[var(--primary)] px-4 text-sm font-medium text-white disabled:opacity-60"
                disabled={isSaving}
                type="submit"
              >
                保存区域
              </button>
            </form>
          </section>
        </div>
      ) : null}

      {editingLocationId ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
        >
          <section className="w-full max-w-md rounded-md border border-[var(--border)] bg-[var(--surface)] p-5 shadow-lg">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">编辑位置</h2>
              <button
                className="text-sm text-[var(--muted-foreground)]"
                onClick={cancelLocationEdit}
                type="button"
              >
                取消
              </button>
            </div>

            <form className="grid gap-3" onSubmit={handleSaveLocationEdit}>
              <label className="grid gap-2 text-sm font-medium">
                位置名称
                <input
                  className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]"
                  maxLength={80}
                  onChange={(event) =>
                    setLocationForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  value={locationForm.name}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                所属区域
                <select
                  className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]"
                  onChange={(event) =>
                    setLocationForm((current) => ({
                      ...current,
                      areaId: event.target.value,
                    }))
                  }
                  value={locationForm.areaId}
                >
                  <option value="">未分区</option>
                  {state.summary.areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
              </label>
              {formMessage ? (
                <p className="rounded-md bg-[var(--surface-muted)] p-3 text-sm text-[var(--muted-foreground)]">
                  {formMessage}
                </p>
              ) : null}
              <div className="mt-2 flex justify-end gap-2">
                <button
                  className="h-10 rounded-md border border-[var(--border)] px-4 text-sm font-medium"
                  onClick={cancelLocationEdit}
                  type="button"
                >
                  取消
                </button>
                <button
                  className="h-10 rounded-md bg-[var(--primary)] px-4 text-sm font-medium text-white disabled:opacity-60"
                  disabled={isSaving}
                  type="submit"
                >
                  保存修改
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-10 text-[var(--foreground)]">
      <section className="w-full max-w-md rounded-md border border-[var(--border)] bg-[var(--surface)] p-6">
        {children}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-[var(--surface-muted)] p-3">
      <p className="text-sm text-[var(--muted-foreground)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-[300px] items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <h3 className="text-base font-semibold">暂无内容</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
          {text}
        </p>
      </div>
    </div>
  );
}

function ExpirationPanel({
  emptyText,
  items,
  title,
  tone,
}: {
  emptyText: string;
  items: DashboardItem[];
  title: string;
  tone: "soon" | "expired";
}) {
  const toneClass =
    tone === "expired"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <section className={`rounded-md border p-3 ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs font-medium">{items.length} 个</span>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 text-sm opacity-80">{emptyText}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.slice(0, 5).map((item) => (
            <li className="rounded-md bg-white/70 p-2" key={item.id}>
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-medium">{item.name}</p>
                <time className="shrink-0 text-xs font-medium">{item.expireDate}</time>
              </div>
              <p className="mt-1 truncate text-xs opacity-80">
                {item.areaName} / {item.locationName}
              </p>
            </li>
          ))}
        </ul>
      )}
      {items.length > 5 ? (
        <p className="mt-2 text-xs opacity-80">还有 {items.length - 5} 个</p>
      ) : null}
    </section>
  );
}

function ExpirationBadge({ item }: { item: DashboardItem }) {
  if (item.expirationStatus === "none") {
    return null;
  }

  const labels = {
    expired: `已过期 ${item.expireDate}`,
    soon: `即将过期 ${item.expireDate}`,
    normal: `到期 ${item.expireDate}`,
  };
  const className =
    item.expirationStatus === "expired"
      ? "text-red-700"
      : item.expirationStatus === "soon"
        ? "text-amber-700"
        : "text-[var(--muted-foreground)]";

  return <p className={`mt-2 text-sm ${className}`}>{labels[item.expirationStatus]}</p>;
}
