"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { RequireAuth } from "@/features/auth/RequireAuth";
import { useAuth } from "@/features/auth/AuthProvider";
import { writeAuditLog } from "@/features/data/audit";
import { trackEvent } from "@/features/telemetry/track";
import { listenMachineModels, saveMachineModels } from "@/features/data/settings";

import { machineModelsDocSchema } from "@/domain/schemas";
import type { MachineModel } from "@/domain/types";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";

type EditableModel = {
  code: string;
  displayName: string;
};

function toEditable(m: MachineModel): EditableModel {
  return {
    code: m.code ?? "",
    displayName: m.displayName ?? "",
  };
}

function emptyModel(): EditableModel {
  return {
    code: "",
    displayName: "",
  };
}

export default function AdminMachineModelsPage() {
  const { isAdmin, user, appVersion } = useAuth();
  const canUse = useMemo(() => isAdmin, [isAdmin]);

  const [version, setVersion] = useState(`ui-${new Date().toISOString().slice(0, 10)}`);
  const [models, setModels] = useState<EditableModel[]>([emptyModel()]);

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsub = listenMachineModels((doc) => {
      if (!doc) return;
      setVersion(doc.version || `ui-${new Date().toISOString().slice(0, 10)}`);
      setModels(doc.models?.length ? doc.models.map(toEditable) : [emptyModel()]);
    });
    return () => unsub?.();
  }, []);

  const updateRow = (idx: number, patch: Partial<EditableModel>) => {
    setModels((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addRow = () => setModels((prev) => [emptyModel(), ...prev]);
  const removeRow = (idx: number) => setModels((prev) => prev.filter((_, i) => i !== idx));

  const apply = async () => {
    setMsg("");
    setErr("");
    try {
      if (!canUse) throw new Error("你沒有 admin 權限");
      if (!user?.email) throw new Error("尚未登入");

      const normalizedModels: MachineModel[] = models
        .map((r) => ({
          code: r.code.trim(),
          displayName: r.displayName.trim(),
        }))
        .filter((m) => m.code && m.displayName);

      const parsed = machineModelsDocSchema.safeParse({
        version: version.trim() || `ui-${new Date().toISOString().slice(0, 10)}`,
        models: normalizedModels,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "設定格式錯誤");

      const codes = parsed.data.models.map((m) => m.code);
      const dup = codes.find((c, i) => codes.indexOf(c) !== i);
      if (dup) throw new Error(`code 不可重複：${dup}`);

      setBusy(true);
      await saveMachineModels({
        version: parsed.data.version,
        models: parsed.data.models,
        updatedAt: Date.now(),
        updatedBy: user.email,
      });

      await writeAuditLog(
        "更新機型設定",
        "settings/machineModels",
        `UI 套用版本 ${parsed.data.version}（共 ${parsed.data.models.length} 筆）`,
        user.email,
      );

      trackEvent("admin_update_machine_models_ui", {
        version: parsed.data.version,
        count: parsed.data.models.length,
        appVersion,
      });

      setMsg(`已套用：${parsed.data.models.length} 筆機型`);
    } catch (e: any) {
      setErr(e?.message || "套用失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <RequireAuth>
      <main className="container py-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">管理：機型設定</CardTitle>
              <div className="mt-1 text-xs text-muted-foreground">直接輸入後儲存，同步 Firebase（版本：{appVersion}）</div>
            </div>
            <Button variant="secondary" asChild>
              <Link href="/dashboard/install">回 Dashboard</Link>
            </Button>
          </CardHeader>

          <CardContent className="space-y-4">
            {!canUse ? (
              <Alert variant="destructive">
                <AlertDescription>你不是 admin。請由管理者在 users/&#123;uid&#125; 設定 role=admin。</AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
              <div className="space-y-1">
                <div className="label">版本號</div>
                <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="例如：ui-2026-03-01" />
              </div>
              <Button variant="secondary" onClick={addRow} disabled={!canUse || busy}>新增機型列</Button>
              <Button onClick={apply} disabled={!canUse || busy}>儲存到 Firebase</Button>
            </div>

            <div className="space-y-3">
              {models.map((row, idx) => (
                <Card key={`${idx}-${row.code || "new"}`} className="py-0">
                  <CardHeader className="border-b pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">機型 #{idx + 1}</CardTitle>
                      <Button variant="destructive" size="sm" onClick={() => removeRow(idx)} disabled={models.length <= 1 || busy}>
                        刪除
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <div className="label">Code（唯一）</div>
                        <Input value={row.code} onChange={(e) => updateRow(idx, { code: e.target.value })} placeholder="例如：FlexTRAK-S" />
                      </div>
                      <div className="space-y-1">
                        <div className="label">顯示名稱</div>
                        <Input value={row.displayName} onChange={(e) => updateRow(idx, { displayName: e.target.value })} placeholder="例如：FlexTRAK-S" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {err ? (
              <Alert variant="destructive">
                <AlertDescription>{err}</AlertDescription>
              </Alert>
            ) : null}
            {msg ? (
              <Alert>
                <AlertDescription>{msg}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </RequireAuth>
  );
}
