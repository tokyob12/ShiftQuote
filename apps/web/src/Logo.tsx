type MarkProps = {
  size?: number;
  className?: string;
};

export function Mark({ size = 28, className }: MarkProps) {
  return (
    <svg className={className ? `mark ${className}` : "mark"} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect className="mark-tile" x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="#1c241d" stroke="#2f3a2f" />
      <rect className="mark-low" x="4.5" y="18.6" width="15.5" height="3.4" rx="1.7" fill="#efe7d6" />
      <rect className="mark-high" x="12" y="10" width="15.5" height="3.4" rx="1.7" fill="#efe7d6" />
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
