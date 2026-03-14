"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Toast 提示 hook — 統一管理 toast 狀態與計時器
 */
export function useToast() {
  const [toast, setToast] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const showToast = useCallback((msg: string, duration = 3000) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast(msg);
    timerRef.current = setTimeout(() => setToast(""), duration);
  }, []);

  return { toast, showToast };
}
