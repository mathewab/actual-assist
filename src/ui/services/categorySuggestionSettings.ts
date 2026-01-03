export interface CategorySuggestionSettings {
  useAI: boolean;
}

const STORAGE_KEY = 'categorySuggestionSettings';

const DEFAULT_SETTINGS: CategorySuggestionSettings = {
  useAI: true,
};

export function loadCategorySuggestionSettings(): CategorySuggestionSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<CategorySuggestionSettings>;
    return {
      useAI: typeof parsed.useAI === 'boolean' ? parsed.useAI : DEFAULT_SETTINGS.useAI,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveCategorySuggestionSettings(settings: CategorySuggestionSettings): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function getDefaultCategorySuggestionSettings(): CategorySuggestionSettings {
  return DEFAULT_SETTINGS;
}
