"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { UNAUTHORIZED_EVENT } from "./api";

function subscribeToHash(callback: () => void): () => void {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

/** The part of the address after "#" (without it), updated when the visitor navigates. Empty on the server. */
export function useHash(): string {
  return useSyncExternalStore(
    subscribeToHash,
    () => decodeURIComponent(window.location.hash.slice(1)),
    () => "",
  );
}

export interface Loaded<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  reload: () => Promise<void>;
  /** Replace the data without a request (e.g. after a change whose result is already known). */
  setData: (data: T | null) => void;
}

/** Runs `load` when the component appears (and again on `reload`). */
export function useLoad<T>(load: () => Promise<T>): Loaded<T> {
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  // Always call the latest `load` (kept in a ref that is updated after each render).
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const reload = useCallback(async () => {
    try {
      const data = await loadRef.current();
      setState({ data, error: null, loading: false });
    } catch (error) {
      setState((previous) => ({ ...previous, error, loading: false }));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setData = useCallback((data: T | null) => setState((previous) => ({ ...previous, data })), []);
  return { ...state, reload, setData };
}

/**
 * While `active`, leaving the page asks first: closing or reloading it, and following a link to another section
 * of the same page (a "#..." link; the skip link to the main content is not leaving). Used while there are
 * things typed in that are not saved yet.
 */
export function useLeaveWarning(active: boolean, message: string): void {
  useEffect(() => {
    if (!active) return;
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href^='#']");
      if (!link || event.defaultPrevented || link.getAttribute("href") === "#main") return;
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [active, message]);
}

/** Calls `handler` when any API call was refused because the login expired. */
export function useUnauthorized(handler: () => void): void {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const listener = () => ref.current();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, listener);
  }, []);
}
