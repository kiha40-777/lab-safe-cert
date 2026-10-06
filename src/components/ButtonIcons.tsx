import type { ReactNode } from "react";

// Icons for buttons, drawn like the icons of the admin sidebar: no icon package or image file, and they
// take the colour of the text around them. They are decorative: a button always has a text label.

// Most icons are drawn on a 24 x 24 grid with a stroke of 1.8. An icon drawn on another grid says so: its
// coordinates and stroke stay as they were drawn, and it is shown at the same size (16px) as the others.
function ButtonIcon({
  children,
  viewBox = "0 0 24 24",
  strokeWidth = "1.8",
}: {
  children: ReactNode;
  viewBox?: string;
  strokeWidth?: string;
}) {
  return (
    <svg
      className="btn-icon"
      viewBox={viewBox}
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <ButtonIcon>
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      <path d="M7 11l5 5 5-5" />
      <path d="M12 4v12" />
    </ButtonIcon>
  );
}

/** A box with an arrow leaving it: the link opens somewhere else (a new tab). */
export function ExternalLinkIcon() {
  return (
    <ButtonIcon>
      <path d="M12 6h-6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
      <path d="M11 13l9-9" />
      <path d="M15 4h5v5" />
    </ButtonIcon>
  );
}

/** A door with an arrow leaving it. */
export function LogoutIcon() {
  return (
    <ButtonIcon>
      <path d="M14 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2" />
      <path d="M9 12h12l-3-3" />
      <path d="M18 15l3-3" />
    </ButtonIcon>
  );
}

/** A sheet of paper with a folded corner and the letters PDF. */
export function PdfFileIcon() {
  return (
    <ButtonIcon>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M5 12v-7a2 2 0 0 1 2-2h7l5 5v4" />
      <path d="M5 18h1.5a1.5 1.5 0 0 0 0-3h-1.5v6" />
      <path d="M17 18h2" />
      <path d="M20 15h-3v6" />
      <path d="M11 15v6h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-1" />
    </ButtonIcon>
  );
}

/** A sheet of paper with a folded corner and the letters JSON (drawn on a 26.91 grid with a stroke of 2). */
export function JsonFileIcon() {
  return (
    <ButtonIcon viewBox="0 0 26.91 26.91" strokeWidth="2">
      <path d="M15.7,3.36v4.48c0,.62.5,1.12,1.12,1.12h4.48" />
      <path d="M5.61,13.45v-7.85c0-1.24,1-2.24,2.24-2.24h7.85l5.61,5.61v4.48" />
      <path d="M19.64,22.88v-6.19l2.32,6.19v-6.19" />
      <path d="M15.77,16.7c.85,0,1.55.69,1.55,1.55v3.09c0,.85-.69,1.55-1.55,1.55s-1.55-.69-1.55-1.55v-3.09c0-.85.69-1.55,1.55-1.55" />
      <path d="M4.95,16.7h2.32v5.03c0,.64-.52,1.16-1.16,1.16s-1.16-.52-1.16-1.16h0v-.39" />
      <path d="M9.59,22.11c0,.43.35.77.77.77h.77c.43,0,.77-.35.77-.77v-1.55c0-.43-.35-.77-.77-.77h-.77c-.43,0-.77-.35-.77-.77v-1.55c0-.43.35-.77.77-.77h.77c.43,0,.77.35.77.77" />
    </ButtonIcon>
  );
}

/** A waste bin. */
export function TrashIcon() {
  return (
    <ButtonIcon>
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7v-3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
    </ButtonIcon>
  );
}
