// Lightweight inline SVG icon set (Lucide-style, 1.5px stroke, currentColor).
// Real SVG paths — NOT emoji/text glyphs — per pro UI guidelines.
// Each accepts a className for sizing/color.

interface IconProps {
  className?: string;
}

function base(children: React.ReactNode, className?: string) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconBuilding({ className }: IconProps) {
  return base(
    <>
      <path d="M3 21h18" />
      <path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" />
      <path d="M19 21V11a2 2 0 0 0-2-2h-2" />
      <path d="M9 7h2M9 11h2M9 15h2" />
    </>,
    className,
  );
}

export function IconUsers({ className }: IconProps) {
  return base(
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>,
    className,
  );
}

export function IconActivity({ className }: IconProps) {
  return base(<path d="M22 12h-4l-3 9L9 3l-3 9H2" />, className);
}

export function IconLayers({ className }: IconProps) {
  return base(
    <>
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </>,
    className,
  );
}

export function IconPlus({ className }: IconProps) {
  return base(
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>,
    className,
  );
}

export function IconArrowRight({ className }: IconProps) {
  return base(
    <>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </>,
    className,
  );
}

export function IconTerminal({ className }: IconProps) {
  return base(
    <>
      <path d="m4 17 6-6-6-6" />
      <path d="M12 19h8" />
    </>,
    className,
  );
}

export function IconBox({ className }: IconProps) {
  return base(
    <>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </>,
    className,
  );
}
