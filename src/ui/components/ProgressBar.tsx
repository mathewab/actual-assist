interface ProgressBarProps {
  /** Message to display above the progress bar */
  message?: string;
  /** Whether the progress is indeterminate (animated) */
  indeterminate?: boolean;
  /** Progress value between 0 and 100 (for determinate progress) */
  value?: number;
}

/**
 * A progress bar component for showing loading states
 * during sync and OpenAI operations
 */
export function ProgressBar({
  message = 'Processing...',
  indeterminate = true,
  value = 0,
}: ProgressBarProps) {
  return (
    <div className="my-4 rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 to-fuchsia-50 px-5 py-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-700">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        {message}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-blue-100">
        {indeterminate ? (
          <div className="h-full w-1/3 animate-[indeterminate_1.5s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-blue-600 to-indigo-400" />
        ) : (
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-400 transition-[width] duration-300"
            style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
          />
        )}
      </div>
    </div>
  );
}
