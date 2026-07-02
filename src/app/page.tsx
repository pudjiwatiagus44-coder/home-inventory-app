export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div>
            <p className="text-sm font-medium text-[var(--muted-foreground)]">
              Home Inventory
            </p>
            <h1 className="text-xl font-semibold">家庭物品</h1>
          </div>
          <a
            className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--primary)] px-4 text-sm font-medium text-white transition hover:bg-[var(--primary-hover)]"
            href="#"
          >
            登录
          </a>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">位置</h2>
            <button className="h-8 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--muted-foreground)]">
              新增
            </button>
          </div>
          <div className="rounded-md bg-[var(--surface-muted)] px-3 py-6 text-center text-sm text-[var(--muted-foreground)]">
            暂无位置
          </div>
        </aside>

        <section className="min-h-[420px] rounded-md border border-[var(--border)] bg-[var(--surface)]">
          <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">物品清单</h2>
              <p className="text-sm text-[var(--muted-foreground)]">
                0 个物品
              </p>
            </div>
            <div className="flex gap-2">
              <input
                className="h-10 w-full min-w-0 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)] sm:w-64"
                placeholder="搜索物品"
                type="search"
              />
              <button className="h-10 shrink-0 rounded-md bg-[var(--primary)] px-4 text-sm font-medium text-white transition hover:bg-[var(--primary-hover)]">
                新增物品
              </button>
            </div>
          </div>

          <div className="flex min-h-[300px] items-center justify-center p-6">
            <div className="max-w-sm text-center">
              <h3 className="text-base font-semibold">还没有物品</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                等待登录
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
