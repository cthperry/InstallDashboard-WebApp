"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/features/auth/AuthProvider";
import { listenInstallations } from "@/features/data/installations";
import { listenEquipments } from "@/features/data/equipments";
import type { Equipment, Installation, PhaseKey, RegionKey } from "@/domain/types";
import { PHASES, PHASE_MAP, REGIONS } from "@/domain/constants";
import { toDisplayShortName } from "@/domain/personDisplay";
import { formatUphValue, getLiveUtilization } from "@/domain/capacity";

/* ── helpers ── */
function todayYYYYMMDD() {
  return new Date().toISOString().slice(0, 10);
}
function safeStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  return String(v);
}
function isOverdue(r: Installation, today: string) {
  const due = safeStr(r.estComplete);
  if (!due) return false;
  if (safeStr(r.phase) === "released") return false;
  return due < today;
}
function daysOverdue(r: Installation, today: string): number {
  const due = safeStr(r.estComplete);
  if (!due) return 0;
  const diff = Math.round(
    (new Date(today).getTime() - new Date(due).getTime()) / 86400000
  );
  return diff > 0 ? diff : 0;
}
function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }

/* ── sub-components ── */
function WarKpiCard({
  label, value, unit, sub, icon, color, critical, warning,
}: {
  label: string; value: string | number; unit?: string; sub?: string;
  icon: string; color: string; critical?: boolean; warning?: boolean;
}) {
  return (
    <div
      className={`warKpiCard${critical ? " critical" : warning ? " warning" : ""}`}
      style={{ "--war-kpi-border": `${color}40`, "--war-kpi-glow": `${color}22` } as React.CSSProperties}
    >
      <div className="warKpiIcon">{icon}</div>
      <div className="warKpiLabel">{label}</div>
      <div className="warKpiValue" style={{ color }}>
        {value}
        {unit ? <span className="warKpiUnit">{unit}</span> : null}
      </div>
      {sub ? <div className="warKpiSub">{sub}</div> : null}
    </div>
  );
}

function WarAlertEmpty({ msg }: { msg: string }) {
  return (
    <div className="warAlertEmpty">
      <div className="warAlertEmptyIcon">✅</div>
      <div>{msg}</div>
    </div>
  );
}

