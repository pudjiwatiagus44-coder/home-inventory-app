"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  createSupabaseFamilySettingsClient,
  listHouseholdsForUser,
} from "../family/family-actions";
import { createFamilyHttpClient } from "../family/family-client";
import type { HouseholdOption } from "../family/family-data";
import { FamilySettings } from "../family/FamilySettings";
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
import type {
  InventoryConflictResolution,
  InventoryImportPlan,
  InventoryImportSummary,
} from "./excel-backup";
import {
  writeInventoryBackupWorkbookToBuffer,
  downloadInventoryBackupBuffer,
  generateInventoryBackupFilename,
} from "./excel-backup";

type DashboardState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string }
  | { status: "ready"; summary: DashboardSummary; userId: string };

type MobileQuickPanel = "search" | "item" | "location" | "area" | null;
type ItemSortMode = "expireSoon" | "expireLate" | "name";

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
      importItems: (file: File) => inventory.importItems(file),
      previewImport: (file: File) => inventory.previewImport(file),
      commitImport: (input: {
        rows: InventoryImportPlan["rows"];
        conflictResolutions: Record<string, InventoryConflictResolution>;
      }) => inventory.commitImport(input),
    };
  }

  const supabase = createSupabaseBrowserClient();
  const repository = createSupabaseInventoryRepository(supabase);

  return {
    createArea: (input: AreaInput & { householdId?: string }) =>
      repository.createArea({
        householdId: input.householdId ?? "",
        name: input.name,
        color: input.color ?? areaColors[0],
      }),
    updateArea: (input: AreaInput & { householdId?: string; areaId: string }) =>
      repository.updateArea({
        householdId: input.householdId ?? "",
        areaId: input.areaId,
        name: input.name,
        color: input.color ?? areaColors[0],
      }),
    deleteArea: (input: { householdId?: string; areaId: string }) =>
      repository.deleteArea({
        householdId: input.householdId ?? "",
        areaId: input.areaId,
      }),
    createLocation: (input: LocationInput & { householdId?: string }) =>
      repository.createLocation({
        householdId: input.householdId ?? "",
        name: input.name,
        areaId: input.areaId ?? null,
      }),
    updateLocation: (
      input: LocationInput & { householdId?: string; locationId: string },
    ) =>
      repository.updateLocation({
        householdId: input.householdId ?? "",
        locationId: input.locationId,
        name: input.name,
        areaId: input.areaId ?? null,
      }),
    deleteLocation: (input: { householdId?: string; locationId: string }) =>
      repository.deleteLocation({
        householdId: input.householdId ?? "",
        locationId: input.locationId,
      }),
    createItem: (
      input: InventoryItemInput & { householdId?: string; createdBy?: string },
    ) =>
      repository.createItem({
        householdId: input.householdId ?? "",
        name: input.name,
        note: input.note,
        expireDate: input.expireDate,
        locationId: input.locationId,
      }),
    updateItem: (
      input: InventoryItemInput & { householdId?: string; itemId: string },
    ) =>
      repository.updateItem({
        householdId: input.householdId ?? "",
        itemId: input.itemId,
        name: input.name,
        note: input.note,
        expireDate: input.expireDate,
        locationId: input.locationId,
      }),
    deleteItem: (input: { householdId?: string; itemId: string }) =>
      repository.deleteItem({
        householdId: input.householdId ?? "",
        itemId: input.itemId,
      }),
    importItems: async () => {
      throw new Error("批量导入当前仅在自托管部署模式可用");
    },
    previewImport: async () => {
      throw new Error("批量导入当前仅在自托管部署模式可用");
    },
    commitImport: async () => {
      throw new Error("批量导入当前仅在自托管部署模式可用");
    },
  };
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
  const [showAreaComposer, setShowAreaComposer] = useState(false);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [locationForm, setLocationForm] = useState({ name: "", areaId: "" });
  const [locationColor, setLocationColor] = useState(areaColors[1]);
  const [showLocationComposer, setShowLocationComposer] = useState(false);
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
  const [itemSortMode, setItemSortMode] = useState<ItemSortMode>("expireSoon");
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [households, setHouseholds] = useState<HouseholdOption[]>([]);
  const [activeHouseholdId, setActiveHouseholdId] = useState<string | null>(
    null,
  );
  const [showFamilySettings, setShowFamilySettings] = useState(false);
  const [importStatus, setImportStatus] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "preview"; plan: InventoryImportPlan }
    | {
        status: "success";
        summary: InventoryImportSummary;
      }
    | { status: "error"; message: string }
  >({ status: "idle" });
  const [conflictResolutions, setConflictResolutions] = useState<
    Record<string, InventoryConflictResolution>
  >({});
  const importInputRef = useRef<HTMLInputElement>(null);

  const loadDashboard = useCallback(
    async (shouldUpdate: () => boolean = () => true) => {
      try {
        if (selfHostedUser) {
          const familyClient = createFamilyHttpClient();
          const memberships = await familyClient.listHouseholds();
          const activeMembership =
            memberships.find(
              (household) => household.id === activeHouseholdId,
            ) ?? memberships[0];
          const data = await createSelfHostedInventoryClient().getDashboard(
            activeMembership?.id,
          );
          const summary = buildDashboardSummary(data);

          if (shouldUpdate()) {
            setHouseholds(memberships);
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

        const memberships = await listHouseholdsForUser(
          supabase,
          userResult.data.user.id,
        );
        const activeMembership =
          memberships.find(
            (household) => household.id === activeHouseholdId,
          ) ?? memberships[0];
        const householdId =
          activeMembership?.id ??
          (await getOrCreateDefaultHouseholdId(
            supabase,
            userResult.data.user,
          ));

        setHouseholds(
          memberships.length > 0
            ? memberships
            : [{ id: householdId, name: "我的家庭", role: "owner" }],
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
    [activeHouseholdId, selfHostedUser],
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

    return sortDashboardItems(
      filterInventoryItems(state.summary.items, filters),
      itemSortMode,
    );
  }, [filters, itemSortMode, state]);

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

  function handleExport() {
    if (state.status !== "ready") {
      setFormMessage("请先等待清单加载完成");
      return;
    }

    try {
      const buffer = writeInventoryBackupWorkbookToBuffer({
        household: {
          id: state.summary.householdId,
          name: state.summary.householdName,
        },
        areas: state.summary.areas.map((area) => ({
          id: area.id,
          name: area.name,
          color: area.color,
        })),
        locations: state.summary.locations.map((location) => ({
          id: location.id,
          name: location.name,
          area_id: location.areaId,
        })),
        items: state.summary.items.map((item) => ({
          id: item.id,
          name: item.name,
          note: item.note,
          expire_date: item.expireDate,
          location_id: item.locationId,
        })),
      });
      downloadInventoryBackupBuffer(buffer, generateInventoryBackupFilename());
      setFormMessage(null);
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "备份导出失败");
    }
  }

  function handleImportClick() {
    if (state.status !== "ready") {
      setFormMessage("请先等待清单加载完成");
      return;
    }

    importInputRef.current?.click();
  }

  async function handleImportFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    event.target.value = "";
    setImportStatus({ status: "loading" });
    setConflictResolutions({});
    setFormMessage(null);

    try {
      const writeClient = createDashboardWriteClient(selfHostedUser);
      const plan = await writeClient.previewImport(file);
      const defaultResolutions = Object.fromEntries(
        plan.conflicts.map((conflict) => [conflict.id, "skip" as const]),
      );
      setConflictResolutions(defaultResolutions);

      if (plan.conflicts.length > 0 || plan.errors.length > 0) {
        setImportStatus({ status: "preview", plan });
        setFormMessage(
          `发现 ${plan.conflicts.length} 个差异重复项，${plan.errors.length} 行需要处理。`,
        );
        return;
      }

      const summary = await writeClient.commitImport({
        rows: plan.rows,
        conflictResolutions: {},
      });
      setImportStatus({ status: "success", summary });
      setFormMessage(formatImportSummary(summary));
      await loadDashboard();
    } catch (error) {
      const message = error instanceof Error ? error.message : "导入失败";
      setImportStatus({ status: "error", message });
      setFormMessage(message);
    }
  }

  async function handleCommitImport() {
    if (importStatus.status !== "preview") {
      return;
    }

    setIsSaving(true);
    setFormMessage(null);

    try {
      const writeClient = createDashboardWriteClient(selfHostedUser);
      const summary = await writeClient.commitImport({
        rows: importStatus.plan.rows,
        conflictResolutions,
      });
      setImportStatus({ status: "success", summary });
      setConflictResolutions({});
      setFormMessage(formatImportSummary(summary));
      await loadDashboard();
    } catch (error) {
      const message = error instanceof Error ? error.message : "导入失败";
      setImportStatus({ status: "error", message });
      setFormMessage(message);
    } finally {
      setIsSaving(false);
    }
  }

  function closeImportPreview() {
    setImportStatus({ status: "idle" });
    setConflictResolutions({});
  }

  function setConflictResolution(
    conflictId: string,
    resolution: InventoryConflictResolution,
  ) {
    setConflictResolutions((current) => ({
      ...current,
      [conflictId]: resolution,
    }));
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
      setLocationColor(areaColors[1]);
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
      setShowAreaComposer(false);
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
      setLocationColor(areaColors[1]);
      setShowLocationComposer(false);
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
      setShowLocationComposer(false);
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

  function openDatePicker(input: HTMLInputElement) {
    try {
      input.showPicker?.();
    } catch {
      // Some browsers only allow showPicker during direct user activation.
    }
  }

  function startEditArea(area: DashboardSummary["areas"][number]) {
    setFormMessage(null);
    setShowAreaComposer(false);
    setEditingAreaId(area.id);
    setAreaForm({ name: area.name, color: area.color });
  }

  function cancelAreaEdit() {
    setFormMessage(null);
    setEditingAreaId(null);
    setAreaForm({ name: "", color: areaColors[0] });
  }

  function startEditLocation(location: DashboardSummary["locations"][number]) {
    setFormMessage(null);
    setShowLocationComposer(false);
    setEditingLocationId(location.id);
    setLocationForm({ name: location.name, areaId: location.areaId ?? "" });
  }

  function cancelLocationEdit() {
    setFormMessage(null);
    setEditingLocationId(null);
    setShowLocationComposer(false);
    setLocationForm({ name: "", areaId: "" });
  }

  function startEditItem(item: DashboardItem) {
    if (state.status !== "ready") {
      return;
    }

    setEditingItemId(item.id);
    setMobileQuickPanel("item");
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
      <header className="border-b border-[var(--border)] bg-[var(--surface)]/95">
        <div className="mx-auto flex min-h-16 max-w-[1760px] items-center justify-between gap-4 px-4 py-2 sm:px-6 lg:grid lg:grid-cols-[minmax(180px,280px)_minmax(320px,520px)_minmax(180px,1fr)] xl:grid-cols-[minmax(180px,280px)_minmax(320px,520px)_minmax(180px,1fr)]">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--primary)] text-[13px] font-semibold text-white">
              家
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-[18px] font-semibold leading-6">家中清单</h1>
            </div>
            {households.length > 1 ? (
              <select
                aria-label="切换家庭"
                className="h-8 max-w-[150px] rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] px-2 text-[12px] outline-none focus:border-[var(--primary)]"
                onChange={(event) => setActiveHouseholdId(event.target.value)}
                value={activeHouseholdId ?? households[0]?.id ?? ""}
              >
                {households.map((household) => (
                  <option key={household.id} value={household.id}>
                    {household.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <div className="hidden h-10 min-w-0 items-center gap-2 lg:flex">
            <label className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-[var(--muted-foreground)]">
                搜索
              </span>
              <input
                className="h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] px-14 !text-[13px] shadow-sm outline-none focus:border-[var(--primary)]"
                data-testid="global-item-search"
                onChange={(event) =>
                  setFilters((current) => ({ ...current, search: event.target.value }))
                }
                placeholder="搜索物品（名称 / 备注 / 位置）"
                value={filters.search}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--muted-foreground)]">
                ⌘ K
              </span>
            </label>
            <button
              className="h-10 shrink-0 rounded-md bg-[var(--primary)] px-3 text-[13px] font-medium text-white shadow-sm"
              data-testid="top-add-item-button"
              onClick={() => openMobileQuickPanel("item")}
              type="button"
            >
              + 新增物品
            </button>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              className="h-9 rounded-md border border-transparent px-2 text-[13px] text-[var(--muted-foreground)] hover:border-[var(--border)] hover:bg-[var(--surface-elevated)] lg:hidden"
              onClick={handleExport}
              type="button"
            >
              备份
            </button>
            <button
              className="h-9 rounded-md border border-transparent px-2 text-[13px] text-[var(--muted-foreground)] hover:border-[var(--border)] hover:bg-[var(--surface-elevated)] lg:hidden"
              onClick={handleImportClick}
              type="button"
            >
              导入
            </button>
            <button
              className="hidden h-9 rounded-md border border-transparent px-2 text-[13px] text-[var(--muted-foreground)] hover:border-[var(--border)] hover:bg-[var(--surface-elevated)] lg:block"
              onClick={handleExport}
              type="button"
            >
              备份
            </button>
            <button
              className="hidden h-9 rounded-md border border-transparent px-2 text-[13px] text-[var(--muted-foreground)] hover:border-[var(--border)] hover:bg-[var(--surface-elevated)] lg:block"
              onClick={handleImportClick}
              type="button"
            >
              导入
            </button>
            <input
              ref={importInputRef}
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              data-testid="import-file-input"
              onChange={handleImportFileChange}
              type="file"
            />
            <button
              className="hidden h-9 rounded-md border border-transparent px-2 text-[13px] text-[var(--muted-foreground)] hover:border-[var(--border)] hover:bg-[var(--surface-elevated)] lg:block"
              type="button"
            >
              提醒
            </button>
            <button
              className="hidden h-9 rounded-md border border-transparent px-2 text-[13px] text-[var(--muted-foreground)] hover:border-[var(--border)] hover:bg-[var(--surface-elevated)] lg:block"
              onClick={() => {
                setShowFamilySettings(true);
              }}
              type="button"
            >
              设置
            </button>
            <button
              className="h-9 rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-[13px] font-medium shadow-sm"
              onClick={handleSignOut}
              type="button"
            >
              退出
            </button>
          </div>
        </div>
      </header>

      <section
        className="mx-auto grid h-[calc(100dvh-65px)] max-w-[720px] grid-rows-[40px_88px_72px_minmax(0,1fr)] gap-1.5 overflow-hidden px-4 py-1.5 sm:px-6 lg:hidden"
        data-testid="mobile-dashboard"
      >
        <label className="relative block">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-[var(--muted-foreground)]">
            ⌕
          </span>
          <input
            className="h-10 w-full rounded-[12px] border-0 bg-[var(--surface-muted)] px-10 !text-[13px] font-medium shadow-inner outline-none placeholder:text-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--primary)]/35"
            data-testid="mobile-search-field"
            onChange={(event) =>
              setFilters((current) => ({ ...current, search: event.target.value }))
            }
            placeholder="搜索物品（名称 / 类别 / 位置 / 备注）"
            value={filters.search}
          />
        </label>

        <section className="min-w-0 rounded-[12px] border border-[var(--border)] bg-[var(--surface-elevated)] p-1.5 shadow-sm">
          <div className="mb-0.5 flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold leading-4">区域</h2>
          </div>
          <div
            className="-mx-1 flex gap-2 overflow-x-auto overscroll-x-contain px-1 pb-1"
            data-testid="mobile-area-strip"
          >
            {state.summary.areas.map((area) => {
              const itemCount = state.summary.items.filter(
                (item) => item.areaId === area.id,
              ).length;
              const isSelected = filters.areaId === area.id;

              return (
                <button
                  className={`grid h-10 min-w-20 place-items-center rounded-[9px] border px-1.5 text-center transition ${
                    isSelected
                      ? "border-[var(--primary)] bg-[#eef5ef] text-[var(--primary)]"
                      : "border-[var(--border)] bg-white text-[var(--foreground)]"
                  }`}
                  key={area.id}
                  onClick={() => {
                    setFilters((current) => ({
                      ...current,
                      areaId: area.id,
                      locationId: "",
                    }));
                    setLocationAreaFilter(area.id);
                  }}
                  type="button"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: area.color }}
                  />
                  <span className="text-[12px] font-semibold leading-3">{area.name}</span>
                  <span className="text-[10px] leading-3 text-[var(--muted-foreground)]">
                    {itemCount}
                  </span>
                </button>
              );
            })}
            <button
              className="grid h-10 min-w-20 place-items-center rounded-[9px] border border-[var(--border)] bg-white px-1.5 text-center text-[var(--muted-foreground)]"
              onClick={() => openMobileQuickPanel("area")}
              type="button"
            >
              <span className="text-base leading-none">+</span>
              <span className="text-[10px]">新增区域</span>
            </button>
          </div>
        </section>

        <section className="min-w-0 rounded-[12px] border border-[var(--border)] bg-[var(--surface-elevated)] p-1.5 shadow-sm">
          <div className="mb-0.5 flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold leading-4">位置</h2>
            {filters.areaId ? (
              <button
                className="text-[12px] font-medium text-[var(--primary)]"
                onClick={() => {
                  setFilters((current) => ({
                    ...current,
                    areaId: "",
                    locationId: "",
                  }));
                  setLocationAreaFilter("");
                }}
                type="button"
              >
                全部区域
              </button>
            ) : null}
          </div>
          <div
            className="-mx-1 flex gap-2 overflow-x-auto overscroll-x-contain px-1 pb-1"
            data-testid="mobile-location-strip"
          >
            {visibleLocations.map((location) => {
              const itemCount = state.summary.items.filter(
                (item) => item.locationId === location.id,
              ).length;
              const isSelected = filters.locationId === location.id;

              return (
                <button
                  className={`grid h-9 min-w-20 place-items-center rounded-[9px] border px-1.5 text-center transition ${
                    isSelected
                      ? "border-[var(--primary)] bg-[#eef5ef] text-[var(--primary)]"
                      : "border-[var(--border)] bg-white text-[var(--foreground)]"
                  }`}
                  key={location.id}
                  onClick={() => {
                    setFilters((current) => ({
                      ...current,
                      areaId: location.areaId ?? "",
                      locationId: location.id,
                    }));
                    setLocationAreaFilter(location.areaId ?? "");
                  }}
                  type="button"
                >
                  <span className="text-[12px] font-semibold leading-3">
                    {location.name}
                  </span>
                  <span className="text-[10px] leading-3 text-[var(--muted-foreground)]">
                    {itemCount}
                  </span>
                </button>
              );
            })}
            <button
              className="grid h-9 min-w-20 place-items-center rounded-[9px] border border-[var(--border)] bg-white px-1.5 text-center text-[var(--muted-foreground)]"
              onClick={() => openMobileQuickPanel("location")}
              type="button"
            >
              <span className="text-base leading-none">+</span>
              <span className="text-[10px]">新增位置</span>
            </button>
          </div>
        </section>

        <section className="flex min-h-0 flex-col rounded-[12px] border border-[var(--border)] bg-[var(--surface-elevated)] p-2 shadow-sm">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 className="text-[16px] font-semibold leading-5">物品</h2>
            <select
              className="h-7 rounded-md border-0 bg-transparent px-1 !text-[12px] text-[var(--muted-foreground)] outline-none"
              onChange={(event) => setItemSortMode(event.target.value as ItemSortMode)}
              value={itemSortMode}
            >
              <option value="expireSoon">按过期日 ↑</option>
              <option value="expireLate">按过期日 ↓</option>
              <option value="name">按名称</option>
            </select>
          </div>

          <div
            className="min-h-0 overflow-y-auto overscroll-y-contain"
            data-testid="mobile-item-scroll"
          >
            {state.summary.isEmpty ? (
              <EmptyState text="先创建区域和位置，再添加第一个物品。" />
            ) : visibleItems.length === 0 ? (
              <EmptyState text="没有匹配的物品。" />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {visibleItems.map((item) => (
                  <li key={item.id}>
                    <button
                      className="grid h-[44px] w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 text-left"
                      onClick={() => startEditItem(item)}
                      type="button"
                    >
                      <span
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-muted)] text-[12px] font-semibold text-[var(--primary)]"
                        data-testid="mobile-item-thumbnail"
                      >
                        {item.name.slice(0, 1)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-semibold leading-4">
                          {item.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] leading-3 text-[var(--muted-foreground)]">
                          {item.locationName}
                          {item.note ? ` · ${item.note}` : ""}
                        </span>
                      </span>
                      <span className="grid justify-items-end gap-0 text-[11px] leading-3 text-[var(--muted-foreground)]">
                        <span>{item.expireDate || "-"}</span>
                        <span>{item.expirationStatus === "expired" ? "已过期" : item.expirationStatus === "soon" ? "即将过期" : "正常"}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <button
          aria-label="新增物品"
          className="fixed bottom-5 right-4 z-40 flex h-14 w-14 flex-col items-center justify-center rounded-full bg-[var(--primary)] text-sm font-semibold text-white shadow-xl shadow-black/20"
          data-testid="mobile-add-item-button"
          onClick={() => openMobileQuickPanel("item")}
          type="button"
        >
          <span className="text-2xl leading-5">+</span>
          <span className="text-[12px] leading-4">新增</span>
        </button>
      </section>

      <main
        className="mx-auto hidden h-[calc(100vh-65px)] overflow-hidden w-full max-w-[1760px] gap-0 border-t border-[var(--border)] px-4 py-0 sm:px-6 lg:grid lg:grid-cols-[260px_260px_minmax(420px,1fr)] xl:grid-cols-[260px_260px_minmax(420px,1fr)] 2xl:grid-cols-[280px_280px_minmax(640px,1fr)]"
        data-testid="desktop-inventory-shell"
      >
        <section
          className="order-1 flex min-h-0 flex-col border-x border-[var(--border)] bg-[var(--surface)] p-3"
          data-testid="area-panel"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-semibold leading-6">区域</h2>
            </div>
            <button
              className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-[13px] font-medium"
              data-testid="area-add-button"
              onClick={() => {
                setEditingAreaId(null);
                setAreaForm({ name: "", color: areaColors[0] });
                setShowAreaComposer((current) => !current);
              }}
              type="button"
            >
              + 新增区域
            </button>
          </div>

          {showAreaComposer ? (
          <form className="mb-3 grid gap-2 border-b border-[var(--border)] pb-3" onSubmit={handleSaveArea}>
            <label className="grid gap-1.5 text-[13px] font-medium">
              区域名称
              <input
                className="h-9 rounded-md border border-[var(--border)] bg-white px-3 !text-[14px] outline-none focus:border-[var(--primary)]"
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
            <div className="flex flex-wrap gap-1.5" role="radiogroup">
              {areaColors.map((color) => (
                <button
                  aria-label={`区域颜色 ${color}`}
                  className="h-7 w-7 rounded-full border-2 shadow-sm"
                  key={color}
                  onClick={() => setAreaForm((current) => ({ ...current, color }))}
                  style={{
                    backgroundColor: color,
                    borderColor:
                      areaForm.color === color ? "var(--foreground)" : "white",
                  }}
                  type="button"
                />
              ))}
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <button
                className="h-9 rounded-md bg-[var(--primary)] px-3 text-[14px] font-medium text-white disabled:opacity-60"
                disabled={isSaving}
                type="submit"
              >
                {editingAreaId ? "保存区域" : "新增区域"}
              </button>
              {editingAreaId ? (
                <button
                  className="h-9 rounded-md border border-[var(--border)] px-3 text-[14px]"
                  onClick={() => {
                    setEditingAreaId(null);
                    setAreaForm({ name: "", color: areaColors[0] });
                    setShowAreaComposer(false);
                  }}
                  type="button"
                >
                  取消
                </button>
              ) : null}
            </div>
          </form>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto" data-testid="area-list-scroll">
            <ul className="mt-3 space-y-1.5 pr-1">
              {state.summary.areas.map((area) => {
                const itemCount = state.summary.items.filter(
                  (item) => item.areaId === area.id,
                ).length;
                const isSelected = filters.areaId === area.id;

                return (
                  <li key={area.id}>
                    <div
                      className={`w-full rounded-md border px-3 py-2 text-left transition ${
                        isSelected
                          ? "border-[var(--primary)] bg-[var(--surface-elevated)] shadow-sm"
                          : "border-transparent hover:border-[var(--border)] hover:bg-[var(--surface-muted)]"
                      }`}
                      data-testid="area-list-item-main"
                      onClick={() => {
                        setFilters((current) => ({
                          ...current,
                          areaId: area.id,
                          locationId: "",
                        }));
                        setLocationAreaFilter(area.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setFilters((current) => ({
                            ...current,
                            areaId: area.id,
                            locationId: "",
                          }));
                          setLocationAreaFilter(area.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: area.color }}
                          />
                          <span
                            className="truncate text-[14px] font-semibold leading-5"
                            onDoubleClick={() => startEditArea(area)}
                          >
                            {area.name}
                          </span>
                          <span className="shrink-0 text-[13px] text-[var(--muted-foreground)]">
                            {area.locationCount} 个位置
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-[13px] text-[var(--muted-foreground)]">
                            {itemCount} 件
                          </span>
                          <button
                            aria-label="删除区域"
                            className="flex h-5 w-5 items-center justify-center rounded-full text-[13px] text-[var(--danger)] hover:bg-[var(--surface-muted)]"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteArea(area.id);
                            }}
                            type="button"
                          >
                            ×
                          </button>
                        </span>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section
          className="order-2 flex min-h-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] p-3"
          data-testid="location-panel"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-semibold leading-6">位置</h2>
            </div>
            <button
              className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-[13px] font-medium"
              data-testid="location-add-button"
              onClick={() => {
                setEditingLocationId(null);
                setLocationForm({ name: "", areaId: "" });
                setLocationColor(areaColors[1]);
                setShowLocationComposer((current) => !current);
              }}
              type="button"
            >
              + 新增位置
            </button>
          </div>

          {showLocationComposer ? (
          <form className="mb-3 grid gap-2 border-b border-[var(--border)] pb-3" onSubmit={handleCreateLocation}>
            <div className="grid gap-2 sm:grid-cols-2" data-testid="location-composer-fields">
              <label className="grid gap-1.5 text-[13px] font-medium">
                位置名称
                <input
                  className="h-9 rounded-md border border-[var(--border)] bg-white px-3 !text-[14px] outline-none focus:border-[var(--primary)]"
                  maxLength={80}
                  onChange={(event) =>
                    setLocationForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="例如：冰箱上层"
                  value={locationForm.name}
                />
              </label>
              <label className="grid gap-1.5 text-[13px] font-medium">
                所属区域
                <select
                  className="h-9 rounded-md border border-[var(--border)] bg-white px-3 !text-[14px] outline-none focus:border-[var(--primary)]"
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
            </div>
            <div className="flex flex-wrap gap-1.5" data-testid="location-color-picker" role="radiogroup">
              {areaColors.map((color) => (
                <button
                  aria-label={`位置颜色 ${color}`}
                  className="h-7 w-7 rounded-full border-2 shadow-sm"
                  key={color}
                  onClick={() => setLocationColor(color)}
                  style={{
                    backgroundColor: color,
                    borderColor:
                      locationColor === color ? "var(--foreground)" : "white",
                  }}
                  type="button"
                />
              ))}
            </div>
            <button
              className="h-9 rounded-md bg-[var(--secondary)] px-3 text-[14px] font-medium text-white disabled:opacity-60"
              disabled={isSaving}
              type="submit"
            >
              保存位置
            </button>
          </form>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto" data-testid="location-list-scroll">
            <ul className="mt-3 space-y-1.5 pr-1">
              {visibleLocations.map((location) => {
                const itemCount = state.summary.items.filter(
                  (item) => item.locationId === location.id,
                ).length;
                const isSelected = filters.locationId === location.id;

                return (
                  <li key={location.id}>
                    <div
                      className={`w-full rounded-md border px-3 py-2 text-left transition ${
                        isSelected
                          ? "border-[var(--secondary)] bg-[var(--surface-elevated)] shadow-sm"
                          : "border-transparent hover:border-[var(--border)] hover:bg-[var(--surface-muted)]"
                      }`}
                      data-testid="location-list-item-main"
                      onClick={() =>
                        setFilters((current) => ({
                          ...current,
                          areaId: location.areaId ?? "",
                          locationId: location.id,
                        }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setFilters((current) => ({
                            ...current,
                            areaId: location.areaId ?? "",
                            locationId: location.id,
                          }));
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="truncate text-[14px] font-semibold leading-5"
                            onDoubleClick={() => startEditLocation(location)}
                          >
                            {location.name}
                          </span>
                          <span className="truncate text-[13px] text-[var(--muted-foreground)]">
                            {location.areaName}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-[13px] text-[var(--muted-foreground)]">
                            {itemCount} 件
                          </span>
                          <button
                            aria-label="删除位置"
                            className="flex h-5 w-5 items-center justify-center rounded-full text-[13px] text-[var(--danger)] hover:bg-[var(--surface-muted)]"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteLocation(location.id);
                            }}
                            type="button"
                          >
                            ×
                          </button>
                        </span>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
            {visibleLocations.length === 0 ? (
              <p className="mt-3 rounded-md bg-[var(--surface-muted)] p-2.5 text-sm text-[var(--muted-foreground)]">
                当前区域暂无位置。
              </p>
            ) : null}
          </div>
        </section>

        <section className="order-3 flex min-h-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
          <div className="grid gap-3 border-b border-[var(--border)] px-4 py-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-[16px] font-semibold leading-6">物品</h2>
                <p className="text-[13px] text-[var(--muted-foreground)]">
                  共 {visibleItems.length} 件
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="h-8 rounded-md border border-[var(--border)] bg-white px-2 !text-[13px] outline-none focus:border-[var(--primary)]"
                  data-testid="item-sort"
                  onChange={(event) => setItemSortMode(event.target.value as ItemSortMode)}
                  value={itemSortMode}
                >
                  <option value="expireSoon">按过期日 ↑</option>
                  <option value="expireLate">按过期日 ↓</option>
                  <option value="name">按名称</option>
                </select>
              </div>
            </div>
          </div>

          <form
            className="hidden"
            onSubmit={handleSaveItem}
          >
            <label className="grid gap-1.5 text-[13px] font-medium">
              物品名称
              <input
                className="h-9 rounded-md border border-[var(--border)] bg-white px-3 !text-[14px] outline-none focus:border-[var(--primary)]"
                maxLength={120}
                onChange={(event) =>
                  setItemForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="例如：感冒药"
                value={itemForm.name}
              />
            </label>
            <label className="grid gap-1.5 text-[13px] font-medium">
              区域
              <select
                className="h-9 rounded-md border border-[var(--border)] bg-white px-3 !text-[14px] outline-none focus:border-[var(--primary)]"
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
            <label className="grid gap-1.5 text-[13px] font-medium">
              位置
              <select
                className="h-9 rounded-md border border-[var(--border)] bg-white px-3 !text-[14px] outline-none focus:border-[var(--primary)]"
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
            <label className="grid gap-1.5 text-[13px] font-medium">
              备注
              <input
                className="h-9 rounded-md border border-[var(--border)] bg-white px-3 !text-[14px] outline-none focus:border-[var(--primary)]"
                maxLength={1000}
                onChange={(event) =>
                  setItemForm((current) => ({ ...current, note: event.target.value }))
                }
                placeholder="可选"
                value={itemForm.note}
              />
            </label>
            <label className="grid gap-1.5 text-[13px] font-medium">
              过期日
              <input
                className="h-9 rounded-md border border-[var(--border)] bg-white px-3 !text-[14px] outline-none focus:border-[var(--primary)]"
                onClick={(event) => openDatePicker(event.currentTarget)}
                onFocus={(event) => openDatePicker(event.currentTarget)}
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
              className="h-9 self-end rounded-md bg-[var(--primary)] px-4 text-[14px] font-medium text-white disabled:opacity-60 xl:col-start-3"
              disabled={isSaving}
              type="submit"
            >
              {editingItemId ? "保存修改" : "新增物品"}
            </button>
          </form>

          <div
            className="hidden"
            data-testid="item-search"
          >
            <input
              className="h-9 rounded-md border border-[var(--border)] bg-white px-3 !text-[14px] outline-none focus:border-[var(--primary)]"
              onChange={(event) =>
                setFilters((current) => ({ ...current, search: event.target.value }))
              }
              placeholder="搜索名称或备注"
              value={filters.search}
            />
            <select
              className="h-9 rounded-md border border-[var(--border)] bg-white px-3 !text-[14px] outline-none focus:border-[var(--primary)]"
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
              className="h-9 rounded-md border border-[var(--border)] bg-white px-3 !text-[14px] outline-none focus:border-[var(--primary)]"
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

          <div
            className="hidden"
            data-testid="item-expiration"
          >
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

          {formMessage ? (
            <p className="border-b border-[var(--border)] px-3 py-2 text-[13px] text-[var(--muted-foreground)]">
              {formMessage}
            </p>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto" data-testid="item-list-scroll">
            {state.summary.isEmpty ? (
              <EmptyState text="先创建区域和位置，再添加第一个物品。" />
            ) : visibleItems.length === 0 ? (
              <EmptyState text="没有匹配的物品。" />
            ) : (
              <div data-testid="item-table">
              <div className="grid grid-cols-[1.2fr_1fr_120px_44px] border-b border-[var(--border)] px-4 py-2 text-[12px] text-[var(--muted-foreground)]">
                <span>物品名称</span>
                <span>备注</span>
                <span>过期日</span>
                <span className="text-right">操作</span>
              </div>
            <ul className="divide-y divide-[var(--border)]">
              {visibleItems.map((item) => (
                <li className="px-4 py-2 transition hover:bg-[var(--surface-muted)]/45" key={item.id}>
                  <div className="grid items-center gap-3 lg:grid-cols-[1.2fr_1fr_120px_44px]">
                    <div className="flex min-w-0 gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] text-xs font-semibold text-[var(--primary)]">
                        {item.name.slice(0, 1)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <p
                            className="truncate text-[14px] font-semibold leading-5"
                            onDoubleClick={() => startEditItem(item)}
                          >
                            {item.name}
                          </p>
                          <span className="truncate text-[12px] text-[var(--muted-foreground)]">
                            {item.areaName} / {item.locationName}
                          </span>
                        </div>
                      </div>
                    </div>
                    <p
                      className="truncate text-[13px] text-[var(--muted-foreground)]"
                      onDoubleClick={() => startEditItem(item)}
                    >
                      {item.note || "无备注"}
                    </p>
                    <p
                      className="text-[13px] text-[var(--muted-foreground)]"
                      onDoubleClick={() => startEditItem(item)}
                    >
                      {item.expireDate || "-"}
                    </p>
                    <div className="flex shrink-0 justify-end">
                      <button
                        aria-label="删除物品"
                        className="flex h-6 w-6 items-center justify-center rounded-full text-[13px] text-[var(--danger)] hover:bg-[var(--surface-muted)]"
                        onClick={() => handleDeleteItem(item.id)}
                        type="button"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
              </div>
            )}
          </div>
        </section>
      </main>

      {importStatus.status === "preview" ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          data-testid="import-conflict-dialog"
          role="dialog"
        >
          <section className="flex max-h-[82vh] w-full max-w-3xl flex-col rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-lg">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] p-4">
              <div>
                <h2 className="text-base font-semibold">确认批量导入</h2>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  新增 {importStatus.plan.creates.length} 项，自动跳过{" "}
                  {importStatus.plan.skipped.length} 项，差异重复{" "}
                  {importStatus.plan.conflicts.length} 项，错误{" "}
                  {importStatus.plan.errors.length} 行。
                </p>
              </div>
              <button
                className="text-sm text-[var(--muted-foreground)]"
                onClick={closeImportPreview}
                type="button"
              >
                关闭
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {importStatus.plan.conflicts.length > 0 ? (
                <div className="grid gap-3">
                  {importStatus.plan.conflicts.map((conflict) => (
                    <section
                      className="rounded-md border border-[var(--border)] p-3"
                      key={conflict.id}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold">
                            {conflict.row.areaName} / {conflict.row.locationName} /{" "}
                            {conflict.row.name}
                          </h3>
                          <div className="mt-2 grid gap-2 text-[13px] text-[var(--muted-foreground)] sm:grid-cols-2">
                            <div className="rounded-md bg-[var(--surface-muted)] p-2">
                              <p className="font-medium text-[var(--foreground)]">
                                当前
                              </p>
                              <p>备注：{conflict.existingItem.note || "空"}</p>
                              <p>
                                有效期：{conflict.existingItem.expireDate || "空"}
                              </p>
                            </div>
                            <div className="rounded-md bg-[var(--surface-muted)] p-2">
                              <p className="font-medium text-[var(--foreground)]">
                                Excel
                              </p>
                              <p>备注：{conflict.row.note || "空"}</p>
                              <p>有效期：{conflict.row.expireDate || "空"}</p>
                            </div>
                          </div>
                        </div>
                        <div className="grid min-w-[168px] gap-2">
                          {(["skip", "keep", "overwrite"] as const).map(
                            (resolution) => (
                              <label
                                className="flex items-center gap-2 text-sm"
                                key={resolution}
                              >
                                <input
                                  checked={
                                    (conflictResolutions[conflict.id] ?? "skip") ===
                                    resolution
                                  }
                                  onChange={() =>
                                    setConflictResolution(conflict.id, resolution)
                                  }
                                  type="radio"
                                />
                                {resolution === "skip"
                                  ? "跳过"
                                  : resolution === "keep"
                                    ? "都保留"
                                    : "覆盖"}
                              </label>
                            ),
                          )}
                        </div>
                      </div>
                    </section>
                  ))}
                </div>
              ) : null}

              {importStatus.plan.errors.length > 0 ? (
                <div className="mt-3 rounded-md border border-[#e6b8b3] bg-[#fff3f1] p-3 text-sm text-[var(--danger)]">
                  {importStatus.plan.errors.map((error) => (
                    <p key={`${error.row}:${error.message}`}>
                      第 {error.row} 行：{error.message}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 border-t border-[var(--border)] p-4">
              <button
                className="h-10 rounded-md border border-[var(--border)] px-4 text-sm font-medium"
                onClick={closeImportPreview}
                type="button"
              >
                取消
              </button>
              <button
                className="h-10 rounded-md bg-[var(--primary)] px-4 text-sm font-medium text-white disabled:opacity-60"
                disabled={isSaving}
                onClick={handleCommitImport}
                type="button"
              >
                确认导入
              </button>
            </div>
          </section>
        </div>
      ) : null}

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
              <h2 className="text-base font-semibold">
                {editingItemId ? "编辑物品" : "新增物品"}
              </h2>
              <button
                className="text-sm text-[var(--muted-foreground)]"
                onClick={() => {
                  setEditingItemId(null);
                  setMobileQuickPanel(null);
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
                关闭
              </button>
            </div>

            <form className="grid gap-3 p-4" data-testid="item-composer" onSubmit={handleMobileSaveItem}>
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
                  onClick={(event) => openDatePicker(event.currentTarget)}
                  onFocus={(event) => openDatePicker(event.currentTarget)}
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
                {editingItemId ? "保存修改" : "保存物品"}
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

      {editingAreaId ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
        >
          <section className="w-full max-w-md rounded-md border border-[var(--border)] bg-[var(--surface)] p-5 shadow-lg">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">编辑区域</h2>
              <button
                className="text-sm text-[var(--muted-foreground)]"
                onClick={cancelAreaEdit}
                type="button"
              >
                取消
              </button>
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
              <div className="mt-2 flex justify-end gap-2">
                <button
                  className="h-10 rounded-md border border-[var(--border)] px-4 text-sm font-medium"
                  onClick={cancelAreaEdit}
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

      {showFamilySettings && state.status === "ready" ? (
        <FamilySettings
          householdId={state.summary.householdId}
          householdName={state.summary.householdName}
          isOwner={
            households.find(
              (household) => household.id === state.summary.householdId,
            )?.role === "owner"
          }
          client={
            selfHostedUser
              ? createFamilyHttpClient()
              : createSupabaseFamilySettingsClient(
                  createSupabaseBrowserClient(),
                )
          }
          onClose={() => setShowFamilySettings(false)}
        />
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

function sortDashboardItems(items: DashboardItem[], sortMode: ItemSortMode) {
  const expirationTime = (item: DashboardItem) =>
    item.expireDate ? new Date(`${item.expireDate}T00:00:00`).getTime() : Number.POSITIVE_INFINITY;

  return [...items].sort((left, right) => {
    if (sortMode === "name") {
      return left.name.localeCompare(right.name, "zh-CN");
    }

    const leftTime = expirationTime(left);
    const rightTime = expirationTime(right);
    const byExpiration =
      sortMode === "expireLate" ? rightTime - leftTime : leftTime - rightTime;

    return byExpiration || left.name.localeCompare(right.name, "zh-CN");
  });
}

function formatImportSummary(summary: InventoryImportSummary) {
  return `导入完成：新增 ${summary.createdItems} 个物品，覆盖 ${summary.overwrittenItems} 个，保留 ${summary.keptConflictItems} 个差异重复项，跳过 ${summary.skippedItems} 个，新增 ${summary.createdAreas} 个区域，${summary.createdLocations} 个位置，失败 ${summary.errors.length} 行。`;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center p-4">
      <div className="max-w-sm text-center">
        <h3 className="text-base font-semibold">暂无内容</h3>
        <p className="mt-1 text-sm leading-5 text-[var(--muted-foreground)]">
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
      ? "border-[#e6b8b3] bg-[#fff3f1] text-[var(--danger)]"
      : "border-[#ead2a8] bg-[#fff8ea] text-[var(--warning)]";

  return (
    <section className={`rounded-md border p-2.5 ${toneClass}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs font-medium">{items.length} 个</span>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-sm opacity-80">{emptyText}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.slice(0, 5).map((item) => (
            <li className="rounded-md bg-white/70 p-1.5" key={item.id}>
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium">{item.name}</p>
                <time className="shrink-0 text-xs font-medium">{item.expireDate}</time>
              </div>
              <p className="mt-0.5 truncate text-xs opacity-80">
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
