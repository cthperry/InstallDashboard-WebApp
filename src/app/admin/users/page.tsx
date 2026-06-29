"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { RequireAuth } from "@/features/auth/RequireAuth";
import { useAuth } from "@/features/auth/AuthProvider";
import { writeAuditLog } from "@/features/data/audit";
import { trackEvent } from "@/features/telemetry/track";
import { deleteUserByUid, listenUsers, upsertUserRoleByUid, type ManagedUser } from "@/features/data/users";
import { isPremtekEmail } from "@/domain/accessPolicy";
import { DEFAULT_USER_ROLE, USER_ROLES, isUserRole, type UserRole } from "@/domain/userRoles";
import { getErrorMessage } from "@/lib/errors";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";

type RoleFilter = "all" | UserRole;

export default function AdminUsersPage() {
  const { isAdmin, user, appVersion } = useAuth();
  const canUse = useMemo(() => isAdmin, [isAdmin]);

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roleDraft, setRoleDraft] = useState<Record<string, UserRole>>({});
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  const [uid, setUid] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>(DEFAULT_USER_ROLE);

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [listErr, setListErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canUse) return;
    const unsub = listenUsers(
      (rows) => {
        setUsers(rows);
        setRoleDraft((prev) => {
          const next = { ...prev };
          for (const r of rows) {
            if (!next[r.id]) next[r.id] = r.role;
          }
          return next;
        });
      },
      (e) => {
        const raw = getErrorMessage(e, "無法讀取 users 清單");
        setListErr(raw || "無法讀取 users 清單");
      },
    );

    return () => unsub?.();
  }, [canUse]);

  const filteredUsers = useMemo(() => {
    const keyword = userSearch.trim().toLowerCase();
    return users.filter((row) => {
      const draftRole = roleDraft[row.id] || row.role;
      if (roleFilter !== "all" && draftRole !== roleFilter) return false;
      if (!keyword) return true;
      return row.email.toLowerCase().includes(keyword) || row.id.toLowerCase().includes(keyword);
    });
  }, [users, roleDraft, roleFilter, userSearch]);

  const userCounts = useMemo(() => ({
    total: users.length,
    filtered: filteredUsers.length,
    admin: users.filter((row) => (roleDraft[row.id] || row.role) === "admin").length,
    engineer: users.filter((row) => (roleDraft[row.id] || row.role) === "engineer").length,
  }), [users, filteredUsers, roleDraft]);
  const hasUserFilters = userSearch.trim().length > 0 || roleFilter !== "all";

  function clearUserFilters() {
    setUserSearch("");
    setRoleFilter("all");
  }

  const saveByUid = async () => {
    setMsg("");
    setErr("");
    try {
      if (!canUse) throw new Error("你沒有 admin 權限");
      if (!user?.email) throw new Error("尚未登入");

      const cleanedUid = uid.trim();
      const cleanedEmail = email.trim();
      if (!cleanedUid) throw new Error("請輸入 UID");
      if (!cleanedEmail) throw new Error("請輸入 Email");
      if (!isPremtekEmail(cleanedEmail)) throw new Error("Email 必須為 @premtek.com.tw");

      setBusy(true);
      await upsertUserRoleByUid({
        uid: cleanedUid,
        email: cleanedEmail,
        role,
        updatedBy: user.email,
      });

      await writeAuditLog(
        "更新使用者權限",
        `users/${cleanedUid}`,
        `email=${cleanedEmail} role=${role}`,
        user.email,
      );
      trackEvent("admin_upsert_user_role", {
        targetUid: cleanedUid,
        role,
        appVersion,
      });

      setMsg(`已儲存 users/${cleanedUid}（${role}）`);
      setUid("");
      setEmail("");
      setRole(DEFAULT_USER_ROLE);
    } catch (e: unknown) {
      setErr(getErrorMessage(e, "儲存失敗"));
    } finally {
      setBusy(false);
    }
  };

  const saveRowRole = async (row: ManagedUser) => {
    setMsg("");
    setErr("");
    try {
      if (!canUse) throw new Error("你沒有 admin 權限");
      if (!user?.email) throw new Error("尚未登入");

      const nextRole = roleDraft[row.id] || row.role;
      setBusy(true);
      await upsertUserRoleByUid({
        uid: row.id,
        email: row.email,
        role: nextRole,
        updatedBy: user.email,
      });

      await writeAuditLog(
        "更新使用者權限",
        `users/${row.id}`,
        `email=${row.email} role=${nextRole}`,
        user.email,
      );

      trackEvent("admin_update_user_role", {
        targetUid: row.id,
        role: nextRole,
        appVersion,
      });

      setMsg(`已更新 ${row.email} → ${nextRole}`);
    } catch (e: unknown) {
      setErr(getErrorMessage(e, "更新失敗"));
    } finally {
      setBusy(false);
    }
  };

  const deleteRow = async (row: ManagedUser) => {
    setMsg("");
    setErr("");
    try {
      if (!canUse) throw new Error("你沒有 admin 權限");
      if (!user?.email) throw new Error("尚未登入");
      if (row.id === user.uid) throw new Error("不可刪除目前登入中的帳號權限");

      const ok = window.confirm(`確定刪除 users/${row.id}？\n\n${row.email}\n\n此操作會刪除 Firestore 權限文件。`);
      if (!ok) return;

      setBusy(true);
      await deleteUserByUid(row.id);

      await writeAuditLog(
        "刪除使用者權限",
        `users/${row.id}`,
        `email=${row.email}`,
        user.email,
      );

      trackEvent("admin_delete_user_role", {
        targetUid: row.id,
        appVersion,
      });

      setRoleDraft((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      setMsg(`已刪除 users/${row.id}`);
    } catch (e: unknown) {
      setErr(getErrorMessage(e, "刪除失敗"));
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
              <CardTitle className="text-lg">管理：使用者權限</CardTitle>
              <div className="mt-1 text-xs text-muted-foreground">僅 admin 可修改（版本：{appVersion}）</div>
            </div>
            <Button variant="secondary" asChild>
              <Link href="/dashboard/install">回 Dashboard</Link>
            </Button>
          </CardHeader>

          <CardContent className="space-y-4">
            {!canUse ? (
              <Alert variant="destructive">
                <AlertDescription>你不是 admin。請由管理者設定 users/&#123;uid&#125;.role = admin。</AlertDescription>
              </Alert>
            ) : null}

            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              此頁負責管理 Firestore `users/{'{uid}'}` 的 role。若要「新增可登入帳號」，仍需在 Firebase Authentication 建立帳號（或讓使用者先登入一次）。
            </div>
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              「刪除」只會刪除 Firestore `users/{'{uid}'}` 權限資料，不會刪除 Firebase Authentication 帳號本身。
            </div>

            <Card className="py-0">
              <CardHeader className="border-b pb-3">
                <CardTitle className="text-base">新增/更新（手動輸入 UID）</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 pt-4 md:grid-cols-4">
                <div className="space-y-1 md:col-span-2">
                  <div className="label">UID</div>
                  <Input value={uid} onChange={(e) => setUid(e.target.value)} placeholder="輸入 Firebase Auth UID" />
                </div>
                <div className="space-y-1">
                  <div className="label">Email</div>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@premtek.com.tw" />
                </div>
                <div className="space-y-1">
                  <div className="label">角色</div>
                  <select
                    value={role}
                    onChange={(e) => {
                      const nextRole = e.target.value;
                      if (isUserRole(nextRole)) setRole(nextRole);
                    }}
                  >
                    {USER_ROLES.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-4 flex justify-end">
                  <Button onClick={saveByUid} disabled={!canUse || busy}>儲存到 Firebase</Button>
                </div>
              </CardContent>
            </Card>

            <Card className="py-0">
              <CardHeader className="border-b pb-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <CardTitle className="text-base">既有使用者清單（勾選後儲存）</CardTitle>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr),140px] lg:min-w-[460px]">
                    <Input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="搜尋 Email 或 UID…" />
                    <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}>
                      <option value="all">全部角色</option>
                      {USER_ROLES.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                {listErr ? (
                  <Alert variant="destructive">
                    <AlertDescription>
                      讀取 users 清單失敗：{listErr}
                      <br />
                      可能是 Firestore Rules 尚未允許 admin 讀取全體 users。
                    </AlertDescription>
                  </Alert>
                ) : null}

                <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    顯示 {userCounts.filtered} / {userCounts.total} 位，admin {userCounts.admin}、engineer {userCounts.engineer}
                  </span>
                  {hasUserFilters ? (
                    <Button type="button" variant="secondary" size="sm" onClick={clearUserFilters}>
                      清除篩選
                    </Button>
                  ) : null}
                </div>

                {users.length > 0 && filteredUsers.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center">
                    <div className="text-sm font-bold">沒有符合條件的使用者</div>
                    <div className="mt-1 text-xs text-muted-foreground">請調整搜尋字或角色篩選，權限資料仍保留在清單中。</div>
                    <Button type="button" variant="secondary" size="sm" onClick={clearUserFilters} className="mt-3">
                      顯示全部使用者
                    </Button>
                  </div>
                ) : null}

                <div className="tableWrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>UID</th>
                        <th>Email</th>
                        <th>admin</th>
                        <th>更新</th>
                        <th style={{ width: 120 }}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((r) => {
                        const checked = (roleDraft[r.id] || r.role) === "admin";
                        return (
                          <tr key={r.id}>
                            <td className="mono" style={{ fontSize: 12 }}>{r.id}</td>
                            <td>{r.email}</td>
                            <td>
                              <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    setRoleDraft((prev) => ({
                                      ...prev,
                                      [r.id]: e.target.checked ? "admin" : DEFAULT_USER_ROLE,
                                    }));
                                  }}
                                />
                                {checked ? "admin" : "engineer"}
                              </label>
                            </td>
                            <td style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                              {r.updatedAt ? new Date(r.updatedAt).toLocaleString() : "-"}
                            </td>
                            <td>
                              <div className="flex gap-2">
                                <Button size="sm" onClick={() => saveRowRole(r)} disabled={!canUse || busy}>儲存</Button>
                                <Button size="sm" variant="destructive" onClick={() => deleteRow(r)} disabled={!canUse || busy || r.id === user?.uid}>
                                  刪除
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {users.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: "center", padding: 18, color: "var(--muted-foreground)" }}>
                            尚無可顯示資料
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

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
