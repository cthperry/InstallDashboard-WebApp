"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function LoginPage() {
  const { user, signInWithEmail, signInWithGoogle, signOutNow, loading, appVersion } = useAuth();
  const router = useRouter();
  const [err, setErr] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [working, setWorking] = useState<boolean>(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    setWorking(true);
    try {
      await signInWithEmail(email, password);
    } catch (e: any) {
      const code = String(e?.code || "");
      const msg =
        code === "auth/invalid-credential" || code === "auth/wrong-password" ? "Email 或密碼錯誤" :
        code === "auth/user-not-found" ? "找不到此帳號（請確認是否已在 Firebase 建立使用者）" :
        code === "auth/invalid-email" ? "Email 格式不正確" :
        code === "auth/too-many-requests" ? "嘗試次數過多，請稍後再試" :
        (e?.message || "登入失敗");
      setErr(msg);
    } finally {
      setWorking(false);
    }
  };

  const onGoogle = async () => {
    setErr("");
    setWorking(true);
    try {
      await signInWithGoogle();
    } catch (e: any) {
      const code = String(e?.code || "");
      const msg =
        code === "auth/popup-closed-by-user" ? "你已關閉登入視窗" :
        code === "auth/cancelled-popup-request" ? "登入流程已取消" :
        code === "auth/account-exists-with-different-credential" ? "此 Email 已用其他方式登入過，請改用原登入方式" :
        (e?.message || "Google 登入失敗");
      setErr(msg);
    } finally {
      setWorking(false);
    }
  };

  const busy = loading || working;

  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);

  return (
    <main className="loginDeck">
      <div className="loginDeckShell">
        <section className="loginStory" aria-label="系統定位">
          <div className="loginBrandRow">
            <div className="loginMark">IO</div>
            <div>
              <div className="loginKicker">INSTALL OPERATIONS F66</div>
              <div className="loginVersion">Premtek 內部系統 · v{appVersion}</div>
            </div>
          </div>

          <div className="loginStoryCopy">
            <h1>把裝機現場、設備產能與資料治理，收斂成一個每天可執行的營運中樞。</h1>
            <p>
              F66 入口直接對齊工作節奏：先判斷今日風險，再派工與回寫，最後檢查版本、權限與資料完整度。
            </p>
          </div>

          <div className="loginSignalGrid" aria-label="核心能力">
            <div>
              <span>01</span>
              <strong>任務流</strong>
              <small>逾期、到期、未更新案件自動排入指揮隊列</small>
            </div>
            <div>
              <span>02</span>
              <strong>設備產能</strong>
              <small>blocking、UPH、target UPH 與產品產能集中追蹤</small>
            </div>
            <div>
              <span>03</span>
              <strong>版本治理</strong>
              <small>版本、角色、部署守門與 admin 後台一頁查核</small>
            </div>
          </div>

          <div className="loginFlightPath" aria-hidden>
            <div><span>Ops Control</span><b>Decision queue</b></div>
            <div><span>Mission Flow</span><b>Phase ownership</b></div>
            <div><span>System</span><b>Release guard</b></div>
          </div>
        </section>

        <Card className="loginPanel py-0">
          <CardHeader className="loginPanelHeader">
            <CardTitle className="loginPanelTitle">登入 F66 營運中樞</CardTitle>
            <div className="loginPanelSub">使用公司帳號進入裝機、設備與資料治理平台</div>
          </CardHeader>
          <CardContent className="loginPanelBody">
            {user ? (
              <div className="loginSignedIn">
                <div className="loginSignedInLabel">目前已登入</div>
                <div className="loginSignedInEmail">{user.email}</div>
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => router.replace("/dashboard/warroom")}>
                    前往營運中樞
                  </Button>
                  <Button variant="secondary" onClick={signOutNow}>
                    登出
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="loginGoogleButton w-full"
                  onClick={onGoogle}
                  disabled={busy}
                >
                  <span className="mr-2 inline-flex size-4 items-center justify-center" aria-hidden>
                    <svg viewBox="0 0 48 48" className="size-4">
                      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.654 32.656 29.223 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.047 6.053 29.269 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.651-.389-3.917z"/>
                      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 16.108 19.008 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.047 6.053 29.269 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.197l-6.191-5.238C29.195 35.091 26.715 36 24 36c-5.202 0-9.615-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
                      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.06 12.06 0 0 1-4.085 5.565l.003-.002 6.191 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.651-.389-3.917z"/>
                    </svg>
                  </span>
                  {busy ? "登入中..." : "使用 Google 登入"}
                </Button>

                <div className="flex items-center gap-3">
                  <Separator className="flex-1" />
                  <span className="text-xs text-muted-foreground">或使用 Email</span>
                  <Separator className="flex-1" />
                </div>

                <form className="space-y-4" onSubmit={onSubmit}>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      placeholder="name@premtek.com.tw"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={busy}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">密碼</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={busy}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "登入中..." : "使用 Email/密碼登入"}
                  </Button>
                </form>
              </>
            )}

            {err ? (
              <Alert variant="destructive">
                <AlertDescription>{err}</AlertDescription>
              </Alert>
            ) : null}

            <div className="loginTrustNote">
              僅限 <span>@premtek.com.tw</span> 帳號；資料權限以 Firestore Rules 為準。
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
