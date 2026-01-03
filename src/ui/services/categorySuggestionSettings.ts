export interface CategorySuggestionSettings {
  useAI: boolean;
}

const STORAGE_KEY = 'categorySuggestionSettings';

const DEFAULT_SETTINGS: CategorySuggestionSettings = {
  useAI: true,
};

export interface CategorySuggestionSettingsOptions {
  allowAI?: boolean;
  defaultUseAI?: boolean;
}

export function loadCategorySuggestionSettings(
  options: CategorySuggestionSettingsOptions = {}
): CategorySuggestionSettings {
  const allowAI = options.allowAI ?? true;
  const defaultUseAI = options.defaultUseAI ?? DEFAULT_SETTINGS.useAI;
  const fallback = { useAI: allowAI ? defaultUseAI : false };

  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<CategorySuggestionSettings>;
    return {
      useAI:
        allowAI && typeof parsed.useAI === 'boolean'
          ? parsed.useAI
          : allowAI
            ? defaultUseAI
            : false,
    };
  } catch {
    return fallback;
  }
}

export function saveCategorySuggestionSettings(settings: CategorySuggestionSettings): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function getDefaultCategorySuggestionSettings(
  options: CategorySuggestionSettingsOptions = {}
): CategorySuggestionSettings {
  const allowAI = options.allowAI ?? true;
  const defaultUseAI = options.defaultUseAI ?? DEFAULT_SETTINGS.useAI;
  return { useAI: allowAI ? defaultUseAI : false };
}
