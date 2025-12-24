import './ProgressBar.css';

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
    <div className="progress-bar-container">
      <div className="progress-bar-message">{message}</div>
      <div className="progress-bar-track">
        {indeterminate ? (
          <div className="progress-bar-fill progress-bar-indeterminate" />
        ) : (
          <div
            className="progress-bar-fill"
            style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
          />
        )}
      </div>
    </div>
  );
}
