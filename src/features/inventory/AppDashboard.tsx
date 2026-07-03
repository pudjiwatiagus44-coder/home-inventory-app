"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  AreaRow,
  buildDashboardSummary,
  createDashboardHousehold,
  DashboardSummary,
  HouseholdRow,
  isMissingAuthSessionError,
  ItemRow,
} from "./dashboard-data";
import { getOrCreateDefaultHouseholdId } from "./household-bootstrap";

type DashboardState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string }
  | { status: "ready"; summary: DashboardSummary };

export function AppDashboard() {
  const router = useRouter();
  const [state, setState] = useState<DashboardState>({ status: "loading" });

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      try {
        const supabase = createSupabaseBrowserClient();
        const userResult = await supabase.auth.getUser();

        if (userResult.error) {
          if (isMissingAuthSessionError(userResult.error)) {
            if (isMounted) {
              setState({ status: "unauthenticated" });
            }
            return;
          }

          throw new Error(userResult.error.message);
        }

        if (!userResult.data.user) {
          if (isMounted) {
            setState({ status: "unauthenticated" });
          }
          return;
        }

        const householdId = await getOrCreateDefaultHouseholdId(
          supabase,
          userResult.data.user,
        );

        const [householdResult, areasResult, itemsResult] = await Promise.all([
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
            .from("items")
            .select("id,name,note,expire_date")
            .eq("household_id", householdId)
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

        if (householdResult.error) {
          throw new Error(householdResult.error.message);
        }
        if (areasResult.error) {
          throw new Error(areasResult.error.message);
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
          items: (itemsResult.data ?? []) as ItemRow[],
        });

        if (isMounted) {
          setState({ status: "ready", summary });
        }
      } catch (error) {
        if (isMounted) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "加载失败",
          });
        }
      }
    }

    void loadDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
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
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
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

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="mb-4 text-sm font-semibold">概览</h2>
          <div className="grid gap-3">
            <Metric label="区域" value={state.summary.areaCount} />
            <Metric label="物品" value={state.summary.itemCount} />
          </div>
        </aside>

        <section className="min-h-[420px] rounded-md border border-[var(--border)] bg-[var(--surface)]">
          <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">物品清单</h2>
              <p className="text-sm text-[var(--muted-foreground)]">
                {state.summary.itemCount} 个物品
              </p>
            </div>
            <button
              className="h-10 rounded-md bg-[var(--primary)] px-4 text-sm font-medium text-white opacity-70"
              disabled
              type="button"
            >
              新增物品
            </button>
          </div>

          {state.summary.isEmpty ? (
            <div className="flex min-h-[300px] items-center justify-center p-6">
              <div className="max-w-sm text-center">
                <h3 className="text-base font-semibold">还没有物品</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                  家庭空间已经准备好。下一步会接入新增物品表单。
                </p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {state.summary.recentItems.map((item) => (
                <li className="p-4" key={item.id}>
                  <p className="font-medium">{item.name}</p>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    {item.note || "无备注"}
                    {item.expireDate ? ` · 到期 ${item.expireDate}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
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
