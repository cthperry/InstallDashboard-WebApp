"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { RequireAuth } from "@/features/auth/RequireAuth";
import { useAuth } from "@/features/auth/AuthProvider";
import { writeAuditLog } from "@/features/data/audit";
import { listenAppVariables, saveAppVariables } from "@/features/data/settings";
import { trackEvent } from "@/features/telemetry/track";
import { getErrorMessage } from "@/lib/errors";

import type { AppVariablesDoc, CustomerEntry, RegionKey } from "@/domain/types";
import { REGIONS } from "@/domain/constants";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";

type RegionFilter = "all" | RegionKey;
type CustomerSortMode = "nameAsc" | "nameDesc";

type CollapseState = Record<RegionKey, boolean>;

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeCustomers(raw: unknown[]): CustomerEntry[] {
  return raw
    .map((customer) =>
      typeof customer === "string"
        ? { name: customer.trim(), region: "north" as RegionKey }
        : (customer as CustomerEntry),
    )
    .filter((customer) => customer.name.length > 0);
}

function createEmptyCollapseState(): CollapseState {
  return {
    north: false,
    central: false,
    south: false,
  };
}

export default function AdminCustomerSitesPage() {
  const { isAdmin, user, appVersion } = useAuth();
  const canUse = useMemo(() => isAdmin, [isAdmin]);

  const [sourceDoc, setSourceDoc] = useState<AppVariablesDoc | null>(null);
  const [version, setVersion] = useState(`ui-${todayYmd()}`);
  const [customers, setCustomers] = useState<CustomerEntry[]>([]);
  const [newName, setNewName] = useState("");
  const [newRegion, setNewRegion] = useState<RegionKey>("north");
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState<RegionFilter>("all");
  const [sortMode, setSortMode] = useState<CustomerSortMode>("nameAsc");
  const [collapsed, setCollapsed] = useState<CollapseState>(createEmptyCollapseState());

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!canUse) return;
    const unsub = listenAppVariables((doc) => {
      setSourceDoc(doc);
      if (!doc) return;
      setVersion(doc.version || `ui-${todayYmd()}`);
      setCustomers(normalizeCustomers(doc.customers ?? []));
    });
    return () => unsub?.();
  }, [canUse]);

  const filteredCustomers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return customers.filter((customer) => {
      if (regionFilter !== "all" && customer.region !== regionFilter) return false;
      if (keyword && !customer.name.toLowerCase().includes(keyword)) return false;
      return true;
    });
  }, [customers, regionFilter, search]);

  const groupedCustomers = useMemo(() => {
    const groups: Record<RegionKey, CustomerEntry[]> = {
      north: [],
      central: [],
      south: [],
    };

    for (const customer of filteredCustomers) {
      groups[customer.region].push(customer);
    }

    const direction = sortMode === "nameAsc" ? 1 : -1;
    for (const region of Object.keys(groups) as RegionKey[]) {
      groups[region].sort((a, b) => a.name.localeCompare(b.name, "zh-Hant") * direction);
    }

    return groups;
  }, [filteredCustomers, sortMode]);

  const counts = useMemo(() => ({
    total: customers.length,
    filtered: filteredCustomers.length,
    north: customers.filter((customer) => customer.region === "north").length,
    central: customers.filter((customer) => customer.region === "central").length,
    south: customers.filter((customer) => customer.region === "south").length,
  }), [customers, filteredCustomers]);

  function addCustomer() {
    const name = newName.trim();
    if (!name) return;
    if (customers.some((customer) => customer.name === name)) {
      setErr(`「${name}」已存在`);
      return;
    }
    setCustomers((prev) => [...prev, { name, region: newRegion }]);
    setNewName("");
    setErr("");
  }

  function removeCustomer(name: string) {
    setCustomers((prev) => prev.filter((customer) => customer.name !== name));
  }

  function updateRegion(name: string, region: RegionKey) {
    setCustomers((prev) => prev.map((customer) => (customer.name === name ? { ...customer, region } : customer)));
  }

  async function apply() {
    setMsg("");
    setErr("");
    try {
      if (!canUse) throw new Error("你沒有 admin 權限");
      if (!user?.email) throw new Error("尚未登入");

      const engineers = Array.from(new Set((sourceDoc?.engineers ?? []).map((name) => String(name).trim()).filter(Boolean)));
      const next: AppVariablesDoc = {
        version: version.trim() || sourceDoc?.version || `ui-${todayYmd()}`,
        engineers,
        customers,
        updatedAt: Date.now(),
        updatedBy: user.email,
      };

      setBusy(true);
      await saveAppVariables(next);
      await writeAuditLog("更新客戶清單設定", "settings/appVariables", `customers=${customers.length}`, user.email);
      trackEvent("admin_update_customer_settings", { customers: customers.length, appVersion });
      setMsg(`已儲存（${customers.length} 筆客戶）`);
    } catch (saveError: unknown) {
      setErr(getErrorMessage(saveError, "儲存失敗"));
    } finally {
      setBusy(false);
    }
  }

  function toggleCollapse(region: RegionKey) {
    setCollapsed((prev) => ({ ...prev, [region]: !prev[region] }));
  }

  return (
    <RequireAuth>
      <main className="container py-6" style={{ maxWidth: 1080 }}>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">管理：客戶清單設定</CardTitle>
              <div className="mt-1 text-xs text-muted-foreground">
                主資料維護模式：依區域集中、可搜尋、可收合（版本：{appVersion}）
              </div>
            </div>
            <Button variant="secondary" asChild>
              <Link href="/dashboard/equipment">回設備頁</Link>
            </Button>
          </CardHeader>

          <CardContent className="space-y-4">
            {!canUse ? (
              <Alert variant="destructive">
                <AlertDescription>你不是 admin。請由管理者設定 users/{'{uid}'}.role = admin。</AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-3 md:grid-cols-5">
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
                <div className="text-xs text-muted-foreground">總客戶數</div>
                <div className="mt-1 text-2xl font-extrabold">{counts.total}</div>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
                <div className="text-xs text-muted-foreground">目前篩選</div>
                <div className="mt-1 text-2xl font-extrabold">{counts.filtered}</div>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
                <div className="text-xs text-muted-foreground">北區</div>
                <div className="mt-1 text-2xl font-extrabold">{counts.north}</div>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
                <div className="text-xs text-muted-foreground">中區</div>
                <div className="mt-1 text-2xl font-extrabold">{counts.central}</div>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
                <div className="text-xs text-muted-foreground">南區</div>
                <div className="mt-1 text-2xl font-extrabold">{counts.south}</div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[360px,minmax(0,1fr)]">
              <Card className="py-0">
                <CardHeader className="border-b pb-3">
                  <CardTitle className="text-base">基本設定 / 新增客戶</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-4">
                  <div className="space-y-1">
                    <div className="label">版本號</div>
                    <Input value={version} onChange={(event) => setVersion(event.target.value)} placeholder="例如：ui-2026-03-29" />
                  </div>

                  <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    客戶名稱需與 Excel「訂單來源公司名稱」完全一致，智慧匯入才會自動命中區域。
                  </div>

                  <div className="space-y-1">
                    <div className="label">新增客戶名稱</div>
                    <Input
                      value={newName}
                      onChange={(event) => {
                        setNewName(event.target.value);
                        setErr("");
                      }}
                      onKeyDown={(event) => event.key === "Enter" && addCustomer()}
                      placeholder="輸入客戶名稱…"
                      disabled={!canUse}
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="label">所屬區域</div>
                    <select value={newRegion} onChange={(event) => setNewRegion(event.target.value as RegionKey)} disabled={!canUse}>
                      {(Object.entries(REGIONS) as [RegionKey, { label: string }][]).map(([key, meta]) => (
                        <option key={key} value={key}>{meta.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={addCustomer} disabled={!canUse || !newName.trim()} className="flex-1">新增客戶</Button>
                    <Button variant="secondary" onClick={apply} disabled={!canUse || busy} className="flex-1">
                      {busy ? "儲存中…" : "儲存到 Firebase"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="py-0">
                <CardHeader className="border-b pb-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <CardTitle className="text-base">客戶映射清單</CardTitle>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr),140px,140px] lg:min-w-[560px]">
                      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜尋客戶名稱…" />
                      <select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value as RegionFilter)}>
                        <option value="all">全部區域</option>
                        {(Object.entries(REGIONS) as [RegionKey, { label: string }][]).map(([key, meta]) => (
                          <option key={key} value={key}>{meta.label}</option>
                        ))}
                      </select>
                      <select value={sortMode} onChange={(event) => setSortMode(event.target.value as CustomerSortMode)}>
                        <option value="nameAsc">名稱 A→Z</option>
                        <option value="nameDesc">名稱 Z→A</option>
                      </select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-4">
                  {(Object.entries(REGIONS) as [RegionKey, { label: string; color: string }][]).map(([region, meta]) => {
                    const rows = groupedCustomers[region];
                    const hidden = collapsed[region];
                    return (
                      <section key={region} className="rounded-lg border border-border">
                        <button
                          type="button"
                          onClick={() => toggleCollapse(region)}
                          style={{
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "12px 14px",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ width: 10, height: 10, borderRadius: 999, background: meta.color, display: "inline-block" }} />
                            <strong>{meta.label}</strong>
                            <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{rows.length} 筆</span>
                          </div>
                          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{hidden ? "展開" : "收合"}</span>
                        </button>

                        {!hidden ? (
                          <div style={{ borderTop: "1px solid var(--border)" }}>
                            {rows.length === 0 ? (
                              <div style={{ padding: "14px", color: "var(--muted-foreground)", fontSize: 13 }}>此區目前沒有客戶</div>
                            ) : (
                              rows.map((customer) => (
                                <div
                                  key={customer.name}
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "minmax(0,1fr) 120px 84px",
                                    gap: 10,
                                    alignItems: "center",
                                    padding: "10px 14px",
                                    borderTop: "1px solid color-mix(in srgb, var(--border) 70%, transparent)",
                                  }}
                                >
                                  <div style={{ minWidth: 0, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={customer.name}>
                                    {customer.name}
                                  </div>
                                  <select value={customer.region} onChange={(event) => updateRegion(customer.name, event.target.value as RegionKey)} disabled={!canUse}>
                                    {(Object.entries(REGIONS) as [RegionKey, { label: string }][]).map(([key, regionMeta]) => (
                                      <option key={key} value={key}>{regionMeta.label}</option>
                                    ))}
                                  </select>
                                  <Button variant="outline" onClick={() => removeCustomer(customer.name)} disabled={!canUse}>刪除</Button>
                                </div>
                              ))
                            )}
                          </div>
                        ) : null}
                      </section>
                    );
                  })}
                </CardContent>
              </Card>
            </div>

            {err ? <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert> : null}
            {msg ? <Alert><AlertDescription>{msg}</AlertDescription></Alert> : null}
          </CardContent>
        </Card>
      </main>
    </RequireAuth>
  );
}
