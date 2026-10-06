/**
 * The download icon, drawn like the icons of the admin sidebar: no icon package or image file,
 * and it takes the colour of the text around it. Decorative: the button always has a text label.
 */
export function DownloadIcon() {
  return (
    <svg
      className="btn-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      <path d="M7 11l5 5 5-5" />
      <path d="M12 4v12" />
    </svg>
  );
}
