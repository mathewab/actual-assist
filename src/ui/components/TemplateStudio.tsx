import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, type CategoryTemplateSummary } from '../services/api';
import {
  buildNoteFromExisting,
  extractTemplateComments,
  type TemplateEntry,
} from './templateNotes';
import './TemplateStudio.css';

interface TemplateStudioProps {
  budgetId: string;
}

type TemplateType =
  | 'simple'
  | 'percentage'
  | 'periodic'
  | 'by'
  | 'spend'
  | 'schedule'
  | 'average'
  | 'copy'
  | 'remainder'
  | 'limit'
  | 'goal';

type LimitPeriod = 'daily' | 'weekly' | 'monthly';
type RepeatPeriod = 'day' | 'week' | 'month' | 'year';
type RepeatUnit = 'month' | 'year' | '';

interface AutocompleteOption {
  value: string;
  label: string;
}

const commentHasBlankLine = (comment: string) => {
  const lines = comment.split('\n');
  return lines.some((line) => line.trim() === '');
};

const isValidDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map((part) => Number(part));
  if (!year || !month || !day) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
};

const isValidMonth = (value: string) => {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month] = value.split('-').map((part) => Number(part));
  return Boolean(year) && month >= 1 && month <= 12;
};

interface TemplateDraft {
  id: string;
  type: TemplateType;
  sourceIndex: number | null;
  priority: string;
  monthly: string;
  amount: string;
  percent: string;
  previous: boolean;
  category: string;
  periodAmount: string;
  periodUnit: RepeatPeriod;
  starting: string;
  month: string;
  repeat: string;
  repeatUnit: RepeatUnit;
  from: string;
  name: string;
  full: boolean;
  adjustment: string;
  numMonths: string;
  lookBack: string;
  weight: string;
  limitAmount: string;
  limitHold: boolean;
  limitPeriod: LimitPeriod;
  limitStart: string;
  limitEnabled: boolean;
  comment: string;
}

const makeId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tmpl_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const createDraft = (type: TemplateType): TemplateDraft => ({
  id: makeId(),
  type,
  sourceIndex: null,
  priority: '0',
  monthly: '',
  amount: '',
  percent: '',
  previous: false,
  category: '',
  periodAmount: '1',
  periodUnit: 'month',
  starting: '',
  month: '',
  repeat: '',
  repeatUnit: '',
  from: '',
  name: '',
  full: false,
  adjustment: '',
  numMonths: '3',
  lookBack: '1',
  weight: '',
  limitAmount: '',
  limitHold: false,
  limitPeriod: 'monthly',
  limitStart: '',
  limitEnabled: false,
  comment: '',
});

const toDraft = (template: Record<string, unknown>): TemplateDraft => {
  const type = (template.type as TemplateType) || 'simple';
  const draft = createDraft(type);
  draft.priority =
    template.priority === null || template.priority === undefined ? '' : String(template.priority);
  draft.amount = template.amount !== undefined ? String(template.amount) : '';
  draft.monthly = template.monthly !== undefined ? String(template.monthly) : '';
  draft.percent = template.percent !== undefined ? String(template.percent) : '';
  draft.previous = Boolean(template.previous);
  draft.category = typeof template.category === 'string' ? template.category : '';
  draft.periodAmount =
    template.period && typeof template.period === 'object'
      ? String((template.period as { amount?: number }).amount ?? '1')
      : '1';
  draft.periodUnit =
    template.period && typeof template.period === 'object'
      ? ((template.period as { period?: RepeatPeriod }).period ?? 'month')
      : 'month';
  draft.starting = typeof template.starting === 'string' ? template.starting : '';
  draft.month = typeof template.month === 'string' ? template.month : '';
  draft.repeat = template.repeat !== undefined ? String(template.repeat) : '';
  if (template.annual !== undefined) {
    draft.repeatUnit = template.annual ? 'year' : 'month';
    draft.repeat = template.repeat !== undefined ? String(template.repeat) : '';
  } else if (template.repeat !== undefined) {
    draft.repeatUnit = 'month';
    draft.repeat = String(template.repeat);
  }
  draft.from = typeof template.from === 'string' ? template.from : '';
  draft.name = typeof template.name === 'string' ? template.name : '';
  draft.full = Boolean(template.full);
  draft.adjustment = template.adjustment !== undefined ? String(template.adjustment) : '';
  draft.numMonths = template.numMonths !== undefined ? String(template.numMonths) : '3';
  draft.lookBack = template.lookBack !== undefined ? String(template.lookBack) : '1';
  draft.weight = template.weight !== undefined ? String(template.weight) : '';
  if (template.limit && typeof template.limit === 'object') {
    const limit = template.limit as {
      amount?: number;
      hold?: boolean;
      period?: LimitPeriod;
      start?: string;
    };
    draft.limitAmount = limit.amount !== undefined ? String(limit.amount) : '';
    draft.limitHold = Boolean(limit.hold);
    draft.limitPeriod = limit.period ?? 'monthly';
    draft.limitStart = limit.start ?? '';
    draft.limitEnabled = true;
  }
  if (type === 'limit') {
    draft.limitAmount = template.amount !== undefined ? String(template.amount) : '';
    draft.limitHold = Boolean(template.hold);
    draft.limitPeriod =
      typeof template.period === 'string' ? (template.period as LimitPeriod) : 'monthly';
    draft.limitStart = typeof template.start === 'string' ? template.start : '';
    draft.limitEnabled = true;
  }
  draft.comment = '';
  return draft;
};

