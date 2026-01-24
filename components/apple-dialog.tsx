import React from 'react';

type AppleDialogProps = {
  open: boolean;
  title?: string;
  message: string;
  inputValue?: string;
  inputPlaceholder?: string;
  primaryLabel: string;
  secondaryLabel?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
  onInputChange?: (value: string) => void;
};

export default function AppleDialog({
  open,
  title,
  message,
  inputValue,
  inputPlaceholder,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
  onInputChange,
}: AppleDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-sm rounded-2xl border border-white/30 bg-white/90 p-6 text-center shadow-2xl dark:border-white/10 dark:bg-gray-900/90"
      >
        {title && (
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
        )}
        <p className={`text-sm text-gray-700 dark:text-gray-200 ${title ? 'mt-2' : ''}`}>
          {message}
        </p>
        {onInputChange && (
          <input
            type="text"
            value={inputValue ?? ''}
            onChange={(event) => onInputChange(event.target.value)}
            placeholder={inputPlaceholder}
            className="mt-4 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
        )}
        <div className="mt-5 flex flex-col gap-2">
          {secondaryLabel && onSecondary && (
            <button
              type="button"
              onClick={onSecondary}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
            >
              {secondaryLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onPrimary}
            className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
