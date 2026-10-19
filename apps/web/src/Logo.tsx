type MarkProps = {
  size?: number;
};

export function Mark({ size = 28 }: MarkProps) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#1c241d" />
      <rect x="4" y="19" width="16" height="3.2" rx="1.6" fill="#efe7d6" />
      <rect x="12" y="10" width="16" height="3.2" rx="1.6" fill="#efe7d6" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="logo">
      <Mark />
      <span className="logo-word">Shift</span>
    </span>
  );
}
