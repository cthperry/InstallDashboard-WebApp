"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { useAuth } from "@/features/auth/AuthProvider";
import { machineModelsDocSchema } from "@/domain/schemas";
import { saveMachineModels } from "@/features/data/settings";
import { writeAuditLog } from "@/features/data/audit";
import { trackEvent } from "@/features/telemetry/track";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function AdminMachineModelsPage() {
  const { isAdmin, user, appVersion } = useAuth();
  const [raw, setRaw] = useState<string>("");
  const [msg, setMsg] = useState<string>("");
  const [err, setErr] = useState<string>("");

  const canUse = useMemo(() => isAdmin, [isAdmin]);

  const apply = async () => {
    setMsg("");
    setErr("");
    try {
      if (!canUse) throw new Error("你沒有 admin 權限");
      if (!user?.email) throw new Error("尚未登入");

      const parsedJson = JSON.parse(raw);
      const parsed = machineModelsDocSchema.safeParse(parsedJson);
      if (!parsed.success)
        throw new Error(parsed.error.issues[0]?.message || "設定檔格式錯誤");

      const codes = parsed.data.models.map((m) => m.code);
      const dup = codes.find((c, i) => codes.indexOf(c) !== i);
      if (dup) throw new Error(`models.code 不可重複：${dup}`);

      await saveMachineModels({
        version: parsed.data.version,
        models: parsed.data.models,
        updatedAt: Date.now(),
        updatedBy: user.email,
      });

      await writeAuditLog(
        "更新機型設定",
        "settings/machineModels",
        `套用版本 ${parsed.data.version}（共 ${parsed.data.models.length} 筆）`,
        user.email
      );
      trackEvent("admin_import_machine_models", {
        version: parsed.data.version,
        count: parsed.data.models.length,
        appVersion,
      });

      setMsg(`已套用版本 ${parsed.data.version}（共 ${parsed.data.models.length} 筆）`);
    } catch (e: any) {
      setErr(e?.message || "套用失敗");
    }
  };

  return (
    <RequireAuth>
      <main className="container py-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">管理：機型設定檔</CardTitle>
              <div className="text-xs text-muted-foreground mt-1">
                僅 admin 可套用（版本：{appVersion}）
              </div>
            </div>
            <Button variant="secondary" asChild>
              <Link href="/dashboard">回 Dashboard</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {!canUse ? (
              <Alert variant="destructive">
                <AlertDescription>
                  你不是 admin。請由管理者在 Firestore 的 users/&#123;uid&#125; 設定 role=admin。
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="text-sm text-muted-foreground leading-6">
              <ul className="list-disc pl-5 space-y-1">
                <li>貼上 JSON 後按「套用」。</li>
                <li>系統會做 schema 驗證 + code 去重。</li>
                <li>寫入位置：Firestore settings/machineModels</li>
              </ul>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">設定檔 JSON</div>
              <Textarea
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                rows={14}
                placeholder='例如：{ "version": "2026-02-28", "models": [ ... ] }'
              />
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

            <div className="flex justify-end">
              <Button onClick={apply} disabled={!canUse}>
                套用
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </RequireAuth>
  );
}
