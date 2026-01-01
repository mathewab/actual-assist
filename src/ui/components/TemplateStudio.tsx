import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { api, type CategoryTemplateSummary } from '../services/api';
import {
  buildNoteFromExisting,
  extractTemplateComments,
  type TemplateEntry,
} from './templateNotes';

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

  const buildTemplates = useCallback(() => {
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
  }, [drafts]);

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
  }, [buildTemplates, drafts, renderMutation]);

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

    const draftLineMap = new Map<string, string>();
    drafts.forEach((draft, index) => {
      const line = draftRenderLines[index] ?? '';
      draftLineMap.set(draft.id, line);
    });

    const appendedBlocks = drafts
      .filter((draft) => draft.sourceIndex === null)
      .map((draft) => ({
        comment: draft.comment,
        line: draftLineMap.get(draft.id) ?? '',
      }))
      .filter((block) => block.comment.trim() !== '' || block.line.trim() !== '');

    if (activeCategory?.note) {
      const commentsByManagedIndex: string[] = [];
      managedTemplateEntries.forEach((_, index) => {
        const draft = drafts.find((item) => item.sourceIndex === index);
        commentsByManagedIndex.push(draft?.comment ?? '');
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

      const updated = buildNoteFromExisting(
        activeCategory.note,
        activeTemplateEntries,
        commentsByManagedIndex,
        replacements,
        appendedBlocks
      );

      return updated;
    }

    return buildNoteFromExisting(
      '',
      [],
      drafts.map((draft) => draft.comment),
      [],
      appendedBlocks
    );
  })();

  return (
    <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', lg: 'row' },
          alignItems: { lg: 'center' },
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h5" fontWeight={600} color="text.primary">
            Budget Template Studio
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            View existing notes and build new template lines before updating Actual.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          size="small"
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
        </Button>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(280px,1fr) minmax(340px,1.2fr)' },
        }}
      >
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            bgcolor: 'background.default',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <Typography variant="subtitle1" fontWeight={600}>
            Categories & Notes
          </Typography>
          <TextField
            size="small"
            label="Filter"
            placeholder="Filter by category or group"
            value={filterText}
            onChange={(event) => setFilterText(event.target.value)}
          />
          <Box sx={{ display: { xs: 'flex', lg: 'none' }, flexDirection: 'column', gap: 1 }}>
            <FormControl size="small">
              <InputLabel id="template-category-picker-label">Select category</InputLabel>
              <Select
                labelId="template-category-picker-label"
                id="template-category-picker"
                value={activeCategoryId ?? ''}
                label="Select category"
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
                <MenuItem value="">Choose a category</MenuItem>
                {filteredTemplates.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.groupName ? `${item.groupName} • ${item.name}` : item.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Paper
            variant="outlined"
            sx={{
              p: 2,
              bgcolor: 'background.paper',
              display: { xs: 'block', lg: 'none' },
            }}
          >
            <Typography variant="subtitle2" fontWeight={600}>
              Selected category notes
            </Typography>
            {activeCategory ? (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 1, display: 'block', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}
              >
                {activeCategory.note ? activeCategory.note : 'No notes yet'}
              </Typography>
            ) : (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Select a category to view its notes.
              </Typography>
            )}
          </Paper>

          {isLoading && (
            <Typography variant="body2" color="text.secondary">
              Remembering your templates...
            </Typography>
          )}
          {error && (
            <Alert severity="error" variant="outlined">
              Failed to load templates.
            </Alert>
          )}

          {!isLoading && filteredTemplates.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No categories found.
            </Typography>
          )}

          <Stack
            spacing={2}
            sx={{ display: { xs: 'none', lg: 'flex' }, maxHeight: 520, overflow: 'auto', pr: 1 }}
          >
            {filteredTemplates.map((item) => {
              const isActive = item.id === activeCategoryId;
              return (
                <Paper
                  key={item.id}
                  variant="outlined"
                  onClick={() => handleUseCategory(item)}
                  sx={{
                    p: 2,
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderColor: isActive ? 'primary.main' : 'divider',
                    boxShadow: isActive ? '0 0 0 1px' : 'none',
                    '&:hover': { borderColor: 'primary.light' },
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 2,
                    }}
                  >
                    <Box>
                      <Typography variant="subtitle2" fontWeight={600}>
                        {item.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {item.groupName || 'Uncategorized'}
                      </Typography>
                    </Box>
                    {item.source && (
                      <Chip
                        size="small"
                        variant="outlined"
                        color="info"
                        label={`Source: ${item.source}`}
                      />
                    )}
                  </Box>
                  {item.parseError ? (
                    <Alert severity="error" variant="outlined" sx={{ mt: 1 }}>
                      {item.parseError}
                    </Alert>
                  ) : (
                    <Box
                      component="pre"
                      sx={{
                        mt: 1,
                        whiteSpace: 'pre-wrap',
                        bgcolor: 'background.default',
                        p: 1.5,
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: 'divider',
                        fontSize: '0.75rem',
                        color: 'text.secondary',
                      }}
                    >
                      {item.note ? item.note : 'No notes yet'}
                    </Box>
                  )}
                </Paper>
              );
            })}
          </Stack>
        </Paper>

        <Paper
          variant="outlined"
          sx={{
            p: 2,
            bgcolor: 'background.default',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 2,
              alignItems: { sm: 'flex-start' },
              justifyContent: 'space-between',
            }}
          >
            <Box>
              <Typography variant="subtitle1" fontWeight={600}>
                Render Templates
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Build templates with form controls and render the note lines.
              </Typography>
            </Box>
            {activeCategory && (
              <Chip size="small" variant="outlined" label={`Editing: ${activeCategory.name}`} />
            )}
          </Box>

          <Stack spacing={2}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              alignItems={{ sm: 'center' }}
              justifyContent="space-between"
            >
              <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel id="template-type-select-label">Add template</InputLabel>
                  <Select
                    labelId="template-type-select-label"
                    id="template-type-select"
                    value={newTemplateType}
                    label="Add template"
                    onChange={(event) => setNewTemplateType(event.target.value as TemplateType)}
                  >
                    <MenuItem value="simple">Simple</MenuItem>
                    <MenuItem value="percentage">Percentage</MenuItem>
                    <MenuItem value="periodic">Periodic</MenuItem>
                    <MenuItem value="by">By date</MenuItem>
                    <MenuItem value="spend">Spend</MenuItem>
                    <MenuItem value="schedule">Schedule</MenuItem>
                    <MenuItem value="average">Average</MenuItem>
                    <MenuItem value="copy">Copy</MenuItem>
                    <MenuItem value="remainder">Remainder</MenuItem>
                    <MenuItem value="limit">Limit</MenuItem>
                    <MenuItem value="goal">Goal</MenuItem>
                  </Select>
                </FormControl>
                <Button variant="outlined" size="small" onClick={addDraft}>
                  Add
                </Button>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                Set priority to control order; leave blank for default.
              </Typography>
            </Stack>

            {drafts.length === 0 && (
              <Box
                sx={{
                  border: '1px dashed',
                  borderColor: 'divider',
                  bgcolor: 'background.default',
                  borderRadius: 1,
                  px: 2,
                  py: 1.5,
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  No templates yet. Use “Add” to start building one.
                </Typography>
              </Box>
            )}

            <Stack spacing={2}>
              {drafts.map((draft, index) => (
                <Paper
                  key={draft.id}
                  variant="outlined"
                  sx={{
                    p: 2,
                    bgcolor: 'background.paper',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 2,
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Box>
                      <Typography variant="subtitle2" fontWeight={600}>
                        {index + 1}. {draft.type.toUpperCase()}
                      </Typography>
                      {draft.type !== 'goal' &&
                        draft.type !== 'remainder' &&
                        draft.type !== 'limit' && (
                          <TextField
                            size="small"
                            label="Priority"
                            type="number"
                            value={draft.priority}
                            onChange={(event) =>
                              updateDraft(draft.id, { priority: event.target.value })
                            }
                            sx={{ mt: 1, width: 120 }}
                          />
                        )}
                    </Box>
                    <Button
                      color="error"
                      variant="outlined"
                      size="small"
                      onClick={() => removeDraft(draft.id)}
                    >
                      Remove
                    </Button>
                  </Box>

                  <TextField
                    label="Label / comment (optional)"
                    size="small"
                    multiline
                    minRows={2}
                    value={draft.comment}
                    onChange={(event) => updateDraft(draft.id, { comment: event.target.value })}
                    placeholder="Example: Disney"
                  />

                  {draft.type === 'simple' && (
                    <Box
                      sx={{
                        display: 'grid',
                        gap: 2,
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                      }}
                    >
                      <TextField
                        size="small"
                        label="Monthly amount"
                        type="number"
                        value={draft.monthly}
                        onChange={(event) => updateDraft(draft.id, { monthly: event.target.value })}
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            size="small"
                            checked={draft.limitEnabled}
                            onChange={(event) => toggleLimit(draft.id, event.target.checked)}
                          />
                        }
                        label="Add limit"
                      />
                      {draft.limitEnabled && (
                        <>
                          <TextField
                            size="small"
                            label="Limit amount"
                            type="number"
                            value={draft.limitAmount}
                            onChange={(event) =>
                              updateDraft(draft.id, { limitAmount: event.target.value })
                            }
                          />
                          <FormControl size="small">
                            <InputLabel id={`limit-period-${draft.id}`}>Limit period</InputLabel>
                            <Select
                              labelId={`limit-period-${draft.id}`}
                              label="Limit period"
                              value={draft.limitPeriod}
                              onChange={(event) =>
                                updateDraft(draft.id, {
                                  limitPeriod: event.target.value as LimitPeriod,
                                })
                              }
                            >
                              <MenuItem value="daily">Daily</MenuItem>
                              <MenuItem value="weekly">Weekly</MenuItem>
                              <MenuItem value="monthly">Monthly</MenuItem>
                            </Select>
                          </FormControl>
                          <TextField
                            size="small"
                            label="Limit start"
                            type="date"
                            InputLabelProps={{ shrink: true }}
                            value={draft.limitStart}
                            onChange={(event) =>
                              updateDraft(draft.id, { limitStart: event.target.value })
                            }
                          />
                        </>
                      )}
                    </Box>
                  )}

                  {draft.type === 'percentage' && (
                    <Box
                      sx={{
                        display: 'grid',
                        gap: 2,
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                      }}
                    >
                      <TextField
                        size="small"
                        label="Percent"
                        type="number"
                        value={draft.percent}
                        onChange={(event) => updateDraft(draft.id, { percent: event.target.value })}
                      />
                      <AutocompleteInput
                        value={draft.category}
                        onChange={(value) => updateDraft(draft.id, { category: value })}
                        label="Category"
                        placeholder="Start typing a category"
                        options={categoryOptions.map((category) => ({
                          value: category.name,
                          label: category.label,
                        }))}
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            size="small"
                            checked={draft.previous}
                            onChange={(event) =>
                              updateDraft(draft.id, { previous: event.target.checked })
                            }
                          />
                        }
                        label="Use previous month"
                      />
                    </Box>
                  )}

                  {draft.type === 'periodic' && (
                    <Box
                      sx={{
                        display: 'grid',
                        gap: 2,
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                      }}
                    >
                      <TextField
                        size="small"
                        label="Amount"
                        type="number"
                        value={draft.amount}
                        onChange={(event) => updateDraft(draft.id, { amount: event.target.value })}
                      />
                      <TextField
                        size="small"
                        label="Repeat amount"
                        type="number"
                        value={draft.periodAmount}
                        onChange={(event) =>
                          updateDraft(draft.id, { periodAmount: event.target.value })
                        }
                      />
                      <FormControl size="small">
                        <InputLabel id={`period-unit-${draft.id}`}>Repeat unit</InputLabel>
                        <Select
                          labelId={`period-unit-${draft.id}`}
                          label="Repeat unit"
                          value={draft.periodUnit}
                          onChange={(event) =>
                            updateDraft(draft.id, {
                              periodUnit: event.target.value as RepeatPeriod,
                            })
                          }
                        >
                          <MenuItem value="day">Day</MenuItem>
                          <MenuItem value="week">Week</MenuItem>
                          <MenuItem value="month">Month</MenuItem>
                          <MenuItem value="year">Year</MenuItem>
                        </Select>
                      </FormControl>
                      <TextField
                        size="small"
                        label="Starting date"
                        type="date"
                        InputLabelProps={{ shrink: true }}
                        value={draft.starting}
                        onChange={(event) =>
                          updateDraft(draft.id, { starting: event.target.value })
                        }
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            size="small"
                            checked={draft.limitEnabled}
                            onChange={(event) => toggleLimit(draft.id, event.target.checked)}
                          />
                        }
                        label="Add limit"
                      />
                      {draft.limitEnabled && (
                        <>
                          <TextField
                            size="small"
                            label="Limit amount"
                            type="number"
                            value={draft.limitAmount}
                            onChange={(event) =>
                              updateDraft(draft.id, { limitAmount: event.target.value })
                            }
                          />
                          <FormControl size="small">
                            <InputLabel id={`period-limit-${draft.id}`}>Limit period</InputLabel>
                            <Select
                              labelId={`period-limit-${draft.id}`}
                              label="Limit period"
                              value={draft.limitPeriod}
                              onChange={(event) =>
                                updateDraft(draft.id, {
                                  limitPeriod: event.target.value as LimitPeriod,
                                })
                              }
                            >
                              <MenuItem value="daily">Daily</MenuItem>
                              <MenuItem value="weekly">Weekly</MenuItem>
                              <MenuItem value="monthly">Monthly</MenuItem>
                            </Select>
                          </FormControl>
                          <TextField
                            size="small"
                            label="Limit start"
                            type="date"
                            InputLabelProps={{ shrink: true }}
                            value={draft.limitStart}
                            onChange={(event) =>
                              updateDraft(draft.id, { limitStart: event.target.value })
                            }
                          />
                          <FormControlLabel
                            control={
                              <Checkbox
                                size="small"
                                checked={draft.limitHold}
                                onChange={(event) =>
                                  updateDraft(draft.id, { limitHold: event.target.checked })
                                }
                              />
                            }
                            label="Hold leftover"
                          />
                        </>
                      )}
                    </Box>
                  )}

                  {(draft.type === 'by' || draft.type === 'spend') && (
                    <Box
                      sx={{
                        display: 'grid',
                        gap: 2,
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                      }}
                    >
                      <TextField
                        size="small"
                        label="Amount"
                        type="number"
                        value={draft.amount}
                        onChange={(event) => updateDraft(draft.id, { amount: event.target.value })}
                      />
                      <TextField
                        size="small"
                        label="Month (YYYY-MM)"
                        placeholder="2026-01"
                        value={draft.month}
                        onChange={(event) => updateDraft(draft.id, { month: event.target.value })}
                      />
                      {draft.type === 'spend' && (
                        <TextField
                          size="small"
                          label="Spend from (YYYY-MM)"
                          placeholder="2025-10"
                          value={draft.from}
                          onChange={(event) => updateDraft(draft.id, { from: event.target.value })}
                        />
                      )}
                      <FormControlLabel
                        control={
                          <Checkbox
                            size="small"
                            checked={draft.repeatUnit !== ''}
                            onChange={(event) =>
                              updateDraft(draft.id, {
                                repeatUnit: event.target.checked ? 'month' : '',
                              })
                            }
                          />
                        }
                        label="Repeat"
                      />
                      {draft.repeatUnit && (
                        <>
                          <TextField
                            size="small"
                            label="Repeat amount"
                            type="number"
                            placeholder="1"
                            value={draft.repeat}
                            onChange={(event) =>
                              updateDraft(draft.id, { repeat: event.target.value })
                            }
                          />
                          <FormControl size="small">
                            <InputLabel id={`repeat-unit-${draft.id}`}>Repeat unit</InputLabel>
                            <Select
                              labelId={`repeat-unit-${draft.id}`}
                              label="Repeat unit"
                              value={draft.repeatUnit}
                              onChange={(event) =>
                                updateDraft(draft.id, {
                                  repeatUnit: event.target.value as RepeatUnit,
                                })
                              }
                            >
                              <MenuItem value="month">Month(s)</MenuItem>
                              <MenuItem value="year">Year(s)</MenuItem>
                            </Select>
                          </FormControl>
                        </>
                      )}
                    </Box>
                  )}

                  {draft.type === 'schedule' && (
                    <Box
                      sx={{
                        display: 'grid',
                        gap: 2,
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                      }}
                    >
                      <AutocompleteInput
                        value={draft.name}
                        onChange={(value) => updateDraft(draft.id, { name: value })}
                        label="Schedule name"
                        placeholder="Start typing a schedule"
                        options={scheduleOptions}
                      />
                      <TextField
                        size="small"
                        label="Adjustment (%)"
                        type="number"
                        value={draft.adjustment}
                        onChange={(event) =>
                          updateDraft(draft.id, { adjustment: event.target.value })
                        }
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            size="small"
                            checked={draft.full}
                            onChange={(event) =>
                              updateDraft(draft.id, { full: event.target.checked })
                            }
                          />
                        }
                        label="Use full scheduled amount"
                      />
                    </Box>
                  )}

                  {draft.type === 'average' && (
                    <Box
                      sx={{
                        display: 'grid',
                        gap: 2,
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                      }}
                    >
                      <TextField
                        size="small"
                        label="Number of months"
                        type="number"
                        value={draft.numMonths}
                        onChange={(event) =>
                          updateDraft(draft.id, { numMonths: event.target.value })
                        }
                      />
                    </Box>
                  )}

                  {draft.type === 'copy' && (
                    <Box
                      sx={{
                        display: 'grid',
                        gap: 2,
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                      }}
                    >
                      <TextField
                        size="small"
                        label="Copy from months ago"
                        type="number"
                        value={draft.lookBack}
                        onChange={(event) =>
                          updateDraft(draft.id, { lookBack: event.target.value })
                        }
                      />
                    </Box>
                  )}

                  {draft.type === 'remainder' && (
                    <Box
                      sx={{
                        display: 'grid',
                        gap: 2,
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                      }}
                    >
                      <TextField
                        size="small"
                        label="Weight (default 1)"
                        type="number"
                        value={draft.weight}
                        onChange={(event) => updateDraft(draft.id, { weight: event.target.value })}
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            size="small"
                            checked={draft.limitEnabled}
                            onChange={(event) => toggleLimit(draft.id, event.target.checked)}
                          />
                        }
                        label="Add limit"
                      />
                      {draft.limitEnabled && (
                        <>
                          <TextField
                            size="small"
                            label="Limit amount"
                            type="number"
                            value={draft.limitAmount}
                            onChange={(event) =>
                              updateDraft(draft.id, { limitAmount: event.target.value })
                            }
                          />
                          <FormControl size="small">
                            <InputLabel id={`remainder-limit-${draft.id}`}>Limit period</InputLabel>
                            <Select
                              labelId={`remainder-limit-${draft.id}`}
                              label="Limit period"
                              value={draft.limitPeriod}
                              onChange={(event) =>
                                updateDraft(draft.id, {
                                  limitPeriod: event.target.value as LimitPeriod,
                                })
                              }
                            >
                              <MenuItem value="daily">Daily</MenuItem>
                              <MenuItem value="weekly">Weekly</MenuItem>
                              <MenuItem value="monthly">Monthly</MenuItem>
                            </Select>
                          </FormControl>
                          <TextField
                            size="small"
                            label="Limit start"
                            type="date"
                            InputLabelProps={{ shrink: true }}
                            value={draft.limitStart}
                            onChange={(event) =>
                              updateDraft(draft.id, { limitStart: event.target.value })
                            }
                          />
                          <FormControlLabel
                            control={
                              <Checkbox
                                size="small"
                                checked={draft.limitHold}
                                onChange={(event) =>
                                  updateDraft(draft.id, { limitHold: event.target.checked })
                                }
                              />
                            }
                            label="Hold leftover"
                          />
                        </>
                      )}
                    </Box>
                  )}

                  {draft.type === 'limit' && (
                    <Box
                      sx={{
                        display: 'grid',
                        gap: 2,
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                      }}
                    >
                      <TextField
                        size="small"
                        label="Limit amount"
                        type="number"
                        value={draft.limitAmount}
                        onChange={(event) =>
                          updateDraft(draft.id, { limitAmount: event.target.value })
                        }
                      />
                      <FormControl size="small">
                        <InputLabel id={`limit-period-select-${draft.id}`}>Period</InputLabel>
                        <Select
                          labelId={`limit-period-select-${draft.id}`}
                          label="Period"
                          value={draft.limitPeriod}
                          onChange={(event) =>
                            updateDraft(draft.id, {
                              limitPeriod: event.target.value as LimitPeriod,
                            })
                          }
                        >
                          <MenuItem value="daily">Daily</MenuItem>
                          <MenuItem value="weekly">Weekly</MenuItem>
                          <MenuItem value="monthly">Monthly</MenuItem>
                        </Select>
                      </FormControl>
                      <TextField
                        size="small"
                        label="Start date"
                        type="date"
                        InputLabelProps={{ shrink: true }}
                        value={draft.limitStart}
                        onChange={(event) =>
                          updateDraft(draft.id, { limitStart: event.target.value })
                        }
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            size="small"
                            checked={draft.limitHold}
                            onChange={(event) =>
                              updateDraft(draft.id, { limitHold: event.target.checked })
                            }
                          />
                        }
                        label="Hold leftover"
                      />
                    </Box>
                  )}

                  {draft.type === 'goal' && (
                    <Box
                      sx={{
                        display: 'grid',
                        gap: 2,
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                      }}
                    >
                      <TextField
                        size="small"
                        label="Goal amount"
                        type="number"
                        value={draft.amount}
                        onChange={(event) => updateDraft(draft.id, { amount: event.target.value })}
                      />
                    </Box>
                  )}
                </Paper>
              ))}
            </Stack>
          </Stack>

          <Stack direction="row" spacing={2} flexWrap="wrap">
            <Button variant="contained" onClick={handleRender} disabled={renderMutation.isPending}>
              {renderMutation.isPending ? 'Rendering...' : 'Render Notes'}
            </Button>
            <Button
              variant="contained"
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
            </Button>
          </Stack>

          {editorError && (
            <Alert severity="error" variant="outlined">
              {editorError}
            </Alert>
          )}
          {applyStatus && (
            <Alert severity={applyStatus.isError ? 'error' : 'success'} variant="outlined">
              {applyStatus.message}
            </Alert>
          )}

          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 2,
            }}
          >
            <Typography variant="caption" fontWeight={600}>
              Rendered Notes (with labels)
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={handleCopy}
              disabled={!renderedWithComments}
            >
              {copyStatus === 'copied' ? 'Copied' : 'Copy Notes'}
            </Button>
          </Box>
          <TextField
            id="template-rendered-full"
            value={renderedWithComments}
            multiline
            minRows={6}
            fullWidth
            InputProps={{
              readOnly: true,
              sx: { fontFamily: 'monospace', fontSize: '0.75rem' },
            }}
            spellCheck={false}
            size="small"
          />
        </Paper>
      </Box>
    </Box>
  );
}

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  options: AutocompleteOption[];
  placeholder?: string;
  label?: string;
}

function AutocompleteInput({
  value,
  onChange,
  options,
  placeholder,
  label,
}: AutocompleteInputProps) {
  return (
    <Autocomplete<AutocompleteOption, false, false, true>
      freeSolo
      options={options}
      getOptionLabel={(option) => (typeof option === 'string' ? option : option.label)}
      inputValue={value}
      onInputChange={(_, newValue) => onChange(newValue)}
      onChange={(_, newValue) => {
        if (typeof newValue === 'string') {
          onChange(newValue);
        } else if (newValue) {
          onChange(newValue.value);
        } else {
          onChange('');
        }
      }}
      renderInput={(params) => (
        <TextField {...params} size="small" placeholder={placeholder} label={label ?? 'Select'} />
      )}
    />
  );
}
