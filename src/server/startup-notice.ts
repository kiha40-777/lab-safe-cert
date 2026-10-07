export interface StartupNotice {
  generatedAdminPassword: string | null;
  resetIgnored: boolean;
  participantPasswordSet: boolean;
  /** Where the data is kept (a folder or a Turso database). */
  location: string;
}

/** Prints the first-start information (server log / terminal). */
export function printStartupNotice(info: StartupNotice): void {
  const lines: string[] = [];
  if (info.generatedAdminPassword) {
    lines.push(
      "",
      "==================================================================",
      "  lab-safe-cert: ADMIN PASSWORD (shown only this once)",
      "  管理者パスワード（この1回だけ表示されます）",
      "",
      `      ${info.generatedAdminPassword}`,
      "",
      "  Write it down. Log in at /admin, then open Settings to change it.",
      "  If it is lost, restart with:  npm start -- --reset-admin-password",
      "  (on a hosting service: set LSC_RESET_ADMIN_PASSWORD=1 for one start)",
      "==================================================================",
      "",
    );
  }
  if (info.resetIgnored) {
    lines.push(
      "[lab-safe-cert] ADMIN_PASSWORD is set, so the password reset was ignored.",
      "                Change or remove ADMIN_PASSWORD instead.",
    );
  }
  if (!info.participantPasswordSet) {
    lines.push(
      "[lab-safe-cert] The participant password is not set yet. Log in at /admin and open",
      "                Settings to create it; participants cannot log in before that.",
    );
  }
  lines.push(`[lab-safe-cert] ${info.location}`);
  console.log(lines.join("\n"));
}
