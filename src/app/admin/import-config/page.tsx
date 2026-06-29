"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { RequireAuth } from "@/features/auth/RequireAuth";
import { useAuth } from "@/features/auth/AuthProvider";
import { writeAuditLog } from "@/features/data/audit";
import { listenAppVariables, listenImportConfig, listenMachineModels, saveImportConfig } from "@/features/data/settings";
import { trackEvent } from "@/features/telemetry/track";
import { DEFAULT_IMPORT_COLUMN_ALIASES } from "@/domain/importRules";
import { mergeMachineModels } from "@/domain/machineModels";
import { DEFAULT_MACHINE_MODELS } from "@/domain/constants";
import type { CustomerAliasEntry, ImportColumnAlias, ImportConfigDoc, ImportFieldKey, MachineModel, MachineModelAliasEntry } from "@/domain/types";
import { getErrorMessage } from "@/lib/errors";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";

type EditableAlias = { alias: string; target: string };
type AliasStats = { complete: number; partial: number; blank: number };

const FIELD_LABELS: Record<ImportFieldKey, string> = {
  serialNo: "機台序號",
  modelCode: "機型",
  customer: "客戶",
  estArrival: "預計出貨日",
  estComplete: "預計安裝日",
  actArrival: "實際安裝日期",
  actComplete: "驗收完成日期",
  engineer: "工程師",
};

const FIELD_ORDER = Object.keys(FIELD_LABELS) as ImportFieldKey[];

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function splitAliasText(value: string): string[] {
  return Array.from(new Set(value.split(/[\n,，]/).map((item) => item.trim()).filter(Boolean)));
}

function joinHeaders(headers: string[]): string {
  return headers.join("\n");
}

function buildInitialColumnText(config: ImportConfigDoc | null): Record<ImportFieldKey, string> {
  const out = Object.fromEntries(FIELD_ORDER.map((field) => [field, joinHeaders(DEFAULT_IMPORT_COLUMN_ALIASES[field])])) as Record<ImportFieldKey, string>;
  for (const entry of config?.columnAliases ?? []) {
    out[entry.field] = joinHeaders(Array.from(new Set([...(DEFAULT_IMPORT_COLUMN_ALIASES[entry.field] ?? []), ...(entry.headers ?? [])])));
  }
  return out;
}

function toEditableAliases(rows: CustomerAliasEntry[] | MachineModelAliasEntry[]): EditableAlias[] {
  return rows.map((row) => ({
    alias: row.alias,
    target: "customer" in row ? row.customer : row.modelCode,
  }));
}

function emptyAlias(): EditableAlias {
  return { alias: "", target: "" };
}

function summarizeAliases(rows: EditableAlias[]): AliasStats {
  return rows.reduce<AliasStats>((stats, row) => {
    const hasAlias = row.alias.trim().length > 0;
    const hasTarget = row.target.trim().length > 0;
    if (hasAlias && hasTarget) return { ...stats, complete: stats.complete + 1 };
    if (hasAlias || hasTarget) return { ...stats, partial: stats.partial + 1 };
    return { ...stats, blank: stats.blank + 1 };
  }, { complete: 0, partial: 0, blank: 0 });
}