const emptyTemplates: TemplateDraft[] = [];

export function TemplateStudio({ budgetId }: TemplateStudioProps) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['templates', budgetId],
    queryFn: () => api.listCategoryTemplates(),
    enabled: !!budgetId,
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.getCategories(),
    enabled: !!budgetId,
  });

  const { data: schedulesData } = useQuery({
    queryKey: ['schedules'],
    queryFn: () => api.listSchedules(),
    enabled: !!budgetId,
  });

  const templates = data?.templates ?? [];
  const [filterText, setFilterText] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<TemplateDraft[]>(emptyTemplates);
  const [renderedValue, setRenderedValue] = useState('');
  const [editorError, setEditorError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
  const [newTemplateType, setNewTemplateType] = useState<TemplateType>('simple');
  const lastRenderedPayload = useRef<string>('');
  const renderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasUserEditsRef = useRef(false);
  const [applyStatus, setApplyStatus] = useState<{ message: string; isError: boolean } | null>(
    null
  );

  const activeCategory = templates.find((item) => item.id === activeCategoryId) ?? null;
  const activeTemplateEntries = (activeCategory?.templates ?? []) as TemplateEntry[];
  const managedTemplateEntries = activeTemplateEntries.filter((entry) => entry.type !== 'error');

  const loadCategory = (category: CategoryTemplateSummary | null) => {
    if (!category) {
      setDrafts(emptyTemplates);
      setRenderedValue('');
      setEditorError(null);
      setApplyStatus(null);
      return;
    }

    const templateEntries = (category.templates ?? []) as TemplateEntry[];
    const managedEntries = templateEntries.filter((entry) => entry.type !== 'error');
    const baseDrafts =
      managedEntries.length > 0
        ? managedEntries.map((template, index) => {
            const draft = toDraft(template);
            draft.sourceIndex = index;
            return draft;
          })
        : emptyTemplates;
    const comments = extractTemplateComments(category.note ?? null, templateEntries);
    const nextDrafts = baseDrafts.map((draft, index) => ({
      ...draft,
      comment: comments[index] ?? '',
    }));
    setDrafts(nextDrafts);
    hasUserEditsRef.current = false;
    lastRenderedPayload.current = '';
    setRenderedValue('');
    setEditorError(category.parseError);
    setApplyStatus(null);
  };

  const effectiveFilterText = window.innerWidth <= 960 ? '' : filterText;
  const filteredTemplates = useMemo(() => {
    const normalized = effectiveFilterText.trim().toLowerCase();
    const list = data?.templates ?? [];
    if (!normalized) {
      return list;
    }
    return list.filter((item) => {
      const name = item.name.toLowerCase();
      const group = item.groupName?.toLowerCase() ?? '';
      return name.includes(normalized) || group.includes(normalized);
    });
  }, [data?.templates, effectiveFilterText]);

  const renderMutation = useMutation({
    mutationFn: (templatesToRender: Record<string, unknown>[]) =>
      api.renderNoteTemplates(templatesToRender),
    onSuccess: (response) => {
      setRenderedValue(response.rendered);
      setEditorError(null);
    },
    onError: (err) => {
      setEditorError(err instanceof Error ? err.message : 'Failed to render templates');
    },
  });

  const applyMutation = useMutation({
    mutationFn: (payload: { categoryId: string; note: string | null }) =>
      api.applyCategoryNote(payload.categoryId, payload.note, true),
    onSuccess: (response) => {
      if (response.check.pre) {
        setApplyStatus({
          message: `${response.check.message}\n${response.check.pre}\nRolled back changes.`,
          isError: true,
        });
      } else {
        setApplyStatus({
          message: response.synced
            ? 'Templates checked and synced successfully.'
            : response.check.message,
          isError: false,
        });
      }
      refetch().then((result) => {
        if (activeCategoryId && result.data) {
          const nextCategory = result.data.templates.find((item) => item.id === activeCategoryId);
          if (nextCategory) {
            loadCategory(nextCategory);
          }
        }
      });
    },
    onError: (error) => {
      setApplyStatus({
        message: error instanceof Error ? error.message : 'Failed to apply notes',
        isError: true,
      });
    },
  });

  const parseNumber = (label: string, value: string, errors: string[]) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed)) {
      errors.push(`${label} must be a number`);
      return null;
    }
    return parsed;
  };

  const buildTemplates = () => {
    const errors: string[] = [];
    const output: Record<string, unknown>[] = [];

    drafts.forEach((draft, index) => {
      const label = `Template ${index + 1}`;
      if (draft.comment && commentHasBlankLine(draft.comment)) {
        errors.push(`${label}: label/comment cannot contain blank lines`);
      }
      const priority = draft.priority.trim();
      const priorityValue = priority ? parseNumber(`${label}: priority`, priority, errors) : null;

      const base: Record<string, unknown> = {
        type: draft.type,
        directive: draft.type === 'goal' ? 'goal' : 'template',
      };

      if (draft.type !== 'goal' && draft.type !== 'remainder' && draft.type !== 'limit') {
        if (priority) {
          base.priority = priorityValue;
        }
      }

      const amount = draft.amount.trim();
      const monthly = draft.monthly.trim();
      const percent = draft.percent.trim();
      const limitAmountValue = parseNumber(`${label}: limit amount`, draft.limitAmount, errors);
      const limitStartValue = draft.limitStart.trim();
      if (limitStartValue && !isValidDate(limitStartValue)) {
        errors.push(`${label}: limit start must be YYYY-MM-DD`);
      }

      switch (draft.type) {
        case 'simple':
          if (!monthly) {
            errors.push(`${label}: monthly amount is required`);
          } else {
            const value = parseNumber(`${label}: monthly amount`, monthly, errors);
            if (value !== null) {
              base.monthly = value;
            }
          }
          if (draft.limitEnabled && draft.limitAmount.trim()) {
            if (limitAmountValue !== null) {
              if (draft.limitPeriod === 'weekly' && !limitStartValue) {
                errors.push(`${label}: weekly limit requires a start date`);
              }
              base.limit = {
                amount: limitAmountValue,
                hold: draft.limitHold,
                period: draft.limitPeriod,
                start: limitStartValue || undefined,
              };
            }
          }
          break;
        case 'percentage':
          if (!percent || !draft.category.trim()) {
            errors.push(`${label}: percent and category are required`);
          } else {
            const value = parseNumber(`${label}: percent`, percent, errors);
            if (value !== null) {
              base.percent = value;
            }
            base.previous = draft.previous;
            base.category = draft.category.trim();
          }
          break;
        case 'periodic':
          if (!amount || !draft.starting.trim()) {
            errors.push(`${label}: amount and starting date are required`);
          } else {
            const amountValue = parseNumber(`${label}: amount`, amount, errors);
            if (amountValue !== null) {
              base.amount = amountValue;
            }
            const periodValue = parseNumber(`${label}: repeat amount`, draft.periodAmount, errors);
            base.period = {
              period: draft.periodUnit,
              amount: periodValue ?? 1,
            };
            const startingValue = draft.starting.trim();
            if (!isValidDate(startingValue)) {
              errors.push(`${label}: starting date must be YYYY-MM-DD`);
            } else {
              base.starting = startingValue;
            }
            if (draft.limitEnabled && draft.limitAmount.trim()) {
              if (limitAmountValue !== null) {
                if (draft.limitPeriod === 'weekly' && !limitStartValue) {
                  errors.push(`${label}: weekly limit requires a start date`);
                }
                base.limit = {
                  amount: limitAmountValue,
                  hold: draft.limitHold,
                  period: draft.limitPeriod,
                  start: limitStartValue || undefined,
                };
              }
            }
          }
          break;
        case 'by':
        case 'spend':
          if (!amount || !draft.month.trim()) {
            errors.push(`${label}: amount and month are required`);
          } else {
            const amountValue = parseNumber(`${label}: amount`, amount, errors);
            if (amountValue !== null) {
              base.amount = amountValue;
            }
            const monthValue = draft.month.trim();
            if (!isValidMonth(monthValue)) {
              errors.push(`${label}: month must be YYYY-MM`);
            } else {
              base.month = monthValue;
            }
            if (draft.type === 'spend' && draft.from.trim()) {
              const fromValue = draft.from.trim();
              if (!isValidMonth(fromValue)) {
                errors.push(`${label}: spend-from must be YYYY-MM`);
              } else {
                base.from = fromValue;
              }
            }
            if (draft.repeatUnit) {
              base.annual = draft.repeatUnit === 'year';
              if (draft.repeat.trim()) {
                const repeatValue = parseNumber(`${label}: repeat`, draft.repeat, errors);
                if (repeatValue !== null) {
                  base.repeat = repeatValue;
                }
              }
            } else if (draft.repeat.trim()) {
              errors.push(`${label}: repeat unit is required`);
            }
          }
          break;
        case 'schedule':
          if (!draft.name.trim()) {
            errors.push(`${label}: schedule name is required`);
          } else {
            base.name = draft.name.trim();
            base.full = draft.full;
            if (draft.adjustment.trim()) {
              const adjustmentValue = parseNumber(`${label}: adjustment`, draft.adjustment, errors);
              if (adjustmentValue !== null) {
                base.adjustment = adjustmentValue;
              }
            }
          }
          break;
        case 'average':
          if (!draft.numMonths.trim()) {
            errors.push(`${label}: number of months is required`);
          } else {
            const numMonthsValue = parseNumber(
              `${label}: number of months`,
              draft.numMonths,
              errors
            );
            if (numMonthsValue !== null) {
              base.numMonths = numMonthsValue;
            }
          }
          break;
        case 'copy':
          if (!draft.lookBack.trim()) {
            errors.push(`${label}: lookback months is required`);
          } else {
            const lookBackValue = parseNumber(`${label}: lookback months`, draft.lookBack, errors);
            if (lookBackValue !== null) {
              base.lookBack = lookBackValue;
            }
          }
          break;
        case 'remainder':
          base.priority = null;
          if (draft.weight.trim()) {
            const weightValue = parseNumber(`${label}: weight`, draft.weight, errors);
            base.weight = weightValue ?? 1;
          } else {
            base.weight = 1;
          }
          if (draft.limitEnabled && draft.limitAmount.trim()) {
            if (limitAmountValue !== null) {
              if (draft.limitPeriod === 'weekly' && !limitStartValue) {
                errors.push(`${label}: weekly limit requires a start date`);
              }
              base.limit = {
                amount: limitAmountValue,
                hold: draft.limitHold,
                period: draft.limitPeriod,
                start: limitStartValue || undefined,
              };
            }
          }
          break;
        case 'limit':
          if (!draft.limitAmount.trim()) {
            errors.push(`${label}: limit amount is required`);
          } else {
            base.priority = null;
            if (limitAmountValue !== null) {
              base.amount = limitAmountValue;
            }
            base.hold = draft.limitHold;
            base.period = draft.limitPeriod;
            if (draft.limitPeriod === 'weekly' && !limitStartValue) {
              errors.push(`${label}: weekly limit requires a start date`);
            }
            if (limitStartValue) {
              base.start = limitStartValue;
            }
          }
          break;
        case 'goal':
          if (!amount) {
            errors.push(`${label}: amount is required`);
          } else {
            const goalValue = parseNumber(`${label}: amount`, amount, errors);
            if (goalValue !== null) {
              base.amount = goalValue;
            }
          }
          break;
        default:
          break;
      }

      output.push(base);
    });

    return { output, errors };
  };

  const handleRender = () => {
    setEditorError(null);
    setCopyStatus('idle');
    hasUserEditsRef.current = true;

    const { output, errors } = buildTemplates();
    if (errors.length) {
      setEditorError(errors.join('\n'));
      return;
    }

    if (output.length === 0) {
      lastRenderedPayload.current = '';
      setRenderedValue('');
      setEditorError(null);
      setApplyStatus(null);
      return;
    }

    renderMutation.mutate(output);
  };

  useEffect(() => {
    if (renderTimeoutRef.current) {
      clearTimeout(renderTimeoutRef.current);
    }

    renderTimeoutRef.current = setTimeout(() => {
      setCopyStatus('idle');
      const { output, errors } = buildTemplates();
      if (errors.length) {
        setEditorError(errors.join('\n'));
        return;
      }

      if (!hasUserEditsRef.current) {
        return;
      }

      if (output.length === 0) {
        lastRenderedPayload.current = '';
        setRenderedValue('');
        setEditorError(null);
        setApplyStatus(null);
        return;
      }

      const payload = JSON.stringify(output);
      if (payload === lastRenderedPayload.current) {
        return;
      }
      lastRenderedPayload.current = payload;
      setEditorError(null);
      renderMutation.mutate(output);
    }, 400);

    return () => {
      if (renderTimeoutRef.current) {
        clearTimeout(renderTimeoutRef.current);
      }
    };
  }, [drafts]);

  const handleCopy = async () => {
    if (!renderedWithComments) {
      return;
    }
    try {
      await navigator.clipboard.writeText(renderedWithComments);
      setCopyStatus('copied');
    } catch {
      setEditorError('Unable to copy to clipboard');
    }
  };

  const handleUseCategory = (category: CategoryTemplateSummary) => {
    if (category.id === activeCategoryId) {
      return;
    }
    hasUserEditsRef.current = false;
    lastRenderedPayload.current = '';
    setActiveCategoryId(category.id);
    loadCategory(category);
    setCopyStatus('idle');
  };

  const categoryOptions = useMemo(() => {
    return (categoriesData?.categories ?? []).map((category) => ({
      id: category.id,
      name: category.name,
      label: category.groupName ? `${category.groupName} • ${category.name}` : category.name,
    }));
  }, [categoriesData?.categories]);

  const scheduleOptions = useMemo<AutocompleteOption[]>(
    () =>
      (schedulesData?.schedules ?? []).map((schedule) => ({
        value: schedule.name,
        label: schedule.name,
      })),
    [schedulesData?.schedules]
  );

  const updateDraft = (id: string, updates: Partial<TemplateDraft>) => {
    hasUserEditsRef.current = true;
    setDrafts((prev) => prev.map((draft) => (draft.id === id ? { ...draft, ...updates } : draft)));
  };

  const toggleLimit = (id: string, enabled: boolean) => {
    hasUserEditsRef.current = true;
    if (enabled) {
      updateDraft(id, { limitEnabled: true });
      return;
    }
    updateDraft(id, {
      limitEnabled: false,
      limitAmount: '',
      limitHold: false,
      limitStart: '',
    });
    setEditorError(null);
  };

  const removeDraft = (id: string) => {
    hasUserEditsRef.current = true;
    setDrafts((prev) => prev.filter((draft) => draft.id !== id));
  };

  const addDraft = () => {
    hasUserEditsRef.current = true;
    setDrafts((prev) => [...prev, createDraft(newTemplateType)]);
  };

  const draftRenderLines = renderedValue ? renderedValue.split('\n') : [];

  const renderedWithComments = (() => {
    if (!activeCategory?.note && drafts.length === 0) {
      return '';
    }

    if (activeCategory?.note) {
      const commentsByManagedIndex: string[] = [];
      managedTemplateEntries.forEach((_, index) => {
        const draft = drafts.find((item) => item.sourceIndex === index);
        commentsByManagedIndex.push(draft?.comment ?? '');
      });

      const draftLineMap = new Map<string, string>();
      drafts.forEach((draft, index) => {
        const line = draftRenderLines[index] ?? '';
        draftLineMap.set(draft.id, line);
      });

      const hasRenderedLines = renderedValue.trim().length > 0;
      let managedIndex = 0;
      const replacements = activeTemplateEntries.map((entry) => {
        if (entry.type === 'error') {
          return undefined;
        }
        const draft = drafts.find((item) => item.sourceIndex === managedIndex) ?? null;
        managedIndex += 1;
        if (!draft) {
          return null;
        }
        if (!hasRenderedLines) {
          return undefined;
        }
        return draftLineMap.get(draft.id) ?? '';
      });

      const appendedBlocks = drafts
        .filter((draft) => draft.sourceIndex === null)
        .map((draft) => ({
          comment: draft.comment.trimEnd(),
          line: draftLineMap.get(draft.id) ?? '',
        }))
        .filter((block) => block.comment || block.line);

      return buildNoteFromExisting(
        activeCategory.note,
        activeTemplateEntries,
        commentsByManagedIndex,
        replacements,
        appendedBlocks
      );
    }

    if (!renderedValue) {
      return '';
    }

    const merged: string[] = [];

    drafts.forEach((draft, index) => {
      const comment = draft.comment.trimEnd();
      if (comment) {
        merged.push(...comment.split('\n'));
      }
      const templateLine = draftRenderLines[index];
      if (templateLine) {
        merged.push(templateLine);
      }
      if (index < drafts.length - 1) {
        merged.push('');
      }
    });

    return merged.join('\n').trimEnd();
  })();

  return (
    <section className="template-studio">
      <header className="template-studio-header">
        <div>
          <h2>Budget Template Studio</h2>
          <p>View existing notes and build new template lines before updating Actual.</p>
        </div>
        <button
          type="button"
          className="template-refresh"
          onClick={async () => {
            const result = await refetch();
            if (activeCategoryId && result.data) {
              const nextCategory = result.data.templates.find(
                (item) => item.id === activeCategoryId
              );
              if (nextCategory) {
                loadCategory(nextCategory);
              }
            }
          }}
        >
          Refresh
        </button>
      </header>

      <div className="template-studio-grid">
        <section className="template-list">
          <div className="template-list-header">
            <h3>Categories & Notes</h3>
            <input
              type="search"
              placeholder="Filter by category or group"
              value={filterText}
              onChange={(event) => setFilterText(event.target.value)}
            />
            <div className="template-category-select">
              <label htmlFor="template-category-picker">Select category</label>
              <select
                id="template-category-picker"
                value={activeCategoryId ?? ''}
                onChange={(event) => {
                  const nextId = event.target.value || null;
                  if (nextId === activeCategoryId) {
                    return;
                  }
                  setActiveCategoryId(nextId);
                  const nextCategory = templates.find((item) => item.id === nextId) ?? null;
                  loadCategory(nextCategory);
                }}
              >
                <option value="">Choose a category</option>
                {filteredTemplates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.groupName ? `${item.groupName} • ${item.name}` : item.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="template-note-preview">
            <h4>Selected category notes</h4>
            {activeCategory ? (
              <pre>{activeCategory.note ? activeCategory.note : 'No notes yet'}</pre>
            ) : (
              <p>Select a category to view its notes.</p>
            )}
          </div>

          {isLoading && <p className="template-state">Remembering your templates...</p>}
          {error && <p className="template-state error">Failed to load templates.</p>}

          {!isLoading && filteredTemplates.length === 0 && (
            <p className="template-state">No categories found.</p>
          )}

          <div className="template-card-list">
            {filteredTemplates.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`template-card ${item.id === activeCategoryId ? 'active' : ''}`}
                onClick={() => handleUseCategory(item)}
              >
                <div className="template-card-title">
                  <div>
                    <h4>{item.name}</h4>
                    <span>{item.groupName || 'Uncategorized'}</span>
                  </div>
                  {item.source && <span className="template-source">Source: {item.source}</span>}
                </div>
                {item.parseError ? (
                  <div className="template-error">{item.parseError}</div>
                ) : (
                  <pre className="template-rendered">{item.note ? item.note : 'No notes yet'}</pre>
                )}
              </button>
            ))}
          </div>
        </section>

        <section className="template-editor">
          <div className="template-editor-header">
            <div>
              <h3>Render Templates</h3>
              <p>Build templates with form controls and render the note lines.</p>
            </div>
            {activeCategory && (
              <div className="template-editor-meta">
                Editing: <strong>{activeCategory.name}</strong>
              </div>
            )}
          </div>

          <div className="template-builder">
            <div className="template-builder-toolbar">
              <div className="template-builder-controls">
                <label className="template-label" htmlFor="template-type-select">
                  Add template
                </label>
                <select
                  id="template-type-select"
                  value={newTemplateType}
                  onChange={(event) => setNewTemplateType(event.target.value as TemplateType)}
                >
                  <option value="simple">Simple</option>
                  <option value="percentage">Percentage</option>
                  <option value="periodic">Periodic</option>
                  <option value="by">By date</option>
                  <option value="spend">Spend</option>
                  <option value="schedule">Schedule</option>
                  <option value="average">Average</option>
                  <option value="copy">Copy</option>
                  <option value="remainder">Remainder</option>
                  <option value="limit">Limit</option>
                  <option value="goal">Goal</option>
                </select>
                <button type="button" className="template-secondary" onClick={addDraft}>
                  Add
                </button>
              </div>
              <span className="template-hint">
                Set priority to control order; leave blank for default.
              </span>
            </div>

            {drafts.length === 0 && (
              <div className="template-empty">
                No templates yet. Use “Add” to start building one.
              </div>
            )}

            <div className="template-builder-list">
              {drafts.map((draft, index) => (
                <div key={draft.id} className="template-builder-card">
                  <div className="template-builder-card-header">
                    <div>
                      <h4>
                        {index + 1}. {draft.type.toUpperCase()}
                      </h4>
                      {draft.type !== 'goal' &&
                        draft.type !== 'remainder' &&
                        draft.type !== 'limit' && (
                          <label className="inline-label">
                            Priority
                            <input
                              type="number"
                              value={draft.priority}
                              onChange={(event) =>
                                updateDraft(draft.id, { priority: event.target.value })
                              }
                            />
                          </label>
                        )}
                    </div>
                    <button
                      type="button"
                      className="template-remove"
                      onClick={() => removeDraft(draft.id)}
                    >
                      Remove
                    </button>
                  </div>

                  <label className="template-comment">
                    Label / comment (optional)
                    <textarea
                      value={draft.comment}
                      onChange={(event) => updateDraft(draft.id, { comment: event.target.value })}
                      placeholder="Example: Disney"
                      rows={2}
                    />
                  </label>

                  {draft.type === 'simple' && (
                    <div className="template-fields">
                      <label>
                        Monthly amount
                        <input
                          type="number"
                          value={draft.monthly}
                          onChange={(event) =>
                            updateDraft(draft.id, { monthly: event.target.value })
                          }
                        />
                      </label>
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={draft.limitEnabled}
                          onChange={(event) => toggleLimit(draft.id, event.target.checked)}
                        />
                        Add limit
                      </label>
                      {draft.limitEnabled && (
                        <>
                          <label>
                            Limit amount
                            <input
                              type="number"
                              value={draft.limitAmount}
                              onChange={(event) =>
                                updateDraft(draft.id, { limitAmount: event.target.value })
                              }
                            />
                          </label>
                          <label>
                            Limit period
                            <select
                              value={draft.limitPeriod}
                              onChange={(event) =>
                                updateDraft(draft.id, {
                                  limitPeriod: event.target.value as LimitPeriod,
                                })
                              }
                            >
                              <option value="daily">Daily</option>
                              <option value="weekly">Weekly</option>
                              <option value="monthly">Monthly</option>
                            </select>
                          </label>
                          <label>
                            Limit start
                            <input
                              type="date"
                              placeholder="YYYY-MM-DD"
                              value={draft.limitStart}
                              onChange={(event) =>
                                updateDraft(draft.id, { limitStart: event.target.value })
                              }
                            />
                          </label>
                        </>
                      )}
                    </div>
                  )}

                  {draft.type === 'percentage' && (
                    <div className="template-fields">
                      <label>
                        Percent
                        <input
                          type="number"
                          value={draft.percent}
                          onChange={(event) =>
                            updateDraft(draft.id, { percent: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Category
                        <AutocompleteInput
                          value={draft.category}
                          onChange={(value) => updateDraft(draft.id, { category: value })}
                          placeholder="Start typing a category"
                          options={categoryOptions.map((category) => ({
                            value: category.name,
                            label: category.label,
                          }))}
                        />
                      </label>
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={draft.previous}
                          onChange={(event) =>
                            updateDraft(draft.id, { previous: event.target.checked })
                          }
                        />
                        Use previous month
                      </label>
                    </div>
                  )}

                  {draft.type === 'periodic' && (
                    <div className="template-fields">
                      <label>
                        Amount
                        <input
                          type="number"
                          value={draft.amount}
                          onChange={(event) =>
                            updateDraft(draft.id, { amount: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Repeat every
                        <div className="inline-stack">
                          <input
                            type="number"
                            value={draft.periodAmount}
                            onChange={(event) =>
                              updateDraft(draft.id, { periodAmount: event.target.value })
                            }
                          />
                          <select
                            value={draft.periodUnit}
                            onChange={(event) =>
                              updateDraft(draft.id, {
                                periodUnit: event.target.value as RepeatPeriod,
                              })
                            }
                          >
                            <option value="day">Day</option>
                            <option value="week">Week</option>
                            <option value="month">Month</option>
                            <option value="year">Year</option>
                          </select>
                        </div>
                      </label>
                      <label>
                        Starting date
                        <input
                          type="date"
                          placeholder="YYYY-MM-DD"
                          value={draft.starting}
                          onChange={(event) =>
                            updateDraft(draft.id, { starting: event.target.value })
                          }
                        />
                      </label>
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={draft.limitEnabled}
                          onChange={(event) => toggleLimit(draft.id, event.target.checked)}
                        />
                        Add limit
                      </label>
                      {draft.limitEnabled && (
                        <>
                          <label>
                            Limit amount
                            <input
                              type="number"
                              value={draft.limitAmount}
                              onChange={(event) =>
                                updateDraft(draft.id, { limitAmount: event.target.value })
                              }
                            />
                          </label>
                          <label>
                            Limit period
                            <select
                              value={draft.limitPeriod}
                              onChange={(event) =>
                                updateDraft(draft.id, {
                                  limitPeriod: event.target.value as LimitPeriod,
                                })
                              }
                            >
                              <option value="daily">Daily</option>
                              <option value="weekly">Weekly</option>
                              <option value="monthly">Monthly</option>
                            </select>
                          </label>
                          <label>
                            Limit start
                            <input
                              type="date"
                              placeholder="YYYY-MM-DD"
                              value={draft.limitStart}
                              onChange={(event) =>
                                updateDraft(draft.id, { limitStart: event.target.value })
                              }
                            />
                          </label>
                          <label className="checkbox">
                            <input
                              type="checkbox"
                              checked={draft.limitHold}
                              onChange={(event) =>
                                updateDraft(draft.id, { limitHold: event.target.checked })
                              }
                            />
                            Hold leftover
                          </label>
                        </>
                      )}
                    </div>
                  )}

                  {(draft.type === 'by' || draft.type === 'spend') && (
                    <div className="template-fields">
                      <label>
                        Amount
                        <input
                          type="number"
                          value={draft.amount}
                          onChange={(event) =>
                            updateDraft(draft.id, { amount: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Month (YYYY-MM)
                        <input
                          type="text"
                          placeholder="2026-01"
                          value={draft.month}
                          onChange={(event) => updateDraft(draft.id, { month: event.target.value })}
                        />
                      </label>
                      {draft.type === 'spend' && (
                        <label>
                          Spend from (YYYY-MM)
                          <input
                            type="text"
                            placeholder="2025-10"
                            value={draft.from}
                            onChange={(event) =>
                              updateDraft(draft.id, { from: event.target.value })
                            }
                          />
                        </label>
                      )}
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={draft.repeatUnit !== ''}
                          onChange={(event) =>
                            updateDraft(draft.id, {
                              repeatUnit: event.target.checked ? 'month' : '',
                            })
                          }
                        />
                        Repeat
                      </label>
                      {draft.repeatUnit && (
                        <>
                          <label>
                            Repeat every
                            <div className="inline-stack">
                              <input
                                type="number"
                                value={draft.repeat}
                                min="1"
                                placeholder="1"
                                onChange={(event) =>
                                  updateDraft(draft.id, { repeat: event.target.value })
                                }
                              />
                              <select
                                value={draft.repeatUnit}
                                onChange={(event) =>
                                  updateDraft(draft.id, {
                                    repeatUnit: event.target.value as RepeatUnit,
                                  })
                                }
                              >
                                <option value="month">Month(s)</option>
                                <option value="year">Year(s)</option>
                              </select>
                            </div>
                          </label>
                        </>
                      )}
                    </div>
                  )}

                  {draft.type === 'schedule' && (
                    <div className="template-fields">
                      <label>
                        Schedule name
                        <AutocompleteInput
                          value={draft.name}
                          onChange={(value) => updateDraft(draft.id, { name: value })}
                          placeholder="Start typing a schedule"
                          options={scheduleOptions}
                        />
                      </label>
                      <label>
                        Adjustment (%)
                        <input
                          type="number"
                          value={draft.adjustment}
                          onChange={(event) =>
                            updateDraft(draft.id, { adjustment: event.target.value })
                          }
                        />
                      </label>
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={draft.full}
                          onChange={(event) =>
                            updateDraft(draft.id, { full: event.target.checked })
                          }
                        />
                        Use full scheduled amount
                      </label>
                    </div>
                  )}

                  {draft.type === 'average' && (
                    <div className="template-fields">
                      <label>
                        Number of months
                        <input
                          type="number"
                          value={draft.numMonths}
                          onChange={(event) =>
                            updateDraft(draft.id, { numMonths: event.target.value })
                          }
                        />
                      </label>
                    </div>
                  )}

                  {draft.type === 'copy' && (
                    <div className="template-fields">
                      <label>
                        Copy from months ago
                        <input
                          type="number"
                          value={draft.lookBack}
                          onChange={(event) =>
                            updateDraft(draft.id, { lookBack: event.target.value })
                          }
                        />
                      </label>
                    </div>
                  )}

                  {draft.type === 'remainder' && (
                    <div className="template-fields">
                      <label>
                        Weight (default 1)
                        <input
                          type="number"
                          value={draft.weight}
                          onChange={(event) =>
                            updateDraft(draft.id, { weight: event.target.value })
                          }
                        />
                      </label>
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={draft.limitEnabled}
                          onChange={(event) => toggleLimit(draft.id, event.target.checked)}
                        />
                        Add limit
                      </label>
                      {draft.limitEnabled && (
                        <>
                          <label>
                            Limit amount
                            <input
                              type="number"
                              value={draft.limitAmount}
                              onChange={(event) =>
                                updateDraft(draft.id, { limitAmount: event.target.value })
                              }
                            />
                          </label>
                          <label>
                            Limit period
                            <select
                              value={draft.limitPeriod}
                              onChange={(event) =>
                                updateDraft(draft.id, {
                                  limitPeriod: event.target.value as LimitPeriod,
                                })
                              }
                            >
                              <option value="daily">Daily</option>
                              <option value="weekly">Weekly</option>
                              <option value="monthly">Monthly</option>
                            </select>
                          </label>
                          <label>
                            Limit start
                            <input
                              type="date"
                              placeholder="YYYY-MM-DD"
                              value={draft.limitStart}
                              onChange={(event) =>
                                updateDraft(draft.id, { limitStart: event.target.value })
                              }
                            />
                          </label>
                          <label className="checkbox">
                            <input
                              type="checkbox"
                              checked={draft.limitHold}
                              onChange={(event) =>
                                updateDraft(draft.id, { limitHold: event.target.checked })
                              }
                            />
                            Hold leftover
                          </label>
                        </>
                      )}
                    </div>
                  )}

                  {draft.type === 'limit' && (
                    <div className="template-fields">
                      <label>
                        Limit amount
                        <input
                          type="number"
                          value={draft.limitAmount}
                          onChange={(event) =>
                            updateDraft(draft.id, { limitAmount: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Period
                        <select
                          value={draft.limitPeriod}
                          onChange={(event) =>
                            updateDraft(draft.id, {
                              limitPeriod: event.target.value as LimitPeriod,
                            })
                          }
                        >
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      </label>
                      <label>
                        Start date
                        <input
                          type="date"
                          placeholder="YYYY-MM-DD"
                          value={draft.limitStart}
                          onChange={(event) =>
                            updateDraft(draft.id, { limitStart: event.target.value })
                          }
                        />
                      </label>
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={draft.limitHold}
                          onChange={(event) =>
                            updateDraft(draft.id, { limitHold: event.target.checked })
                          }
                        />
                        Hold leftover
                      </label>
                    </div>
                  )}

                  {draft.type === 'goal' && (
                    <div className="template-fields">
                      <label>
                        Goal amount
                        <input
                          type="number"
                          value={draft.amount}
                          onChange={(event) =>
                            updateDraft(draft.id, { amount: event.target.value })
                          }
                        />
                      </label>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="template-actions">
            <button
              type="button"
              className="template-primary"
              onClick={handleRender}
              disabled={renderMutation.isPending}
            >
              {renderMutation.isPending ? 'Rendering...' : 'Render Notes'}
            </button>
            <button
              type="button"
              className="template-primary"
              onClick={() => {
                if (!activeCategory) {
                  setEditorError('Select a category to apply notes');
                  return;
                }
                applyMutation.mutate({
                  categoryId: activeCategory.id,
                  note: renderedWithComments || null,
                });
              }}
              disabled={!activeCategory || applyMutation.isPending}
            >
              {applyMutation.isPending ? 'Applying...' : 'Apply & Sync'}
            </button>
          </div>

          {editorError && <p className="template-state error">{editorError}</p>}
          {applyStatus && (
            <p className={`template-state ${applyStatus.isError ? 'error' : ''}`}>
              {applyStatus.message}
            </p>
          )}

          <div className="template-output-header">
            <label className="template-label" htmlFor="template-rendered-full">
              Rendered Notes (with labels)
            </label>
            <button
              type="button"
              className="template-secondary"
              onClick={handleCopy}
              disabled={!renderedWithComments}
            >
              {copyStatus === 'copied' ? 'Copied' : 'Copy Notes'}
            </button>
          </div>
          <textarea
            id="template-rendered-full"
            className="template-textarea template-textarea--output"
            value={renderedWithComments}
            readOnly
            spellCheck={false}
          />
        </section>
      </div>
    </section>
  );
}

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  options: AutocompleteOption[];
  placeholder?: string;
}

function AutocompleteInput({ value, onChange, options, placeholder }: AutocompleteInputProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [filterText, setFilterText] = useState('');

  const getFilteredOptions = (nextFilterText: string) => {
    const normalized = nextFilterText.trim().toLowerCase();
    if (!normalized) {
      return options.slice(0, 100);
    }
    return options
      .filter((option) => option.label.toLowerCase().includes(normalized))
      .slice(0, 100);
  };

  const filteredOptions = getFilteredOptions(filterText);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!wrapperRef.current) {
        return;
      }
      if (!wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
    };
  }, []);

  const highlightMatch = (nextOptions: AutocompleteOption[], nextValue = value) => {
    if (!nextValue) {
      setHighlightedIndex(0);
      return;
    }
    const matchIndex = nextOptions.findIndex((option) => option.value === nextValue);
    if (matchIndex >= 0) {
      setHighlightedIndex(matchIndex);
      requestAnimationFrame(() => {
        const list = listRef.current;
        if (!list) {
          return;
        }
        const item = list.querySelector<HTMLElement>(`[data-option-index="${matchIndex}"]`);
        if (item) {
          item.scrollIntoView({ block: 'nearest' });
        }
      });
    } else {
      setHighlightedIndex(0);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && event.key === 'ArrowDown') {
      setIsOpen(true);
      highlightMatch(filteredOptions);
      return;
    }
    if (!isOpen) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, filteredOptions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = filteredOptions[highlightedIndex];
      if (option) {
        onChange(option.value);
        setIsOpen(false);
      }
    } else if (event.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleSelect = (option: AutocompleteOption) => {
    onChange(option.value);
    setIsOpen(false);
  };

  return (
    <div className="autocomplete" ref={wrapperRef}>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          const nextValue = event.target.value;
          const nextFilterText = event.target.value;
          const nextOptions = getFilteredOptions(nextFilterText);
          onChange(nextValue);
          setFilterText(nextFilterText);
          setIsOpen(true);
          highlightMatch(nextOptions, nextValue);
        }}
        onFocus={() => {
          const nextFilterText = '';
          const nextOptions = getFilteredOptions(nextFilterText);
          setFilterText('');
          setIsOpen(true);
          highlightMatch(nextOptions, value);
        }}
        onKeyDown={handleKeyDown}
      />
      {isOpen && filteredOptions.length > 0 && (
        <div className="autocomplete-list" role="listbox" ref={listRef}>
          {filteredOptions.map((option, index) => (
            <button
              type="button"
              key={`${option.value}-${option.label}`}
              className={`autocomplete-item ${index === highlightedIndex ? 'active' : ''}`}
              data-option-index={index}
              onMouseEnter={() => setHighlightedIndex(index)}
              onClick={() => handleSelect(option)}
              role="option"
              aria-selected={index === highlightedIndex}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
