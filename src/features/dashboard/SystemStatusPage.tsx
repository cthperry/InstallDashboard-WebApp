"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { getAppReleaseLabel } from "@/config/appVersion";
import { listenImportSessions, type ImportSessionRow } from "@/features/data/importSessions";

function buildReleaseNotes(releaseLabel: string): string[] {
  return [
    `${releaseLabel} 完成裝機與設備台帳的治理化優化：主流程維持 admin / engineer 兩種角色，並補上任務流、War Room 與洞察報表。`,
    "裝機案新增 SLA aging、下一步 owner / ETA / action、逾期原因與 admin 批次治理，表格、Pipeline、任務佇列與 CSV 匯出同步呈現。",
    "設備台帳新增 blocking lifecycle（open / resolved / reopened）、處理天數、重開次數、解決備註、容量風險與設備 CSV 匯出。",
    "智慧匯入新增 dry-run 摘要、拒收資料匯出、匯入 session history，以及 admin 可維護的欄位 / 客戶 / 機型 alias 設定。",
    "Insights 新增治理健康分數、cycle time、階段 aging、客戶 / 機型健康摘要與 Markdown 分析報告下載。",
    "War Room 新增晨會 / 週會模式、決策佇列、Markdown 複製與下載，方便跨團隊追蹤 overdue、blocking、due soon 與 stale updates。",
    "品質流程新增輕量 unit test runner，將治理、分析與報表純邏輯納入 verify:quality gate。",
    "GitHub Actions 新增版本、品質與 build 守門，PR 與 main/codex 分支推送都會留下可追蹤的 CI 紀錄。",
    "效能優化：智慧匯入 modal 改為開啟時載入，降低 dashboard 首屏 bundle 壓力。",
    "效能優化：甘特圖改為切換到甘特模式時載入，並快取時間軸計算以提升拖曳流暢度。",
    "效能優化：Pipeline Kanban 依階段分組改為單次快取，減少每次 render 的重複篩選。",
    "效能優化：Insights 分析與治理報表改為進入分析頁或下載報告時才建構，降低一般 dashboard 操作重算成本。",
    "效能優化：任務佇列改為只在對應的裝機或設備頁建構，減少 Insights 與跨頁切換時的不必要計算。",
    "效能優化：War Room 指標、區域健康與決策佇列改為單次聚合，降低晨會頁資料更新時的重複掃描。",
    "效能優化：智慧匯入預覽改為單次建構列異常與選取統計，降低大型 Excel 預覽、dry-run 與 reject CSV 的重複驗證成本。",
    "效能優化：Insights analytics 改為單次累積安裝與設備統計，減少分析頁 region、engineer、due、cycle time 與 health 指標的重複掃描。",
    "效能優化：Insights governance 報告改為單次累積治理問題，降低 score、critical issue 與 issue rows 的重複掃描成本。",
    "效能優化：Dashboard stats 改為單次累積 WIP、released、overdue、平均進度、容量與阻塞摘要，降低主頁 KPI 重算成本。",
    "效能優化：Dashboard filter 排序 lookup 改為 module-level 快取，keyword 搜尋改為逐欄位比對並避免 filtered rows 二次複製。",
    "效能優化：Dashboard action queue 改為單次累積任務候選，避免 map / filter 中間陣列並保留前五優先排序。",
    "效能優化：Insights cycle time 改為單次排序同時計算 p50 與 longest rows，減少分析頁 completed cases 的重複排序成本。",
    "效能優化：Insights customer/model health 改為 bounded top 8 累積，避免大量客戶或機型時全量排序後再裁切。",
    "效能優化：Dashboard action queue 改為 bounded top 5 累積，避免大量任務候選全量排序後再裁切。",
    "效能優化：舊版裝機/設備 Excel 匯入預覽改為單次選取統計，減少大型檔案預覽時的重複 filter/every/some 掃描。",
  ];
}

function StatusPill({ label, tone }: { label: string; tone: "good" | "info" | "warning" }) {
  return <span className={`f66StatusPill f66StatusPill-${tone}`}>{label}</span>;
}

