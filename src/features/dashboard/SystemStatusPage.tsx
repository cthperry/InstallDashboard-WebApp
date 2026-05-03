"use client";

import Link from "next/link";
import { useAuth } from "@/features/auth/AuthProvider";

const routeGroups = [
  {
    title: "每日營運",
    items: [
      { href: "/dashboard/warroom", label: "營運中樞", detail: "風險隊列、區域健康、角色入口" },
      { href: "/dashboard/install?view=pipeline", label: "任務流", detail: "裝機階段、逾期、工程師 owner" },
      { href: "/dashboard/equipment", label: "設備台帳", detail: "UPH、blocking、產品產能" },
    ],
  },
  {
    title: "治理與稽核",
    items: [
      { href: "/dashboard/insights", label: "洞察紀錄", detail: "分析、audit logs、events" },
      { href: "/admin/customer-sites", label: "客戶清單", detail: "客戶與區域 mapping" },
      { href: "/admin/machine-models", label: "機型設定", detail: "機型 code 與顯示名稱" },
      { href: "/admin/users", label: "使用者權限", detail: "admin / engineer role" },
    ],
  },
];

const releaseNotes = [
  "升級為 F66 裝機營運中樞，首頁不再只是指標牆，而是每日決策入口。",
  "營運中樞新增今日必處理、角色入口、區域健康圖、裝機階段瓶頸與產品產能排行。",
  "保留既有 Firebase CRUD 與資料結構，不破壞裝機、設備、admin 管理流程。",
  "新增系統版本頁，讓線上版本、路由分工與權限邊界可直接查核。",
];

function StatusPill({ label, tone }: { label: string; tone: "good" | "info" | "warning" }) {
  return <span className={`f66StatusPill f66StatusPill-${tone}`}>{label}</span>;
}

export function SystemStatusPage() {
  const { appVersion, profile, isAdmin } = useAuth();
  const buildDate = appVersion.slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");

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
            <span className="f66Eyebrow">F66 RELEASE NOTES</span>
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

      <section className="f66RouteMatrix">
        {routeGroups.map((group) => (
          <div key={group.title} className="f66Panel">
            <div className="f66PanelHead">
              <div>
                <span className="f66Eyebrow">ROUTE MAP</span>
                <h2>{group.title}</h2>
              </div>
            </div>
            <div className="f66RouteList">
              {group.items.map((item) => (
                <Link key={item.href} href={item.href} className="f66RouteItem">
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