export default function AdminImportConfigPage() {
  const { isAdmin, user, appVersion } = useAuth();
  const canUse = useMemo(() => isAdmin, [isAdmin]);
  const [version, setVersion] = useState(`import-${todayYmd()}`);
  const [columnText, setColumnText] = useState<Record<ImportFieldKey, string>>(() => buildInitialColumnText(null));
  const [customerAliases, setCustomerAliases] = useState<EditableAlias[]>([emptyAlias()]);
  const [modelAliases, setModelAliases] = useState<EditableAlias[]>([emptyAlias()]);
  const [customers, setCustomers] = useState<string[]>([]);
  const [models, setModels] = useState<MachineModel[]>([...DEFAULT_MACHINE_MODELS]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const customerAliasStats = useMemo(() => summarizeAliases(customerAliases), [customerAliases]);
  const modelAliasStats = useMemo(() => summarizeAliases(modelAliases), [modelAliases]);

  useEffect(() => {
    if (!canUse) return;
    const unsubConfig = listenImportConfig((doc) => {
      if (!doc) return;
      setVersion(doc.version || `import-${todayYmd()}`);
      setColumnText(buildInitialColumnText(doc));
      setCustomerAliases(toEditableAliases(doc.customerAliases ?? []).length ? toEditableAliases(doc.customerAliases ?? []) : [emptyAlias()]);
      setModelAliases(toEditableAliases(doc.machineModelAliases ?? []).length ? toEditableAliases(doc.machineModelAliases ?? []) : [emptyAlias()]);
    });
    const unsubVars = listenAppVariables((doc) => {
      const names = (doc?.customers ?? [])
        .map((row) => (typeof row === "string" ? row : row.name))
        .map((name) => String(name).trim())
        .filter(Boolean);
      setCustomers(Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, "zh-Hant")));
    });
    const unsubModels = listenMachineModels((doc) => {
      setModels(mergeMachineModels(doc?.models, DEFAULT_MACHINE_MODELS));
    });
    return () => {
      unsubConfig?.();
      unsubVars?.();
      unsubModels?.();
    };
  }, [canUse]);

  function updateCustomerAlias(index: number, patch: Partial<EditableAlias>) {
    setCustomerAliases((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function updateModelAlias(index: number, patch: Partial<EditableAlias>) {
    setModelAliases((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  async function apply() {
    setMsg("");
    setErr("");
    try {
      if (!canUse) throw new Error("你沒有 admin 權限");
      if (!user?.email) throw new Error("尚未登入");

      const columnAliases: ImportColumnAlias[] = FIELD_ORDER.map((field) => ({
        field,
        headers: splitAliasText(columnText[field]),
      }));
      const customerAliasRows: CustomerAliasEntry[] = customerAliases
        .map((row) => ({ alias: row.alias.trim(), customer: row.target.trim() }))
        .filter((row) => row.alias && row.customer);
      const modelAliasRows: MachineModelAliasEntry[] = modelAliases
        .map((row) => ({ alias: row.alias.trim(), modelCode: row.target.trim() }))
        .filter((row) => row.alias && row.modelCode);

      const next: ImportConfigDoc = {
        version: version.trim() || `import-${todayYmd()}`,
        columnAliases,
        customerAliases: customerAliasRows,
        machineModelAliases: modelAliasRows,
        updatedAt: Date.now(),
        updatedBy: user.email,
      };

      setBusy(true);
      await saveImportConfig(next);
      await writeAuditLog("更新匯入設定", "settings/importConfig", `columns=${columnAliases.length}, customerAliases=${customerAliasRows.length}, modelAliases=${modelAliasRows.length}`, user.email);
      trackEvent("admin_update_import_config", { columns: columnAliases.length, customerAliases: customerAliasRows.length, modelAliases: modelAliasRows.length, appVersion });
      setMsg("已儲存匯入 mapping / alias 設定");
    } catch (error: unknown) {
      setErr(getErrorMessage(error, "儲存失敗"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <RequireAuth>
      <main className="container py-6" style={{ maxWidth: 1120 }}>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">管理：智慧匯入設定</CardTitle>
              <div className="mt-1 text-xs text-muted-foreground">欄位 mapping、客戶 alias、機型 alias（版本：{appVersion}）</div>
            </div>
            <Button variant="secondary" asChild>
              <Link href="/dashboard/install?view=table">回任務流</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {!canUse ? (
              <Alert variant="destructive">
                <AlertDescription>你不是 admin。請由管理者設定 users/&#123;uid&#125;.role = admin。</AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <div className="space-y-1">
                <div className="label">設定版本</div>
                <Input value={version} onChange={(event) => setVersion(event.target.value)} placeholder="例如：import-2026-06-29" />
              </div>
              <Button onClick={apply} disabled={!canUse || busy}>{busy ? "儲存中..." : "儲存到 Firebase"}</Button>
            </div>

            <Card className="py-0">
              <CardHeader className="border-b pb-3">
                <CardTitle className="text-base">Excel 欄位 mapping</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 pt-4 md:grid-cols-2">
                {FIELD_ORDER.map((field) => (
                  <div key={field} className="space-y-1">
                    <div className="label">{FIELD_LABELS[field]}</div>
                    <textarea
                      value={columnText[field]}
                      onChange={(event) => setColumnText((prev) => ({ ...prev, [field]: event.target.value }))}
                      rows={4}
                      placeholder="每行一個 Excel 欄名 alias"
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="py-0">
                <CardHeader className="border-b pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">客戶 alias</CardTitle>
                    <Button variant="secondary" size="sm" onClick={() => setCustomerAliases((prev) => [emptyAlias(), ...prev])}>新增</Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-4">
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    將儲存 {customerAliasStats.complete} 筆；{customerAliasStats.partial > 0 ? `${customerAliasStats.partial} 筆未完成會被略過` : "空白列會自動略過"}
                  </div>
                  {customerAliases.map((row, index) => (
                    <div key={`${index}-${row.alias}`} className="grid gap-2 md:grid-cols-[minmax(0,1fr),minmax(0,1fr),auto]">
                      <Input value={row.alias} onChange={(event) => updateCustomerAlias(index, { alias: event.target.value })} placeholder="Excel 客戶別名" />
                      <input list="importCustomerTargets" value={row.target} onChange={(event) => updateCustomerAlias(index, { target: event.target.value })} placeholder="正式客戶名稱" />
                      <Button variant="outline" onClick={() => setCustomerAliases((prev) => prev.filter((_, rowIndex) => rowIndex !== index))} disabled={customerAliases.length <= 1}>刪除</Button>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="py-0">
                <CardHeader className="border-b pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">機型 alias</CardTitle>
                    <Button variant="secondary" size="sm" onClick={() => setModelAliases((prev) => [emptyAlias(), ...prev])}>新增</Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-4">
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    將儲存 {modelAliasStats.complete} 筆；{modelAliasStats.partial > 0 ? `${modelAliasStats.partial} 筆未完成會被略過` : "空白列會自動略過"}
                  </div>
                  {modelAliases.map((row, index) => (
                    <div key={`${index}-${row.alias}`} className="grid gap-2 md:grid-cols-[minmax(0,1fr),minmax(0,1fr),auto]">
                      <Input value={row.alias} onChange={(event) => updateModelAlias(index, { alias: event.target.value })} placeholder="Excel 機型別名" />
                      <select value={row.target} onChange={(event) => updateModelAlias(index, { target: event.target.value })}>
                        <option value="">選擇正式機型</option>
                        {models.map((model) => <option key={model.code} value={model.code}>{model.displayName}</option>)}
                      </select>
                      <Button variant="outline" onClick={() => setModelAliases((prev) => prev.filter((_, rowIndex) => rowIndex !== index))} disabled={modelAliases.length <= 1}>刪除</Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <datalist id="importCustomerTargets">
              {customers.map((name) => <option key={name} value={name} />)}
            </datalist>

            {err ? <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert> : null}
            {msg ? <Alert><AlertDescription>{msg}</AlertDescription></Alert> : null}
          </CardContent>
        </Card>
      </main>
    </RequireAuth>
  );
}
