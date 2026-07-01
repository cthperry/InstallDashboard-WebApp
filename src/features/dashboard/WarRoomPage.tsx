"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useAuth } from "@/features/auth/AuthProvider";
import { listenInstallations } from "@/features/data/installations";
import { listenEquipments } from "@/features/data/equipments";
import type { Equipment, Installation } from "@/domain/types";
import { getAppReleaseLabel } from "@/config/appVersion";
import { todayInTaipeiYmd } from "@/lib/utils";
import {
  buildWarRoomMeetingMarkdown,
  downloadMarkdownFile,
  type WarRoomMeetingMode,
} from "@/features/dashboard/warRoomBrief";
import {
  buildWarRoomViewModel,
  type PhaseCommandRow,
  type QueueItem,
  type RegionCommandRow,
  type Tone,
} from "@/features/dashboard/warRoomViewModel";

function todayYYYYMMDD() {
  return todayInTaipeiYmd();
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
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

function PhaseRail({ phaseRows, maxPhaseCount }: { phaseRows: PhaseCommandRow[]; maxPhaseCount: number }) {
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
              <i style={{ width: `${clamp((phase.count / maxPhaseCount) * 100, 0, 100)}%`, background: phase.color }} />
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
  rows: RegionCommandRow[];
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

export function WarRoomPage() {
  const { user, appVersion } = useAuth();
  const releaseLabel = getAppReleaseLabel(appVersion);
  const [installs, setInstalls] = useState<Installation[]>([]);
  const [equips, setEquips] = useState<Equipment[]>([]);
  const [loadingI, setLoadingI] = useState(true);
  const [loadingE, setLoadingE] = useState(true);
  const [meetingMode, setMeetingMode] = useState<WarRoomMeetingMode>("morning");
  const [briefNotice, setBriefNotice] = useState("");

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

  const computed = useMemo(() => buildWarRoomViewModel(installs, equips, today), [installs, equips, today]);

  const meetingMarkdown = useMemo(() => buildWarRoomMeetingMarkdown({
    mode: meetingMode,
    today,
    healthScore: computed.healthScore,
    total: computed.total,
    wip: computed.wip,
    released: computed.released,
    avgUtilization: computed.avgUtilization,
    overdue: computed.overdue,
    dueSoon: computed.dueSoon,
    stale: computed.stale,
    blocked: computed.blocked,
    hot: computed.hot,
    queue: computed.queue,
    phaseRows: computed.phaseRows,
    regionRows: computed.regionRows,
  }), [computed, meetingMode, today]);

  async function copyMeetingMarkdown() {
    try {
      await navigator.clipboard.writeText(meetingMarkdown);
      setBriefNotice("已複製 Markdown 摘要");
    } catch {
      setBriefNotice("複製失敗，請改用下載 Markdown");
    }
  }

  function downloadMeetingMarkdown() {
    downloadMarkdownFile(`war-room-${meetingMode}-${today}.md`, meetingMarkdown);
    setBriefNotice("已下載 Markdown 摘要");
  }

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
      <section className="f66MetricGrid" aria-label="營運指標">
        <ControlMetric label="OPS HEALTH" value={computed.healthScore} caption={`v${appVersion} · ${today}`} tone={computed.healthScore < 70 ? "warning" : "good"} />
        <ControlMetric label="WIP 裝機" value={computed.wip} unit="件" caption={`總案量 ${computed.total}，已 release ${computed.released}`} tone="info" />
        <ControlMetric label="逾期警戒" value={computed.overdue.length} unit="件" caption="超過預計安裝完成日" tone={computed.overdue.length > 0 ? "critical" : "good"} />
        <ControlMetric label="本週到期" value={computed.dueSoon.length} unit="件" caption="7 天內需要交付或更新" tone={computed.dueSoon.length > 0 ? "warning" : "good"} />
        <ControlMetric label="設備阻塞" value={computed.blocked.length} unit="台" caption="blocking reason code 已填寫" tone={computed.blocked.length > 0 ? "warning" : "good"} />
        <ControlMetric label="平均稼動率" value={computed.avgUtilization} unit="%" caption="設備台帳即時計算" tone={computed.avgUtilization >= 80 ? "warning" : "good"} />
      </section>

      <div className="f66MainGrid f66MainGridWide">
        <ActionQueue items={computed.queue} />
      </div>

      <div className="f66MainGrid f66MainGridWide">
        <RegionCommand rows={computed.regionRows} />
        <PhaseRail phaseRows={computed.phaseRows} maxPhaseCount={computed.maxPhaseCount} />
      </div>

      <div className="f66MainGrid f66MainGridWide">
        <section className="f66Panel">
          <div className="f66PanelHead">
            <div>
              <span className="f66Eyebrow">COMMAND BRIEF</span>
              <h2>今日決策摘要</h2>
            </div>
          </div>
          <div className="f66BriefList">
            {computed.briefLines.map((line) => <p key={line}>{line}</p>)}
          </div>
        </section>
      </div>

      <div className="f66MainGrid f66MainGridWide">
        <section className="f66Panel">
          <div className="f66PanelHead">
            <div>
              <span className="f66Eyebrow">MEETING MODE</span>
              <h2>會議摘要 Markdown</h2>
            </div>
            <div className="f66BriefActions">
              <select value={meetingMode} onChange={(event) => setMeetingMode(event.target.value as WarRoomMeetingMode)}>
                <option value="morning">Morning standup</option>
                <option value="weekly">Weekly review</option>
              </select>
              <button className="f66MiniLink" type="button" onClick={copyMeetingMarkdown}>複製</button>
              <button className="f66MiniLink" type="button" onClick={downloadMeetingMarkdown}>下載 MD</button>
            </div>
          </div>
          {briefNotice ? <div className="f66BriefNotice">{briefNotice}</div> : null}
          <pre className="f66MeetingPreview">{meetingMarkdown}</pre>
        </section>
      </div>
    </main>
  );
}
