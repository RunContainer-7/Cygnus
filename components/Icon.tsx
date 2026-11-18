import type { ReactNode } from "react";

export type IconName =
  | "apps"
  | "settings"
  | "library"
  | "templates"
  | "plugins"
  | "help"
  | "menu"
  | "panel"
  | "search"
  | "plus"
  | "star"
  | "starFilled"
  | "close"
  | "arrowUpRight"
  | "arrowRight"
  | "send"
  | "sparkles"
  | "folder"
  | "file"
  | "code"
  | "refresh"
  | "check"
  | "chevronDown"
  | "sliders"
  | "trash";

const PATHS: Record<IconName, ReactNode> = {
  apps: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.6" />
      <rect x="14" y="3" width="7" height="7" rx="1.6" />
      <rect x="3" y="14" width="7" height="7" rx="1.6" />
      <rect x="14" y="14" width="7" height="7" rx="1.6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V20.3h-3v-.08A1.7 1.7 0 0 0 10.68 18.66a1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7.02 15a1.7 1.7 0 0 0-1.56-1.03H5.4v-3h.06A1.7 1.7 0 0 0 7.02 9.94a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.12-2.12.06.06A1.7 1.7 0 0 0 10.68 6.3 1.7 1.7 0 0 0 11.71 4.74V4.7h3v.04A1.7 1.7 0 0 0 15.74 6.3a1.7 1.7 0 0 0 1.88-.36l.06-.06 2.12 2.12-.06.06A1.7 1.7 0 0 0 19.4 9.94a1.7 1.7 0 0 0 1.56 1.03h.04v3h-.04A1.7 1.7 0 0 0 19.4 15Z" />
    </>
  ),
  library: (
    <>
      <path d="M4 19.4V5.5A2.5 2.5 0 0 1 6.5 3H20v17.2H6.6A2.6 2.6 0 0 0 4 22.8" />
      <path d="M4 19.4A2.6 2.6 0 0 1 6.6 17H20" />
      <path d="M8.5 3v14" />
    </>
  ),
  templates: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <path d="M3 9h18M9 21V9" />
    </>
  ),
  plugins: (
    <>
      <path d="M9 3v5M15 3v5" />
      <path d="M6.5 8h11v4.5a5.5 5.5 0 0 1-11 0Z" />
      <path d="M12 18v3" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.3 9a2.8 2.8 0 1 1 4.6 2.1c-.8.7-1.9 1.2-1.9 2.6" />
      <circle cx="12" cy="17.4" r=".7" fill="currentColor" stroke="none" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  panel: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  star: <path d="m12 3 2.7 5.6 6.3.9-4.6 4.4 1.1 6.1-5.5-2.9L6.5 20l1.1-6.1L3 9.5l6.3-.9Z" />,
  starFilled: (
    <path
      d="m12 3 2.7 5.6 6.3.9-4.6 4.4 1.1 6.1-5.5-2.9L6.5 20l1.1-6.1L3 9.5l6.3-.9Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  arrowUpRight: <path d="M7 17 17 7M8 7h9v9" />,
  arrowRight: <path d="M4 12h16M14 6l6 6-6 6" />,
  send: (
    <>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" />
      <path d="m19 16 .9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9Z" />
    </>
  ),
  folder: (
    <>
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H9l2 2h7.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5Z" />
      <path d="M3 9h18" />
    </>
  ),
  file: (
    <>
      <path d="M6 2.8h7l5 5V21H6Z" />
      <path d="M13 2.8v5h5" />
    </>
  ),
  code: <path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 4l-4 16" />,
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14.6-4L3 10" />
      <path d="M3 4v6h6" />
      <path d="M4 13a8 8 0 0 0 14.6 4L21 14" />
      <path d="M21 20v-6h-6" />
    </>
  ),
  check: <path d="m5 12 4.5 4.5L19 6.5" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  trash: (
    <>
      <path d="M4 7h16M10 4h4M9 7v12M15 7v12" />
      <path d="M6 7h12l-1 13H7Z" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h5M15 6h5M4 12h10M18 12h2M4 18h2M10 18h10" />
      <circle cx="12" cy="6" r="2" />
      <circle cx="16" cy="12" r="2" />
      <circle cx="8" cy="18" r="2" />
    </>
  ),
};

export default function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
