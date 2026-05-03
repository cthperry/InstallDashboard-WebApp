"use client";

import { useAuth } from "@/features/auth/AuthProvider";
import { getAppReleaseLabel } from "@/config/appVersion";

function buildReleaseNotes(releaseLabel: string): string[] {
  return [
    `${releaseLabel} 將主模式收斂為「營運中樞、任務流、設備台帳、洞察」四個入口，系統頁退回 admin 管理選單。`,
    "任務流預設進 Pipeline，表格改為資料維護視圖，降低重複檢視與誤操作。",
    "裝機表與設備台帳改用固定欄寬與左右 sticky 欄，機台序號、客戶、預計安裝日與操作區不再互相擠壓。",
    "移除一次性 cleanup route，並補上智慧匯入批次寫入上限檢查，避免 production 直接暴露破壞性工具。",
  ];
}

function StatusPill({ label, tone }: { label: string; tone: "good" | "info" | "warning" }) {
  return <span className={`f66StatusPill f66StatusPill-${tone}`}>{label}</span>;
}

export function SystemStatusPage() {
  const { appVersion, profile, isAdmin } = useAuth();
  const releaseLabel = getAppReleaseLabel(appVersion);
  const buildDate = appVersion.slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
  const releaseNotes = buildReleaseNotes(releaseLabel);

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
            <div><b>Author</b><span>Perry &lt;cthperry@gmail.com&gt;</span></div>
            <div><b>Target</b><span>GitHub main → Vercel production</span></div>
          </div>
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
    </main>
  );
}
