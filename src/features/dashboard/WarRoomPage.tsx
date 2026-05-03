"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useAuth } from "@/features/auth/AuthProvider";
import { listenInstallations } from "@/features/data/installations";
import { listenEquipments } from "@/features/data/equipments";
import type { Equipment, Installation, PhaseKey, RegionKey } from "@/domain/types";
import { PHASES, PHASE_MAP, REGIONS } from "@/domain/constants";
import { formatUphValue, getLiveUtilization } from "@/domain/capacity";
import { getInstallationSerial } from "@/domain/installationDisplay";
import { normalizePersonKey, toDisplayShortName } from "@/domain/personDisplay";
import { getAppReleaseLabel } from "@/config/appVersion";
import { todayInTaipeiYmd } from "@/lib/utils";

type Tone = "critical" | "warning" | "info" | "good";

type QueueItem = {
  id: string;
  title: string;
  meta: string;
  value: string;
  tone: Tone;
  href: string;
  priority: number;
};

function todayYYYYMMDD() {
  return todayInTaipeiYmd();
}

function safeStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  return String(v);
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function parseYmd(ymd?: string): Date | null {
  const value = safeStr(ymd).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function daysBetween(aYmd: string, bYmd: string): number | null {
  const a = parseYmd(aYmd);
  const b = parseYmd(bYmd);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function isReleased(r: Installation) {
  return r.phase === "released";
}

function isOverdue(r: Installation, today: string) {
  const due = safeStr(r.estComplete);
  return Boolean(due && !isReleased(r) && due < today);
}

function daysSinceUpdated(ts?: number): number {
  if (!ts) return 999;
  return Math.max(0, Math.floor((Date.now() - ts) / 86400000));
}

function getInstallTitle(row: Installation) {
  return getInstallationSerial(row) || safeStr(row.modelCode) || safeStr(row.customer) || row.id;
}

function ControlMetric({
  label,
  value,
  unit,
  caption,
  tone,
}: {
  label: string;
  value: string | number;
  unit?: string;
  caption: string;
  tone: Tone;
}) {
  return (
    <div className={`f66Metric f66Metric-${tone}`}>
      <span>{label}</span>
      <strong>
        {value}
        {unit ? <small>{unit}</small> : null}
      </strong>
      <p>{caption}</p>
    </div>
  );
}

function ActionQueue({ items }: { items: QueueItem[] }) {
  return (
    <section className="f66Panel f66QueuePanel" aria-label="今日指揮隊列">
      <div className="f66PanelHead">
        <div>
          <span className="f66Eyebrow">DECISION QUEUE</span>
          <h2>今日必處理</h2>
        </div>
        <Link href="/dashboard/install" className="f66MiniLink">進入任務流</Link>
      </div>

      {items.length > 0 ? (
        <div className="f66QueueList">
          {items.map((item) => (
            <Link key={item.id} href={item.href} className={`f66QueueItem f66QueueItem-${item.tone}`}>
              <span className="f66QueueRail" />
              <span className="f66QueueCopy">
                <strong>{item.title}</strong>
                <small>{item.meta}</small>
              </span>
              <span className="f66QueueValue">{item.value}</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="f66EmptyState">目前沒有高優先待辦。先巡檢設備阻塞與本週到期項目。</div>
      )}
    </section>
  );
}

function PhaseRail({ phaseRows }: { phaseRows: Array<{ key: PhaseKey; label: string; color: string; count: number }> }) {
  const max = Math.max(...phaseRows.map((p) => p.count), 1);
  return (
    <section className="f66Panel">
      <div className="f66PanelHead">
        <div>
          <span className="f66Eyebrow">FLOW CONTROL</span>
          <h2>裝機階段瓶頸</h2>
        </div>
      </div>
      <div className="f66PhaseRail">
        {phaseRows.map((phase) => (
          <div key={phase.key} className="f66PhaseRow">
            <div className="f66PhaseName">
              <span style={{ background: phase.color }} />
              {phase.label}
            </div>
            <div className="f66PhaseTrack">
              <i style={{ width: `${clamp((phase.count / max) * 100, 0, 100)}%`, background: phase.color }} />
            </div>
            <b>{phase.count}</b>
          </div>
        ))}
      </div>
    </section>
  );
}

function RegionCommand({
  rows,
}: {
  rows: Array<{ key: RegionKey; label: string; color: string; installs: number; equipments: number; overdue: number; blocked: number; hot: number; score: number }>;
}) {
  return (
    <section className="f66Panel">
      <div className="f66PanelHead">
        <div>
          <span className="f66Eyebrow">REGIONAL COMMAND</span>
          <h2>區域健康圖</h2>
        </div>
      </div>
      <div className="f66RegionGrid">
        {rows.map((row) => (
          <div key={row.key} className="f66RegionCard" style={{ "--region-color": row.color } as CSSProperties}>
            <div className="f66RegionTop">
              <strong>{row.label}</strong>
              <span>{row.score}</span>
            </div>
            <div className="f66RegionMeter"><i style={{ width: `${row.score}%` }} /></div>
            <div className="f66RegionStats">
              <span><b>{row.installs}</b>裝機</span>
              <span><b>{row.equipments}</b>設備</span>
              <span><b>{row.overdue}</b>逾期</span>
              <span><b>{row.blocked}</b>阻塞</span>
              <span><b>{row.hot}</b>高負載</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RoleConsole({
  isAdmin,
  myOpen,
  myOverdue,
  adminGaps,
}: {
  isAdmin: boolean;
  myOpen: number;
  myOverdue: number;
  adminGaps: number;
}) {
  return (
    <section className="f66Panel f66RoleConsole">
      <div className="f66PanelHead">
        <div>
          <span className="f66Eyebrow">ROLE ROUTING</span>
          <h2>角色入口</h2>
        </div>
      </div>
      <div className="f66RoleGrid">
        <Link href="/dashboard/install" className="f66RoleCard">
          <span>ENGINEER</span>
          <strong>我的裝機任務</strong>
          <p>{myOpen} 件待推進，{myOverdue} 件逾期。</p>
        </Link>
        <Link href="/dashboard/equipment" className="f66RoleCard">
          <span>OWNER</span>
          <strong>設備阻塞與產能</strong>
          <p>處理 blocking owner、UPH 與 target UPH 缺口。</p>
        </Link>
        <Link href={isAdmin ? "/admin/users" : "/dashboard/system"} className="f66RoleCard">
          <span>ADMIN</span>
          <strong>{isAdmin ? "資料與權限治理" : "系統權限狀態"}</strong>
          <p>{isAdmin ? `${adminGaps} 項資料治理待確認。` : "目前非 admin，只顯示可操作任務。"}</p>
        </Link>
      </div>
    </section>
  );
}

function ProductCapacityBoard({ equipments }: { equipments: Equipment[] }) {
  const productRows = useMemo(() => {
    const productMap = new Map<string, { cap: number; machines: number }>();
    for (const eq of equipments) {
      for (const product of eq.products ?? []) {
        const name = safeStr(product.name).trim();
        if (!name) continue;
        const current = productMap.get(name) ?? { cap: 0, machines: 0 };
        current.cap += Number(product.dailyCap) || 0;
        current.machines += 1;
        productMap.set(name, current);
      }
    }
    return Array.from(productMap.entries())
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.cap - a.cap)
      .slice(0, 8);
  }, [equipments]);

  return (
    <section className="f66Panel">
      <div className="f66PanelHead">
        <div>
          <span className="f66Eyebrow">CAPACITY LEDGER</span>
          <h2>產品產能排行</h2>
        </div>
        <Link href="/dashboard/equipment" className="f66MiniLink">設備台帳</Link>
      </div>
      {productRows.length > 0 ? (
        <div className="f66ProductList">
          {productRows.map((row) => (
            <div key={row.name} className="f66ProductRow">
              <span>{row.name}</span>
              <i>{row.machines} 台</i>
              <strong>{formatUphValue(row.cap)} UPH</strong>
            </div>
          ))}
        </div>
      ) : (
        <div className="f66EmptyState">設備台帳尚未填寫產品產能。建議先補上每台設備的 products。</div>
      )}
    </section>
  );
}

export function WarRoomPage() {
  const { user, profile, isAdmin, appVersion } = useAuth();
  const releaseLabel = getAppReleaseLabel(appVersion);
  const [installs, setInstalls] = useState<Installation[]>([]);
  const [equips, setEquips] = useState<Equipment[]>([]);
  const [loadingI, setLoadingI] = useState(true);
  const [loadingE, setLoadingE] = useState(true);

  useEffect(() => {
    if (!user) return;
    const unsub = listenInstallations(
      (rows) => { setInstalls(rows); setLoadingI(false); },
      () => setLoadingI(false),
    );
    return () => unsub?.();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = listenEquipments(
      (rows) => { setEquips(rows); setLoadingE(false); },
      () => setLoadingE(false),
    );
    return () => unsub?.();
  }, [user]);

  const today = todayYYYYMMDD();
  const loading = loadingI || loadingE;

  const computed = useMemo(() => {
    const total = installs.length;
    const wip = installs.filter((row) => !isReleased(row)).length;
    const released = installs.filter(isReleased).length;
    const overdue = installs.filter((row) => isOverdue(row, today));
    const dueSoon = installs.filter((row) => {
      if (isReleased(row)) return false;
      const days = daysBetween(today, safeStr(row.estComplete));
      return days != null && days >= 0 && days <= 7;
    });
    const stale = installs.filter((row) => !isReleased(row) && daysSinceUpdated(row.updatedAt) >= 7);
    const blocked = equips.filter((row) => safeStr(row.blocking?.reasonCode));
    const hot = equips.filter((row) => getLiveUtilization(row.capacity) >= 80);
    const avgProgress = total ? Math.round(installs.reduce((sum, row) => sum + Number(row.progress || 0), 0) / total) : 0;
    const avgUtilization = equips.length ? Math.round(equips.reduce((sum, row) => sum + getLiveUtilization(row.capacity), 0) / equips.length) : 0;
    const healthScore = clamp(100 - overdue.length * 8 - blocked.length * 6 - dueSoon.length * 3 - stale.length * 2, 0, 100);

    const phaseCount: Record<PhaseKey, number> = {
      ordered: 0,
      shipping: 0,
      arrived: 0,
      installing: 0,
      trial: 0,
      qual: 0,
      released: 0,
    };
    for (const row of installs) phaseCount[row.phase] = (phaseCount[row.phase] ?? 0) + 1;

    const regionRows = (Object.keys(REGIONS) as RegionKey[]).map((key) => {
      const regionInstalls = installs.filter((row) => row.region === key);
      const regionEquips = equips.filter((row) => row.region === key);
      const regionOverdue = regionInstalls.filter((row) => isOverdue(row, today)).length;
      const regionBlocked = regionEquips.filter((row) => safeStr(row.blocking?.reasonCode)).length;
      const regionHot = regionEquips.filter((row) => getLiveUtilization(row.capacity) >= 80).length;
      const score = clamp(100 - regionOverdue * 14 - regionBlocked * 12 - regionHot * 4, 0, 100);
      return {
        key,
        label: REGIONS[key].label,
        color: REGIONS[key].color,
        installs: regionInstalls.length,
        equipments: regionEquips.length,
        overdue: regionOverdue,
        blocked: regionBlocked,
        hot: regionHot,
        score,
      };
    });

    const queue: QueueItem[] = [
      ...overdue.map((row) => ({
        id: `overdue-${row.id}`,
        title: getInstallTitle(row),
        meta: `${row.customer || "未填客戶"} · ${PHASE_MAP[row.phase]?.label ?? row.phase} · ${toDisplayShortName(row.engineer) || "未指派"}`,
        value: `逾期 ${Math.abs(daysBetween(today, safeStr(row.estComplete)) ?? 0)} 天`,
        tone: "critical" as Tone,
        href: "/dashboard/install?view=pipeline",
        priority: 100,
      })),
      ...blocked.map((row) => ({
        id: `blocked-${row.id}`,
        title: row.equipmentId || row.serialNo || row.id,
        meta: `${row.customer || "未填客戶"} · ${row.blocking?.reasonCode || "阻塞"} · ${row.blocking?.owner || "未指派 owner"}`,
        value: "BLOCK",
        tone: "warning" as Tone,
        href: "/dashboard/equipment",
        priority: 90,
      })),
      ...dueSoon.map((row) => ({
        id: `due-${row.id}`,
        title: getInstallTitle(row),
        meta: `${row.customer || "未填客戶"} · 預計 ${row.estComplete} · ${toDisplayShortName(row.engineer) || "未指派"}`,
        value: `${daysBetween(today, safeStr(row.estComplete)) ?? 0} 天內`,
        tone: "info" as Tone,
        href: "/dashboard/install?view=table",
        priority: 70,
      })),
      ...stale.slice(0, 8).map((row) => ({
        id: `stale-${row.id}`,
        title: getInstallTitle(row),
        meta: `${row.customer || "未填客戶"} · ${PHASE_MAP[row.phase]?.label ?? row.phase} · ${daysSinceUpdated(row.updatedAt)} 天未更新`,
        value: "STALE",
        tone: "warning" as Tone,
        href: "/dashboard/install?view=card",
        priority: 60,
      })),
      ...hot.slice(0, 8).map((row) => ({
        id: `hot-${row.id}`,
        title: row.equipmentId || row.serialNo || row.id,
        meta: `${row.customer || "未填客戶"} · ${row.modelCode} · ${getLiveUtilization(row.capacity)}% utilization`,
        value: "高負載",
        tone: "good" as Tone,
        href: "/dashboard/equipment",
        priority: 40,
      })),
    ].sort((a, b) => b.priority - a.priority).slice(0, 12);

    return {
      total,
      wip,
      released,
      overdue,
      dueSoon,
      stale,
      blocked,
      hot,
      avgProgress,
      avgUtilization,
      healthScore,
      phaseRows: PHASES.map((phase) => ({ ...phase, count: phaseCount[phase.key] ?? 0 })),
      regionRows,
      queue,
    };
  }, [installs, equips, today]);

  const myWork = useMemo(() => {
    const userKey = normalizePersonKey(user?.email ?? profile?.email ?? "");
    const rows = installs.filter((row) => {
      const engineerKey = normalizePersonKey(row.engineer);
      return userKey && engineerKey && engineerKey === userKey && !isReleased(row);
    });
    return {
      open: rows.length,
      overdue: rows.filter((row) => isOverdue(row, today)).length,
    };
  }, [installs, profile?.email, today, user?.email]);

  const briefLines = useMemo(() => {
    const lines: string[] = [];
    if (computed.overdue.length > 0) lines.push(`${computed.overdue.length} 件裝機逾期，先要求 owner 更新 ETA 與下一步。`);
    if (computed.blocked.length > 0) lines.push(`${computed.blocked.length} 台設備有 blocking，需確認責任人與解除日期。`);
    if (computed.dueSoon.length > 0) lines.push(`${computed.dueSoon.length} 件本週到期，適合排進 morning standup。`);
    if (computed.hot.length > 0) lines.push(`${computed.hot.length} 台設備稼動率超過 80%，產能壓力需追蹤。`);
    if (lines.length === 0) lines.push("目前沒有紅色警戒，建議把焦點放在資料完整度與下週交付排序。");
    return lines;
  }, [computed.blocked.length, computed.dueSoon.length, computed.hot.length, computed.overdue.length]);

  if (loading) {
    return (
      <div className="f66Loading">
        <div className="f66LoadingCore">{releaseLabel}</div>
        <div>Operations Control 正在連線 Firebase...</div>
      </div>
    );
  }

  return (
    <main className="f66OpsPage">
      <section className="f66Hero">
        <div className="f66HeroCopy">
          <span className="f66Eyebrow">INSTALL OPERATIONS {releaseLabel}</span>
          <h1>裝機營運中樞</h1>
          <p>
            將裝機任務、設備阻塞、產品產能與權限治理整合成每日可執行的指揮面板；主管看風險，工程師看任務，admin 看資料完整度。
          </p>
          <div className="f66HeroActions">
            <Link href="/dashboard/install?view=pipeline" className="f66PrimaryAction">處理任務流</Link>
            <Link href="/dashboard/equipment" className="f66SecondaryAction">查看設備台帳</Link>
            <Link href="/dashboard/system" className="f66SecondaryAction">版本與系統</Link>
          </div>
        </div>
        <div className="f66HealthDial" aria-label="營運健康分數">
          <span>OPS HEALTH</span>
          <strong>{computed.healthScore}</strong>
          <p>v{appVersion} · {today}</p>
        </div>
      </section>

      <section className="f66MetricGrid" aria-label="營運指標">
        <ControlMetric label="WIP 裝機" value={computed.wip} unit="件" caption={`總案量 ${computed.total}，已 release ${computed.released}`} tone="info" />
        <ControlMetric label="逾期警戒" value={computed.overdue.length} unit="件" caption="超過預計安裝完成日" tone={computed.overdue.length > 0 ? "critical" : "good"} />
        <ControlMetric label="本週到期" value={computed.dueSoon.length} unit="件" caption="7 天內需要交付或更新" tone={computed.dueSoon.length > 0 ? "warning" : "good"} />
        <ControlMetric label="設備阻塞" value={computed.blocked.length} unit="台" caption="blocking reason code 已填寫" tone={computed.blocked.length > 0 ? "warning" : "good"} />
        <ControlMetric label="平均裝機進度" value={computed.avgProgress} unit="%" caption="全裝機案件平均進度" tone="info" />
        <ControlMetric label="平均稼動率" value={computed.avgUtilization} unit="%" caption="設備台帳即時計算" tone={computed.avgUtilization >= 80 ? "warning" : "good"} />
      </section>

      <div className="f66MainGrid">
        <ActionQueue items={computed.queue} />
        <RoleConsole isAdmin={isAdmin} myOpen={myWork.open} myOverdue={myWork.overdue} adminGaps={computed.stale.length + computed.blocked.length} />
      </div>

      <div className="f66MainGrid f66MainGridWide">
        <RegionCommand rows={computed.regionRows} />
        <PhaseRail phaseRows={computed.phaseRows} />
      </div>

      <div className="f66MainGrid">
        <section className="f66Panel">
          <div className="f66PanelHead">
            <div>
              <span className="f66Eyebrow">COMMAND BRIEF</span>
              <h2>今日決策摘要</h2>
            </div>
          </div>
          <div className="f66BriefList">
            {briefLines.map((line) => <p key={line}>{line}</p>)}
          </div>
          <div className="f66LoopGrid">
            <div><span>08:30</span><strong>風險站會</strong><small>逾期、blocking、ETA</small></div>
            <div><span>13:30</span><strong>交付校準</strong><small>本週到期與客戶窗口</small></div>
            <div><span>17:30</span><strong>資料封版</strong><small>更新進度、設備產能、audit trail</small></div>
          </div>
        </section>
        <ProductCapacityBoard equipments={equips} />
      </div>
    </main>
  );
}