/* ── main component ── */
export function WarRoomPage() {
  const { user } = useAuth();
  const [installs, setInstalls] = useState<Installation[]>([]);
  const [equips, setEquips] = useState<Equipment[]>([]);
  const [loadingI, setLoadingI] = useState(true);
  const [loadingE, setLoadingE] = useState(true);

  useEffect(() => {
    if (!user) return;
    const unsub = listenInstallations(
      (rows) => { setInstalls(rows); setLoadingI(false); },
      () => setLoadingI(false)
    );
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = listenEquipments(
      (rows) => { setEquips(rows); setLoadingE(false); },
      () => setLoadingE(false)
    );
    return () => unsub();
  }, [user]);

  const today = todayYYYYMMDD();

  /* ── computed stats ── */
  const {
    total, wip, released, overdueCount, avgProg, byPhase,
    overdueItems,
  } = useMemo(() => {
    const total = installs.length;
    const wip = installs.filter((r) => r.phase !== "released").length;
    const released = installs.filter((r) => r.phase === "released").length;
    const overdueItems = installs.filter((r) => isOverdue(r, today));
    const overdueCount = overdueItems.length;
    const avgProg = total
      ? Math.round(installs.reduce((a, r) => a + (r.progress ?? 0), 0) / total)
      : 0;
    const byPhase: Record<PhaseKey, number> = {
      ordered: 0, shipping: 0, arrived: 0, installing: 0,
      trial: 0, qual: 0, released: 0,
    };
    for (const r of installs) byPhase[r.phase] = (byPhase[r.phase] ?? 0) + 1;
    return { total, wip, released, overdueCount, avgProg, byPhase, overdueItems };
  }, [installs, today]);

  const {
    equipTotal, avgUtil, blockedEquips, blockedCount,
  } = useMemo(() => {
    const equipTotal = equips.length;
    const avgUtil = equipTotal
      ? Math.round(equips.reduce((a, r) => a + getLiveUtilization(r.capacity), 0) / equipTotal)
      : 0;
    const blockedEquips = equips.filter((r) => r.blocking?.reasonCode);
    const blockedCount = blockedEquips.length;
    return { equipTotal, avgUtil, blockedEquips, blockedCount };
  }, [equips]);

  /* region breakdown */
  const regionStats = useMemo(() => {
    const installCountMap = new Map<RegionKey, number>();
    const equipCountMap = new Map<RegionKey, number>();
    const overdueCountMap = new Map<RegionKey, number>();

    for (const row of installs) {
      installCountMap.set(row.region, (installCountMap.get(row.region) ?? 0) + 1);
      if (isOverdue(row, today)) {
        overdueCountMap.set(row.region, (overdueCountMap.get(row.region) ?? 0) + 1);
      }
    }

    for (const row of equips) {
      equipCountMap.set(row.region, (equipCountMap.get(row.region) ?? 0) + 1);
    }

    return (Object.keys(REGIONS) as RegionKey[]).map((rk) => ({
      key: rk,
      label: REGIONS[rk].label,
      color: REGIONS[rk].color,
      installs: installCountMap.get(rk) ?? 0,
      equips: equipCountMap.get(rk) ?? 0,
      overdue: overdueCountMap.get(rk) ?? 0,
    }));
  }, [installs, equips, today]);

  /* engineer workload */
  const engineerStats = useMemo(() => {
    const map: Record<string, { total: number; overdue: number }> = {};
    for (const r of installs) {
      const eng = toDisplayShortName(r.engineer) || "未指派";
      if (!map[eng]) map[eng] = { total: 0, overdue: 0 };
      map[eng].total++;
      if (isOverdue(r, today)) map[eng].overdue++;
    }
    return Object.entries(map)
      .map(([name, s]) => ({ name, ...s }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [installs, today]);

  const maxEngLoad = Math.max(...engineerStats.map((e) => e.total), 1);

  /* 地區產品產能（面板固定顯示；未填資料時顯示空狀態） */
  const regionProductStats = useMemo(() => {
    const map: Record<string, { label: string; color: string; productMap: Record<string, number> }> = Object.fromEntries(
      Object.entries(REGIONS).map(([key, region]) => [
        key,
        { label: region.label, color: region.color, productMap: {} },
      ])
    );

    equips.forEach((e) => {
      const rk = (e.region as RegionKey) ?? "north";
      const reg = REGIONS[rk] ?? { label: rk, color: "#3b82f6" };
      if (!map[rk]) map[rk] = { label: reg.label, color: reg.color, productMap: {} };
      (e.products ?? []).forEach((p) => {
        const name = safeStr(p.name).trim();
        const cap = Number(p.dailyCap) || 0;
        if (name) {
          map[rk].productMap[name] = (map[rk].productMap[name] ?? 0) + cap;
        }
      });
    });

    return Object.entries(map).map(([key, val]) => ({
      key,
      label: val.label,
      color: val.color,
      products: Object.entries(val.productMap)
        .map(([name, cap]) => ({ name, cap }))
        .sort((a, b) => b.cap - a.cap),
    }));
  }, [equips]);

  /* phase bars (exclude released) */
  const phaseRows = useMemo(() => {
    return PHASES.filter((p) => p.key !== "released").map((p) => ({
      ...p,
      count: byPhase[p.key] ?? 0,
    }));
  }, [byPhase]);
  const maxPhaseCount = Math.max(...phaseRows.map((p) => p.count), 1);

  const loading = loadingI || loadingE;

  if (loading) {
    return (
      <div className="warRoomPage" style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "var(--muted-foreground)" }}>
          <div style={{ fontSize: 32, marginBottom: 12, animation: "war-blink 1.2s infinite" }}>⚡</div>
          <div style={{ fontSize: 14, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            戰情室連線中…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="warRoomPage">

      {/* ── Header ── */}
      <div className="warRoomHeader">
        <div>
          <div className="warRoomTitle">⚡ INSTALL OPS · 即時戰情室</div>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 3, letterSpacing: "0.05em" }}>
            REAL-TIME COMMAND CENTER · {today}
          </div>
        </div>
        <div className="warRoomHeaderRight">
          <div className="warLiveDot">Live</div>
          <Link href="/dashboard/install" className="btn btnGhost" style={{ fontSize: 12 }}>
            → 裝機管理
          </Link>
        </div>
      </div>

      {/* ── KPI Row ── */}
      <div className="warKpiGrid">
        <WarKpiCard label="進行中案件" value={wip}          unit="件" sub={`共 ${total} 件`}           icon="📋" color="#a78bfa" />
        <WarKpiCard label="逾期警戒"   value={overdueCount} unit="件" sub="超過預計安裝日"             icon="🚨" color="#f43f5e" critical={overdueCount > 0} />
        <WarKpiCard label="已量產"     value={released}      unit="件" sub={`完成率 ${total ? Math.round(released/total*100) : 0}%`} icon="✅" color="#10b981" />
        <WarKpiCard label="平均進度"   value={avgProg}       unit="%" sub="所有案件平均"               icon="📊" color="#38bdf8" />
        <WarKpiCard label="設備在線"   value={equipTotal}    unit="台" sub="設備台帳總數"              icon="🖥️" color="#a78bfa" />
        <WarKpiCard label="設備異常"   value={blockedCount}  unit="台" sub="有卡關原因碼"              icon="⚠️" color="#fbbf24" warning={blockedCount > 0} />
      </div>

      {/* ── 地區產品產能 ── */}
      <div className="warPanel" style={{ marginTop: 0, marginBottom: 16 }}>
        <div className="warPanelHead">
          <div className="warPanelTitle">🏭 地區產品產能</div>
          <div className="warPanelBadge" style={{ color: "#10b981", borderColor: "rgba(16,185,129,0.4)" }}>
            {regionProductStats.length} 區
          </div>
        </div>
        <div className="warPanelBody">
          <div className="warRegionGrid">
            {regionProductStats.map((rg) => (
              <div
                key={rg.key}
                className="warRegionCard"
                style={{ borderColor: `${rg.color}40`, borderLeftColor: rg.color }}
              >
                <div className="warRegionName" style={{ color: rg.color, marginBottom: 10 }}>
                  {rg.label}
                </div>
                {rg.products.length > 0 ? (
                  rg.products.map((p) => (
                    <div key={p.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 7 }}>
                      <span style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 900, letterSpacing: "0.03em" }}>
                        {p.name}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono, monospace)", fontWeight: 700, fontSize: 13, color: "var(--foreground)" }}>
                        {formatUphValue(p.cap)} UPH
                      </span>
                    </div>
                  ))
                ) : (
                  <div style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.6 }}>
                    尚未填寫產品產能
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Mid row: Alerts + Phase distribution ── */}
      <div className="warMidRow">

        {/* Alert panel */}
        <div className="warPanel">
          <div className="warPanelHead">
            <div className="warPanelTitle">
              🚨 即時警戒
            </div>
            <div
              className="warPanelBadge"
              style={{
                color: (overdueCount + blockedCount) > 0 ? "#f43f5e" : "#10b981",
                borderColor: (overdueCount + blockedCount) > 0 ? "rgba(244,63,94,0.4)" : "rgba(16,185,129,0.4)",
              }}
            >
              {overdueCount + blockedCount} 項
            </div>
          </div>
          <div className="warPanelBody">
            {overdueCount === 0 && blockedCount === 0 ? (
              <WarAlertEmpty msg="目前無警戒項目，系統運行正常" />
            ) : (
              <div className="warAlertList">
                {/* Overdue installs */}
                {overdueItems
                  .sort((a, b) => daysOverdue(b, today) - daysOverdue(a, today))
                  .slice(0, 6)
                  .map((r) => {
                    const days = daysOverdue(r, today);
                    return (
                      <div key={r.id} className="warAlertRow alertCritical">
                        <div className="warAlertIcon">🚨</div>
                        <div className="warAlertContent">
                          <div className="warAlertName">{r.name || r.id}</div>
                          <div className="warAlertMeta">
                            {r.customer} · {PHASE_MAP[r.phase]?.label} · {toDisplayShortName(r.engineer) || "-"}
                          </div>
                        </div>
                        <div
                          className="warAlertTag"
                          style={{ color: "#f43f5e", borderColor: "rgba(244,63,94,0.4)" }}
                        >
                          逾期 {days}天
                        </div>
                      </div>
                    );
                  })}
                {/* Blocked equipment */}
                {blockedEquips.slice(0, 4).map((eq) => (
                  <div key={eq.id} className="warAlertRow alertWarning">
                    <div className="warAlertIcon">⚠️</div>
                    <div className="warAlertContent">
                      <div className="warAlertName">{eq.equipmentId}</div>
                      <div className="warAlertMeta">
                        {eq.customer} · {eq.blocking?.reasonCode} · {eq.blocking?.owner}
                      </div>
                    </div>
                    <div
                      className="warAlertTag"
                      style={{ color: "#fbbf24", borderColor: "rgba(251,191,36,0.4)" }}
                    >
                      卡關
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Phase distribution */}
        <div className="warPanel">
          <div className="warPanelHead">
            <div className="warPanelTitle">📊 階段分佈（進行中）</div>
            <div
              className="warPanelBadge"
              style={{ color: "#a78bfa", borderColor: "rgba(167,139,250,0.4)" }}
            >
              {wip} WIP
            </div>
          </div>
          <div className="warPanelBody">
            <div className="warPhaseList">
              {phaseRows.map((p) => (
                <div key={p.key} className="warPhaseRow">
                  <div className="warPhaseLabel" title={p.label}>
                    {p.icon} {p.label}
                  </div>
                  <div className="warPhaseBarWrap">
                    <div
                      className="warPhaseBar"
                      style={{
                        width: `${clamp((p.count / maxPhaseCount) * 100, 0, 100)}%`,
                        background: p.color,
                        opacity: p.count > 0 ? 1 : 0.2,
                      }}
                    />
                  </div>
                  <div className="warPhaseCount" style={{ color: p.count > 0 ? p.color : "var(--muted-foreground)" }}>
                    {p.count}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom row: Region + Engineer load ── */}
      <div className="warBottomRow">

        {/* Region breakdown */}
        <div className="warPanel">
          <div className="warPanelHead">
            <div className="warPanelTitle">🗺️ 區域概覽</div>
          </div>
          <div className="warPanelBody">
            <div className="warRegionGrid">
              {regionStats.map((r) => (
                <div
                  key={r.key}
                  className="warRegionCard"
                  style={{
                    borderColor: `${r.color}40`,
                    borderLeftColor: r.color,
                  }}
                >
                  <div className="warRegionName" style={{ color: r.color }}>
                    {r.label}
                  </div>
                  <div className="warRegionStats">
                    <div className="warRegionStat">
                      <div className="warRegionStatVal" style={{ color: "#a78bfa" }}>{r.installs}</div>
                      <div className="warRegionStatLabel">裝機</div>
                    </div>
                    <div className="warRegionStat">
                      <div className="warRegionStatVal" style={{ color: "#38bdf8" }}>{r.equips}</div>
                      <div className="warRegionStatLabel">設備</div>
                    </div>
                    <div className="warRegionStat">
                      <div
                        className="warRegionStatVal"
                        style={{ color: r.overdue > 0 ? "#f43f5e" : "#10b981" }}
                      >
                        {r.overdue}
                      </div>
                      <div className="warRegionStatLabel">逾期</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Engineer workload */}
        <div className="warPanel">
          <div className="warPanelHead">
            <div className="warPanelTitle">👷 工程師戰力</div>
            <div
              className="warPanelBadge"
              style={{ color: "#38bdf8", borderColor: "rgba(56,189,248,0.4)" }}
            >
              {engineerStats.length} 人
            </div>
          </div>
          <div className="warPanelBody">
            {engineerStats.length === 0 ? (
              <WarAlertEmpty msg="尚無工程師資料" />
            ) : (
              <table className="warEngTable">
                <thead>
                  <tr>
                    <th>工程師</th>
                    <th>案件數</th>
                    <th style={{ minWidth: 80 }}>負荷</th>
                    <th>逾期</th>
                  </tr>
                </thead>
                <tbody>
                  {engineerStats.map((eng) => (
                    <tr key={eng.name}>
                      <td><div className="warEngName">{eng.name}</div></td>
                      <td>
                        <span style={{
                          fontFamily: "var(--font-mono, monospace)",
                          fontWeight: 700,
                          color: "#a78bfa",
                        }}>
                          {eng.total}
                        </span>
                      </td>
                      <td>
                        <div className="warEngBar">
                          <div
                            className="warEngBarFill"
                            style={{ width: `${clamp((eng.total / maxEngLoad) * 100, 0, 100)}%` }}
                          />
                        </div>
                      </td>
                      <td>
                        {eng.overdue > 0 ? (
                          <span className="warEngOverdue">{eng.overdue}</span>
                        ) : (
                          <span style={{ color: "#10b981", fontWeight: 700, fontFamily: "var(--font-mono, monospace)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
