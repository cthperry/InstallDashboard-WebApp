import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// 注意：Next.js 在 bundle 時只會針對「靜態」process.env.NEXT_PUBLIC_* 存取做替換/注入。
// 不可使用 process.env[name] 這種動態 bracket notation（Turbopack/Webpack 無法正確注入）。
const NEXT_PUBLIC_FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const NEXT_PUBLIC_FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
const NEXT_PUBLIC_FIREBASE_APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

function assertEnv(name: string, value?: string): string {
  if (!value) {
    throw new Error(`缺少環境變數：${name}（請在 web/.env.local 或部署平台環境變數設定）`);
  }
  return value;
}

export function getFirebaseApp(): FirebaseApp {
  if (getApps().length) return getApps()[0]!;
  const app = initializeApp({
    apiKey: assertEnv("NEXT_PUBLIC_FIREBASE_API_KEY", NEXT_PUBLIC_FIREBASE_API_KEY),
    authDomain: assertEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    projectId: assertEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    storageBucket: assertEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: assertEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
    appId: assertEnv("NEXT_PUBLIC_FIREBASE_APP_ID", NEXT_PUBLIC_FIREBASE_APP_ID)
  });
  return app;
}

export const firebaseApp = getFirebaseApp();
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
