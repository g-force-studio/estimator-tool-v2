type IconProps = {
  className?: string;
};

export function HomeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1v-10.5z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ClipboardIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M9 3h6a2 2 0 0 1 2 2h2a1 1 0 0 1 1 1v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1h2a2 2 0 0 1 2-2zm0 2a1 1 0 0 0-1 1v1h8V6a1 1 0 0 0-1-1H9z"
        fill="currentColor"
      />
    </svg>
  );
}

export function DocumentIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
        fill="currentColor"
      />
      <path d="M14 3v5h5" fill="currentColor" />
    </svg>
  );
}

export function SettingsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm9 4a7.8 7.8 0 0 0-.1-1l2-1.6-2-3.4-2.4.9a7.7 7.7 0 0 0-1.7-1l-.3-2.5H10l-.3 2.5a7.7 7.7 0 0 0-1.7 1l-2.4-.9-2 3.4 2 1.6a7.8 7.8 0 0 0 0 2l-2 1.6 2 3.4 2.4-.9a7.7 7.7 0 0 0 1.7 1l.3 2.5h4.5l.3-2.5a7.7 7.7 0 0 0 1.7-1l2.4.9 2-3.4-2-1.6c.1-.3.1-.7.1-1z"
        fill="currentColor"
      />
    </svg>
  );
}

export function OfflineIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M2 6l2-2 18 18-2 2L2 6zm8.6 2.3a9 9 0 0 1 7.1 2.6l-1.5 1.5a7 7 0 0 0-4.1-1.8l-1.5-2.3zm-5.6-.3a13 13 0 0 1 5.6-1.2l1.5 2.3a11 11 0 0 0-5.1 1.5L5 8zM7 16l5-5 5 5-2 2-3-3-3 3-2-2z"
        fill="currentColor"
      />
    </svg>
  );
}

export function AlertIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 3l10 18H2L12 3zm0 6a1 1 0 0 0-1 1v4a1 1 0 1 0 2 0v-4a1 1 0 0 0-1-1zm0 9a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z"
        fill="currentColor"
      />
    </svg>
  );
}

export function PaperclipIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M8.5 12.5l6.4-6.4a3 3 0 0 1 4.2 4.2l-7.1 7.1a5 5 0 0 1-7.1-7.1l7.1-7.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
