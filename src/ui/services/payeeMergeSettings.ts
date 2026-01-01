export interface PayeeMergeSettings {
  minScore: number;
  useAI: boolean;
  aiMinClusterSize: number;
}

const STORAGE_KEY = 'payeeMergeSettings';

const DEFAULT_SETTINGS: PayeeMergeSettings = {
  minScore: 92,
  useAI: false,
  aiMinClusterSize: 5,
};

export function loadPayeeMergeSettings(): PayeeMergeSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<PayeeMergeSettings>;
    return {
      minScore:
        typeof parsed.minScore === 'number' && Number.isFinite(parsed.minScore)
          ? Math.max(0, Math.min(100, parsed.minScore))
          : DEFAULT_SETTINGS.minScore,
      useAI: typeof parsed.useAI === 'boolean' ? parsed.useAI : DEFAULT_SETTINGS.useAI,
      aiMinClusterSize:
        typeof parsed.aiMinClusterSize === 'number' && Number.isFinite(parsed.aiMinClusterSize)
          ? Math.max(2, Math.floor(parsed.aiMinClusterSize))
          : DEFAULT_SETTINGS.aiMinClusterSize,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function savePayeeMergeSettings(settings: PayeeMergeSettings): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function getDefaultPayeeMergeSettings(): PayeeMergeSettings {
  return DEFAULT_SETTINGS;
}
