"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { RequireAuth } from "@/features/auth/RequireAuth";
import { useAuth } from "@/features/auth/AuthProvider";

function NavLink({ href, label, active, tone }: { href: string; label: string; active: boolean; tone?: "live" }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${active ? "tab tabActive" : "tab"}${tone === "live" ? " tabLive" : ""}`}
    >
      {label}
    </Link>
  );
}

function LiveClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    function tick() {
      const now = new Date();
      const parts = new Intl.DateTimeFormat("zh-TW", {
        timeZone: "Asia/Taipei",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false,
      }).formatToParts(now);
      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
      setTime(`${get("hour")}:${get("minute")}:${get("second")}`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="warClock" title="Asia/Taipei">
      <span className="warClockTime">{time}</span> TST
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profile, isAdmin, appVersion, signOutNow } = useAuth();
  const isWarRoom = pathname?.startsWith("/dashboard/warroom") ?? false;

  return (
    <RequireAuth>
      <div className="topbar">
        <div className="topbarInner">
          <div className="topbarBrand">
            <div className="appMark">IO</div>
            <div>
              <div className="topbarTitle">Install Ops Flight Deck</div>
              <div className="topbarSub">裝機、設備台帳與產能風險指揮中心</div>
            </div>
          </div>

          <div className="topbarActions">
            <div className="navStatusPill">
              <span className="navStatusDot" aria-hidden />
              {isWarRoom ? "Warroom live" : "Operational"}
            </div>
            {isWarRoom && <LiveClock />}
            <div className="userChip">
              <div className="userChipEmail">{profile?.email ?? "未登入"}</div>
              <div className="userChipMeta">v{appVersion}</div>
            </div>
            {isAdmin ? (
              <details className="adminMenu">
                <summary className="btn btnGhost adminTrigger">管理</summary>
                <div className="adminMenuPanel">
                  <Link className="adminMenuItem" href="/admin/machine-models">機型設定</Link>
                  <Link className="adminMenuItem" href="/admin/customer-sites">客戶清單設定</Link>
                  <Link className="adminMenuItem" href="/admin/users">使用者權限</Link>
                </div>
              </details>
            ) : null}
            <button className="btn btnGhost" onClick={() => signOutNow()}>登出</button>
          </div>
        </div>

        <div className="tabsWrap">
          <div className="tabs">
            <NavLink href="/dashboard/warroom"   label="戰情室"     active={isWarRoom} tone="live" />
            <NavLink href="/dashboard/install"   label="裝機任務"   active={pathname?.startsWith("/dashboard/install")  ?? false} />
            <NavLink href="/dashboard/equipment" label="設備台帳"   active={pathname?.startsWith("/dashboard/equipment") ?? false} />
            <NavLink href="/dashboard/insights"  label="洞察紀錄"   active={pathname?.startsWith("/dashboard/insights") ?? false} />
          </div>
        </div>
      </div>

      {children}
    </RequireAuth>
  );
}
