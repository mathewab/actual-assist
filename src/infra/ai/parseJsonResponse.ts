import JSON5 from 'json5';

/**
 * Parse JSON from LLM response (handles markdown code blocks)
 * Shared utility used by all AI adapters
 */
export function parseJsonResponse<T>(content: string): T {
  const trimmed = content.trim();

  // Strip common markdown code fences with optional language (case-insensitive)
  // Matches: ```json\n...``` or ```JSON\n...``` or ```anything\n...```
  const fencedMatch = trimmed.match(/```[^\n]*\n([\s\S]*?)```/i);
  const candidate = fencedMatch && fencedMatch[1] ? fencedMatch[1].trim() : trimmed;

  const tryParse = (value: string): T | null => {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  };
  const tryParseJson5 = (value: string): T | null => {
    try {
      return JSON5.parse(value) as T;
    } catch {
      return null;
    }
  };

  const removeTrailingCommas = (value: string): string => value.replace(/,\s*([}\]])/g, '$1');

  const attemptParse = (value: string): T | null => {
    return (
      tryParse(value) ??
      tryParse(removeTrailingCommas(value)) ??
      tryParse(removeTrailingCommas(value.trim())) ??
      tryParseJson5(value) ??
      tryParseJson5(removeTrailingCommas(value)) ??
      tryParseJson5(removeTrailingCommas(value.trim()))
    );
  };

  const firstPass = attemptParse(candidate);
  if (firstPass) return firstPass;

  // Best-effort recovery for incomplete fences or extra text
  const withoutLeadingFence = candidate.replace(/^```[^\n]*\n?/i, '').replace(/```$/i, '');
  const secondPass = attemptParse(withoutLeadingFence);
  if (secondPass) return secondPass;

  const jsonObjectStart = withoutLeadingFence.indexOf('{');
  const jsonObjectEnd = withoutLeadingFence.lastIndexOf('}');
  if (jsonObjectStart !== -1 && jsonObjectEnd !== -1 && jsonObjectEnd > jsonObjectStart) {
    const sliced = withoutLeadingFence.slice(jsonObjectStart, jsonObjectEnd + 1);
    const parsed = attemptParse(sliced);
    if (parsed) return parsed;
  }

  const jsonArrayStart = withoutLeadingFence.indexOf('[');
  const jsonArrayEnd = withoutLeadingFence.lastIndexOf(']');
  if (jsonArrayStart !== -1 && jsonArrayEnd !== -1 && jsonArrayEnd > jsonArrayStart) {
    const sliced = withoutLeadingFence.slice(jsonArrayStart, jsonArrayEnd + 1);
    const parsed = attemptParse(sliced);
    if (parsed) return parsed;
  }

  throw new Error('Failed to parse JSON response');
}