function formatImportTime(value?: number): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function SystemStatusPage() {
  const { appVersion, profile, isAdmin } = useAuth();
  const [importSessions, setImportSessions] = useState<ImportSessionRow[]>([]);
  const [importSessionErr, setImportSessionErr] = useState("");
  const releaseLabel = getAppReleaseLabel(appVersion);
  const buildDate = appVersion.slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
  const releaseNotes = buildReleaseNotes(releaseLabel);

  useEffect(() => {
    if (!isAdmin) {
      setImportSessions([]);
      return;
    }
    const unsubscribe = listenImportSessions(
      setImportSessions,
      (error) => setImportSessionErr(error instanceof Error ? error.message : String(error)),
      5,
    );
    return () => unsubscribe?.();
  }, [isAdmin]);

  return (
    <main className="f66SystemPage">
      <section className="f66SystemHero">
        <div>
          <span className="f66Eyebrow">SYSTEM REGISTRY</span>
          <h1>版本與部署狀態</h1>
          <p>
            這裡用來確認目前本機/線上 app 的版本定位、功能分流與權限邊界。後續每次正式改版都應先更新此頁，再推送部署。
          </p>
        </div>
        <div className="f66VersionPlate">
          <span>CURRENT VERSION</span>
          <strong>{appVersion}</strong>
          <p>{buildDate}</p>
        </div>
      </section>

      <section className="f66SystemGrid">
        <div className="f66Panel">
          <div className="f66PanelHead">
            <div>
              <span className="f66Eyebrow">ACCESS</span>
              <h2>目前身分</h2>
            </div>
            <StatusPill label={isAdmin ? "ADMIN" : "ENGINEER"} tone={isAdmin ? "warning" : "info"} />
          </div>
          <div className="f66IdentityBox">
            <span>Email</span>
            <strong>{profile?.email ?? "未載入"}</strong>
            <p>{isAdmin ? "可管理使用者、客戶、機型與資料保留設定。" : "可執行裝機任務、設備更新與檢視營運中樞。"}</p>
          </div>
        </div>

        <div className="f66Panel">
          <div className="f66PanelHead">
            <div>
              <span className="f66Eyebrow">DEPLOYMENT GUARDS</span>
              <h2>部署守門</h2>
            </div>
            <StatusPill label="LOCAL FIRST" tone="good" />
          </div>
          <div className="f66GuardList">
            <div><b>Build</b><span>npm run build</span></div>
            <div><b>Version gate</b><span>npm run verify:version</span></div>
            <div><b>CI gate</b><span>GitHub Actions: Quality Gates</span></div>
            <div><b>Author</b><span>Perry &lt;cthperry@gmail.com&gt;</span></div>
            <div><b>Target</b><span>GitHub main → Vercel production</span></div>
          </div>
        </div>
      </section>

      <section className="f66Panel">
        <div className="f66PanelHead">
          <div>
            <span className="f66Eyebrow">VERSION SOURCE</span>
            <h2>唯一版本來源</h2>
          </div>
          <StatusPill label="LOCKED" tone="good" />
        </div>
        <div className="f66GuardList">
          <div><b>Source</b><span>package.json version = {appVersion}</span></div>
          <div><b>Generated UI</b><span>src/generated/appBuild.ts 由 sync:version 產生</span></div>
          <div><b>Public assets</b><span>public/version.json 與 public/sw.js 必須同版</span></div>
          <div><b>Lockfile</b><span>package-lock.json root version 必須同版</span></div>
        </div>
      </section>

      <section className="f66Panel">
        <div className="f66PanelHead">
          <div>
            <span className="f66Eyebrow">{releaseLabel} RELEASE NOTES</span>
            <h2>這版改了什麼</h2>
          </div>
        </div>
        <div className="f66ReleaseList">
          {releaseNotes.map((note, index) => (
            <div key={note}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="f66Panel">
        <div className="f66PanelHead">
          <div>
            <span className="f66Eyebrow">SYSTEM SCOPE</span>
            <h2>系統頁用途</h2>
          </div>
          <StatusPill label="ADMIN ENTRY" tone="info" />
        </div>
        <div className="f66GuardList">
          <div><b>版本</b><span>確認目前線上版號與 build date</span></div>
          <div><b>部署</b><span>主分支推送後由 Vercel production 接管</span></div>
          <div><b>治理</b><span>權限、客戶、機型與資料保留由 admin 選單進入</span></div>
        </div>
      </section>

      {isAdmin ? (
        <section className="f66Panel">
          <div className="f66PanelHead">
            <div>
              <span className="f66Eyebrow">IMPORT HEALTH</span>
              <h2>最近匯入紀錄</h2>
            </div>
            <StatusPill label={importSessions.some((row) => row.status === "failed") ? "CHECK" : "GOOD"} tone={importSessions.some((row) => row.status === "failed") ? "warning" : "good"} />
          </div>
          {importSessionErr ? (
            <div style={{ color: "#f59e0b", fontSize: 12 }}>匯入紀錄讀取失敗：{importSessionErr}</div>
          ) : (
            <div className="f66GuardList">
              {importSessions.map((row) => (
                <div key={row.id}>
                  <b>{row.fileName}</b>
                  <span>{row.status.toUpperCase()} · OK {row.acceptedRows} / Reject {row.rejectedRows} · {formatImportTime(row.createdAt)}</span>
                </div>
              ))}
              {importSessions.length === 0 ? <div><b>尚無紀錄</b><span>完成智慧匯入後會在這裡顯示 session history</span></div> : null}
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}
