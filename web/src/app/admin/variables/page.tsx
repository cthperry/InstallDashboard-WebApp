"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { useAuth } from "@/features/auth/AuthProvider";
import { appVariablesDocSchema } from "@/domain/schemas";
import { saveAppVariables } from "@/features/data/settings";
import { writeAuditLog } from "@/features/data/audit";
import { trackEvent } from "@/features/telemetry/track";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function AdminVariablesPage() {
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
      const parsed = appVariablesDocSchema.safeParse(parsedJson);
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message || "設定檔格式錯誤");
      }

      const engineers = (parsed.data.engineers ?? []).map((s) => String(s).trim()).filter(Boolean);
      const customers = (parsed.data.customers ?? []).map((s) => String(s).trim()).filter(Boolean);

      const engSet = Array.from(new Set(engineers));
      const custSet = Array.from(new Set(customers));

      await saveAppVariables({
        version: parsed.data.version,
        engineers: engSet,
        customers: custSet,
        updatedAt: Date.now(),
        updatedBy: user.email,
      });

      await writeAuditLog(
        "更新變數設定",
        "settings/appVariables",
        `套用版本 ${parsed.data.version}（工程師 ${engSet.length}、客戶 ${custSet.length}）`,
        user.email
      );

      trackEvent("admin_update_app_variables", {
        version: parsed.data.version,
        engineers: engSet.length,
        customers: custSet.length,
        appVersion,
      });

      setMsg(`已套用版本 ${parsed.data.version}（工程師 ${engSet.length}、客戶 ${custSet.length}）`);
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
              <CardTitle className="text-lg">管理：變數設定檔（工程師 / 客戶）</CardTitle>
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
                <li>系統會做 schema 驗證、去空白、去重。</li>
                <li>寫入位置：Firestore settings/appVariables</li>
                <li>此設定會影響：新增/編輯表單的建議選項（仍允許手動輸入）。</li>
              </ul>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">設定檔 JSON</div>
              <Textarea
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                rows={14}
                placeholder='例如：{ "version": "2026-02-28", "engineers": ["Stone"], "customers": ["TSMC"] }'
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
