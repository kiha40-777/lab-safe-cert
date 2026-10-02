import type { ReactNode } from "react";

export type NoticeKind = "info" | "success" | "warning" | "danger";

/** A highlighted message. Errors are announced immediately by screen readers, other kinds politely. */
export function Notice({ kind = "info", children, className = "" }: { kind?: NoticeKind; children: ReactNode; className?: string }) {
  return (
    <div className={`notice notice-${kind} ${className}`.trim()} role={kind === "danger" ? "alert" : "status"}>
      {children}
    </div>
  );
}
