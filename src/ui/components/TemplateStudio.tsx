import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
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
  | 'schedule'
  | 'average'
  | 'copy'
  | 'remainder'
  | 'goal';

type LimitPeriod = 'daily' | 'weekly' | 'monthly';
type RepeatPeriod = 'day' | 'week' | 'month' | 'year';
type RepeatUnit = 'month' | 'year' | '';

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
  isError: boolean;
  errorLine: string;
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

type FieldKey =
  | 'priority'
  | 'comment'
  | 'limit'
  | 'repeat'
  | 'from'
  | 'previous'
  | 'adjustment'
  | 'full';

type FieldVisibility = Record<FieldKey, boolean>;

const emptyVisibility: FieldVisibility = {
  priority: false,
  comment: false,
  limit: false,
  repeat: false,
  from: false,
  previous: false,
  adjustment: false,
  full: false,
};

const templateTypeOptions: Array<{
  value: TemplateType;
  label: string;
  description: string;
}> = [
  {
    value: 'simple',
    label: 'Simple',
    description: 'Budget a fixed amount; supports “up to” limits.',
  },
  {
    value: 'percentage',
    label: 'Percentage',
    description: 'Budget a percent of another category.',
  },
  {
    value: 'periodic',
    label: 'Periodic',
    description: 'Repeat every N day/week/month/year starting on a date.',
  },
  {
    value: 'by',
    label: 'By date',
    description: 'Save up to a target by a specific month (YYYY-MM).',
  },
  {
    value: 'schedule',
    label: 'Schedule',
    description: 'Fund scheduled transactions; full flag or % adjust.',
  },
  {
    value: 'average',
    label: 'Average',
    description: 'Budget the average spend over the last N months.',
  },
  {
    value: 'copy',
    label: 'Copy',
    description: 'Copy the budgeted amount from N months ago.',
  },
  {
    value: 'remainder',
    label: 'Remainder',
    description: 'Distribute remaining funds, optional weight/limit.',
  },
  {
    value: 'goal',
    label: 'Goal',
    description: 'Set a long-term goal indicator (no budgeting).',
  },
];

const compactLabelSx = {
  m: 0,
  '.MuiFormControlLabel-label': { fontSize: '0.75rem' },
};

const groupBoxSx = {
  display: 'grid',
  gap: 1,
  gridTemplateColumns: { xs: '1fr', md: 'repeat(auto-fit, minmax(140px, 1fr))' },
  p: 1,
  borderRadius: 1,
  border: '1px solid',
  borderColor: 'divider',
  bgcolor: 'background.default',
};

const groupTitleSx = {
  gridColumn: '1 / -1',
  fontSize: '0.7rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'text.secondary',
};

const getOptionalFields = (type: TemplateType): FieldKey[] => {
  switch (type) {
    case 'simple':
      return ['priority', 'comment', 'limit'];
    case 'percentage':
      return ['priority', 'comment', 'previous'];
    case 'periodic':
      return ['priority', 'comment', 'limit'];
    case 'by':
      return ['priority', 'comment', 'repeat', 'from'];
    case 'schedule':
      return ['priority', 'comment', 'adjustment', 'full'];
    case 'average':
    case 'copy':
      return ['priority', 'comment'];
    case 'remainder':
      return ['comment', 'limit'];
    case 'goal':
      return ['comment'];
    default:
      return ['comment'];
  }
};

const getInitialVisibility = (draft: TemplateDraft): FieldVisibility => {
  const next: FieldVisibility = { ...emptyVisibility };
  if (draft.comment.trim()) {
    next.comment = true;
  }
  if (draft.priority.trim()) {
    next.priority = true;
  }
  if (draft.limitEnabled || draft.limitAmount.trim() || draft.limitStart.trim()) {
    next.limit = true;
  }
  if (draft.repeatUnit) {
    next.repeat = true;
  }
  if (draft.from.trim()) {
    next.from = true;
  }
  if (draft.previous) {
    next.previous = true;
  }
  if (draft.adjustment.trim()) {
    next.adjustment = true;
  }
  if (draft.full) {
    next.full = true;
  }
  return next;
};

const makeId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tmpl_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const createDraft = (type: TemplateType): TemplateDraft => ({
  id: makeId(),
  type,
  sourceIndex: null,
  isError: false,
  errorLine: '',
  priority: '',
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

const buildTemplate = (draft: TemplateDraft, index: number) => {
  const errors: string[] = [];
  const label = `Template ${index + 1}`;
  if (draft.isError) {
    const line = draft.errorLine.trim();
    errors.push(
      line ? `${label}: failed to parse "${line}"` : `${label}: failed to parse template`
    );
    return { template: null, errors };
  }
  if (draft.comment && commentHasBlankLine(draft.comment)) {
    errors.push(`${label}: label/comment cannot contain blank lines`);
  }
  const priority = draft.priority.trim();
  const priorityValue = priority ? parseNumber(`${label}: priority`, priority, errors) : null;

  const base: Record<string, unknown> = {
    type: draft.type,
    directive: draft.type === 'goal' ? 'goal' : 'template',
  };

  if (draft.type !== 'goal' && draft.type !== 'remainder') {
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
        if (!(draft.limitEnabled && draft.limitAmount.trim())) {
          errors.push(`${label}: monthly amount is required`);
        }
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
        if (draft.from.trim()) {
          base.type = 'spend';
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
        const numMonthsValue = parseNumber(`${label}: number of months`, draft.numMonths, errors);
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

  return { template: base, errors };
};

const toDraft = (template: Record<string, unknown>): TemplateDraft => {
  const rawType = template.type as string | undefined;
  const supportedTypes: TemplateType[] = [
    'simple',
    'percentage',
    'periodic',
    'by',
    'schedule',
    'average',
    'copy',
    'remainder',
    'goal',
  ];
  let draftType: TemplateType = 'simple';
  if (rawType === 'spend') {
    draftType = 'by';
  } else if (rawType === 'limit') {
    draftType = 'simple';
  } else if (rawType && supportedTypes.includes(rawType as TemplateType)) {
    draftType = rawType as TemplateType;
  }
  const draft = createDraft(draftType);
  draft.priority =
    template.priority === null || template.priority === undefined || Number(template.priority) === 0
      ? ''
      : String(template.priority);
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
  if (rawType === 'limit') {
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
  const [fieldVisibility, setFieldVisibility] = useState<Record<string, FieldVisibility>>({});
  const [renderedValue, setRenderedValue] = useState('');
  const [, setEditorError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
  const [newTemplateType, setNewTemplateType] = useState<TemplateType>('simple');
  const [fieldMenuAnchor, setFieldMenuAnchor] = useState<HTMLElement | null>(null);
  const [fieldMenuDraftId, setFieldMenuDraftId] = useState<string | null>(null);
  const lastRenderedPayload = useRef<string>('');
  const renderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasUserEditsRef = useRef(false);
  const [applyStatus, setApplyStatus] = useState<{ message: string; isError: boolean } | null>(
    null
  );

  const activeCategory = templates.find((item) => item.id === activeCategoryId) ?? null;
  const activeTemplateEntries = (activeCategory?.templates ?? []) as TemplateEntry[];

  const loadCategory = (category: CategoryTemplateSummary | null) => {
    if (!category) {
      setDrafts(emptyTemplates);
      setFieldVisibility({});
      setRenderedValue('');
      setEditorError(null);
      setApplyStatus(null);
      return;
    }

    const templateEntries = (category.templates ?? []) as TemplateEntry[];
    const baseDrafts =
      templateEntries.length > 0
        ? templateEntries.map((template, index) => {
            if (template.type === 'error') {
              const draft = createDraft('simple');
              draft.sourceIndex = index;
              draft.isError = true;
              draft.errorLine = template.line ?? '';
              return draft;
            }
            const draft = toDraft(template);
            draft.sourceIndex = index;
            return draft;
          })
        : emptyTemplates;
    const comments = extractTemplateComments(category.note ?? null, templateEntries);
    let commentIndex = 0;
    const nextDrafts = baseDrafts.map((draft) => {
      if (draft.isError) {
        return draft;
      }
      const next = { ...draft, comment: comments[commentIndex] ?? '' };
      commentIndex += 1;
      return next;
    });
    setDrafts(nextDrafts);
    const nextVisibility = nextDrafts.reduce<Record<string, FieldVisibility>>((acc, draft) => {
      acc[draft.id] = getInitialVisibility(draft);
      return acc;
    }, {});
    setFieldVisibility(nextVisibility);
    hasUserEditsRef.current = false;
    lastRenderedPayload.current = '';
    setRenderedValue('');
    setEditorError(category.parseError);
    setApplyStatus(null);

    if (nextDrafts.length > 0) {
      const previews = nextDrafts.map((draft, index) => buildTemplate(draft, index));
      const previewErrors = previews.flatMap((entry) => entry.errors);
      if (previewErrors.length === 0) {
        const output = previews.map((entry) => entry.template);
        renderMutation.mutate(output);
      }
    }
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
      api.applyCategoryNote(payload.categoryId, payload.note, true, budgetId),
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

  const draftValidation = useMemo(
    () => drafts.map((draft, index) => buildTemplate(draft, index)),
    [drafts]
  );

  const buildTemplates = useCallback(() => {
    const errors: string[] = [];
    const output: Record<string, unknown>[] = [];
    draftValidation.forEach(({ template, errors: draftErrors }) => {
      if (draftErrors.length) {
        errors.push(...draftErrors);
      }
      if (template) {
        output.push(template);
      }
    });

    return { output, errors };
  }, [draftValidation]);

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

  const scheduleOptions = useMemo(
    () => (schedulesData?.schedules ?? []).map((schedule) => schedule.name),
    [schedulesData?.schedules]
  );

  const groupedCategoryOptions = useMemo(() => {
    const categories = categoriesData?.categories ?? [];
    const groups = new Map<string, { name: string; label: string }[]>();
    categories.forEach((category) => {
      const groupName = category.groupName || 'Uncategorized';
      const list = groups.get(groupName) ?? [];
      list.push({ name: category.name, label: category.name });
      groups.set(groupName, list);
    });
    return Array.from(groups.entries()).map(([groupName, options]) => ({
      groupName,
      options,
    }));
  }, [categoriesData?.categories]);

  const updateDraft = (id: string, updates: Partial<TemplateDraft>) => {
    hasUserEditsRef.current = true;
    setDrafts((prev) => prev.map((draft) => (draft.id === id ? { ...draft, ...updates } : draft)));
  };

  const updateVisibility = (id: string, updates: Partial<FieldVisibility>) => {
    setFieldVisibility((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? emptyVisibility), ...updates },
    }));
  };

  const handleFieldToggle = (draft: TemplateDraft, field: FieldKey, enabled: boolean) => {
    updateVisibility(draft.id, { [field]: enabled });
    if (enabled) {
      if (field === 'limit') {
        updateDraft(draft.id, { limitEnabled: true });
      }
      if (field === 'repeat' && !draft.repeatUnit) {
        updateDraft(draft.id, { repeatUnit: 'month' });
      }
      return;
    }

    switch (field) {
      case 'priority':
        updateDraft(draft.id, { priority: '' });
        break;
      case 'comment':
        updateDraft(draft.id, { comment: '' });
        break;
      case 'limit':
        toggleLimit(draft.id, false);
        break;
      case 'repeat':
        updateDraft(draft.id, { repeatUnit: '', repeat: '' });
        break;
      case 'from':
        updateDraft(draft.id, { from: '' });
        break;
      case 'previous':
        updateDraft(draft.id, { previous: false });
        break;
      case 'adjustment':
        updateDraft(draft.id, { adjustment: '' });
        break;
      case 'full':
        updateDraft(draft.id, { full: false });
        break;
      default:
        break;
    }
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

  const updateLimitPeriod = (id: string, period: LimitPeriod) => {
    hasUserEditsRef.current = true;
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.id === id
          ? {
              ...draft,
              limitPeriod: period,
              limitStart: period === 'weekly' ? draft.limitStart : '',
            }
          : draft
      )
    );
  };

  const removeDraft = (id: string) => {
    hasUserEditsRef.current = true;
    setDrafts((prev) => prev.filter((draft) => draft.id !== id));
    setFieldVisibility((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const addDraft = () => {
    const draft = createDraft(newTemplateType);
    hasUserEditsRef.current = true;
    setDrafts((prev) => [...prev, draft]);
    setFieldVisibility((prev) => ({ ...prev, [draft.id]: getInitialVisibility(draft) }));
  };

  const draftRenderLines = renderedValue ? renderedValue.split('\n') : [];

  const renderedWithComments = (() => {
    if (!activeCategory?.note && drafts.length === 0) {
      return '';
    }

    const draftLineMap = new Map<string, string>();
    drafts
      .filter((draft) => !draft.isError)
      .forEach((draft, index) => {
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
      activeTemplateEntries.forEach((entry, entryIndex) => {
        if (entry.type === 'error') {
          return;
        }
        const draft = drafts.find((item) => item.sourceIndex === entryIndex);
        commentsByManagedIndex.push(draft?.comment ?? '');
      });

      const hasRenderedLines = renderedValue.trim().length > 0;
      const replacements = activeTemplateEntries.map((entry, entryIndex) => {
        const draft = drafts.find((item) => item.sourceIndex === entryIndex) ?? null;
        if (entry.type === 'error') {
          if (!draft) {
            return null;
          }
          return entry.line ?? '';
        }
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
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
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
          gap: 2,
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(260px,1fr) minmax(360px,1.3fr)' },
        }}
      >
        <Paper
          variant="outlined"
          sx={{
            p: 1.5,
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
            spacing={1.5}
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
                    p: 1.5,
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
                        p: 1,
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
            p: 1.5,
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

          <Stack spacing={1.5}>
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

            <Stack spacing={1.5}>
              {drafts.map((draft, index) => {
                const nonErrorIndex = drafts
                  .slice(0, index)
                  .filter((entry) => !entry.isError).length;
                const previewLine = draft.isError
                  ? draft.errorLine
                  : (draftRenderLines[nonErrorIndex] ?? '');
                const draftErrors = draftValidation[index]?.errors ?? [];
                return (
                  <Paper
                    key={draft.id}
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      bgcolor: 'background.paper',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1.5,
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 1.5,
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Typography variant="subtitle2" fontWeight={700}>
                        {index + 1}. {draft.type.toUpperCase()}
                      </Typography>
                      <Stack direction="row" spacing={1} alignItems="center">
                        {getOptionalFields(draft.type).length > 0 && (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={(event) => {
                              setFieldMenuAnchor(event.currentTarget);
                              setFieldMenuDraftId(draft.id);
                            }}
                          >
                            Fields
                          </Button>
                        )}
                        <Menu
                          anchorEl={fieldMenuAnchor}
                          open={fieldMenuDraftId === draft.id}
                          onClose={() => {
                            setFieldMenuAnchor(null);
                            setFieldMenuDraftId(null);
                          }}
                          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                        >
                          {getOptionalFields(draft.type).map((field) => {
                            const visibility =
                              fieldVisibility[draft.id] ?? getInitialVisibility(draft);
                            const checked = visibility[field] ?? false;
                            const label = (() => {
                              switch (field) {
                                case 'priority':
                                  return 'Priority';
                                case 'comment':
                                  return 'Label / comment';
                                case 'limit':
                                  return 'Limit';
                                case 'repeat':
                                  return 'Repeat';
                                case 'from':
                                  return 'Spend from';
                                case 'previous':
                                  return 'Use previous month';
                                case 'adjustment':
                                  return 'Adjustment';
                                case 'full':
                                  return 'Use full scheduled amount';
                                default:
                                  return field;
                              }
                            })();
                            return (
                              <MenuItem
                                key={`${draft.id}-${field}`}
                                onClick={() => handleFieldToggle(draft, field, !checked)}
                              >
                                <Checkbox checked={checked} size="small" />
                                <Typography variant="body2">{label}</Typography>
                              </MenuItem>
                            );
                          })}
                        </Menu>
                        <Button
                          color="error"
                          variant="outlined"
                          size="small"
                          onClick={() => removeDraft(draft.id)}
                        >
                          Remove
                        </Button>
                      </Stack>
                    </Box>

                    {draftErrors.length === 0 && previewLine && (
                      <Box
                        component="pre"
                        sx={{
                          m: 0,
                          px: 1,
                          py: 0.75,
                          borderRadius: 1,
                          border: '1px solid',
                          borderColor: 'divider',
                          bgcolor: 'background.default',
                          fontFamily: 'monospace',
                          fontSize: '0.75rem',
                          whiteSpace: 'pre-wrap',
                          color: 'text.primary',
                        }}
                      >
                        {previewLine}
                      </Box>
                    )}
                    {draftErrors.length > 0 && (
                      <Alert
                        severity="error"
                        variant="outlined"
                        sx={{
                          py: 0.25,
                          '& .MuiAlert-message': { whiteSpace: 'pre-wrap' },
                        }}
                      >
                        {draftErrors.join('\n')}
                      </Alert>
                    )}

                    {(fieldVisibility[draft.id] ?? getInitialVisibility(draft)).comment && (
                      <TextField
                        label="Label / comment"
                        size="small"
                        multiline
                        minRows={1}
                        value={draft.comment}
                        onChange={(event) => updateDraft(draft.id, { comment: event.target.value })}
                        placeholder="Example: Disney"
                      />
                    )}

                    {draft.type === 'simple' && (
                      <Box
                        sx={{
                          display: 'grid',
                          gap: 1.5,
                          gridTemplateColumns: {
                            xs: '1fr',
                            md: 'repeat(4, minmax(140px, 1fr))',
                          },
                        }}
                      >
                        <TextField
                          size="small"
                          label="Monthly amount"
                          type="number"
                          value={draft.monthly}
                          onChange={(event) =>
                            updateDraft(draft.id, { monthly: event.target.value })
                          }
                        />
                        {(fieldVisibility[draft.id] ?? getInitialVisibility(draft)).priority && (
                          <TextField
                            size="small"
                            label="Priority"
                            type="number"
                            value={draft.priority}
                            onChange={(event) =>
                              updateDraft(draft.id, { priority: event.target.value })
                            }
                          />
                        )}
                        {(fieldVisibility[draft.id] ?? getInitialVisibility(draft)).limit &&
                          draft.limitEnabled && (
                            <Box sx={{ gridColumn: '1 / -1' }}>
                              <Box sx={groupBoxSx}>
                                <Typography variant="caption" sx={groupTitleSx}>
                                  Limit
                                </Typography>
                                <TextField
                                  size="small"
                                  label="Amount"
                                  type="number"
                                  value={draft.limitAmount}
                                  onChange={(event) =>
                                    updateDraft(draft.id, { limitAmount: event.target.value })
                                  }
                                />
                                <FormControl size="small">
                                  <InputLabel id={`limit-period-${draft.id}`}>Period</InputLabel>
                                  <Select
                                    labelId={`limit-period-${draft.id}`}
                                    label="Period"
                                    value={draft.limitPeriod}
                                    onChange={(event) =>
                                      updateLimitPeriod(draft.id, event.target.value as LimitPeriod)
                                    }
                                  >
                                    <MenuItem value="daily">Daily</MenuItem>
                                    <MenuItem value="weekly">Weekly</MenuItem>
                                    <MenuItem value="monthly">Monthly</MenuItem>
                                  </Select>
                                </FormControl>
                                <TextField
                                  size="small"
                                  label="Start"
                                  type="date"
                                  InputLabelProps={{ shrink: true }}
                                  value={draft.limitStart}
                                  disabled={draft.limitPeriod !== 'weekly'}
                                  onChange={(event) =>
                                    updateDraft(draft.id, { limitStart: event.target.value })
                                  }
                                />
                              </Box>
                            </Box>
                          )}
                      </Box>
                    )}

                    {draft.type === 'percentage' && (
                      <Box
                        sx={{
                          display: 'grid',
                          gap: 1.5,
                          gridTemplateColumns: {
                            xs: '1fr',
                            md: 'repeat(4, minmax(140px, 1fr))',
                          },
                        }}
                      >
                        <TextField
                          size="small"
                          label="Percent"
                          type="number"
                          value={draft.percent}
                          onChange={(event) =>
                            updateDraft(draft.id, { percent: event.target.value })
                          }
                        />
                        <FormControl size="small">
                          <InputLabel id={`category-select-${draft.id}`}>Category</InputLabel>
                          <Select
                            labelId={`category-select-${draft.id}`}
                            label="Category"
                            value={draft.category}
                            onChange={(event) =>
                              updateDraft(draft.id, { category: event.target.value })
                            }
                          >
                            {groupedCategoryOptions.flatMap((group) => [
                              <ListSubheader key={`${draft.id}-${group.groupName}`}>
                                {group.groupName}
                              </ListSubheader>,
                              ...group.options.map((option) => (
                                <MenuItem
                                  key={`${draft.id}-${group.groupName}-${option.name}`}
                                  value={option.name}
                                >
                                  {option.label}
                                </MenuItem>
                              )),
                            ])}
                          </Select>
                        </FormControl>
                        {(fieldVisibility[draft.id] ?? getInitialVisibility(draft)).priority && (
                          <TextField
                            size="small"
                            label="Priority"
                            type="number"
                            value={draft.priority}
                            onChange={(event) =>
                              updateDraft(draft.id, { priority: event.target.value })
                            }
                          />
                        )}
                        {(fieldVisibility[draft.id] ?? getInitialVisibility(draft)).previous && (
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
                            sx={compactLabelSx}
                          />
                        )}
                      </Box>
                    )}

                    {draft.type === 'periodic' && (
                      <Box
                        sx={{
                          display: 'grid',
                          gap: 1.5,
                          gridTemplateColumns: {
                            xs: '1fr',
                            md: 'repeat(4, minmax(140px, 1fr))',
                          },
                        }}
                      >
                        <TextField
                          size="small"
                          label="Amount"
                          type="number"
                          value={draft.amount}
                          onChange={(event) =>
                            updateDraft(draft.id, { amount: event.target.value })
                          }
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
                        {(fieldVisibility[draft.id] ?? getInitialVisibility(draft)).priority && (
                          <TextField
                            size="small"
                            label="Priority"
                            type="number"
                            value={draft.priority}
                            onChange={(event) =>
                              updateDraft(draft.id, { priority: event.target.value })
                            }
                          />
                        )}
                        {(fieldVisibility[draft.id] ?? getInitialVisibility(draft)).limit &&
                          draft.limitEnabled && (
                            <Box sx={{ gridColumn: '1 / -1' }}>
                              <Box sx={groupBoxSx}>
                                <Typography variant="caption" sx={groupTitleSx}>
                                  Limit
                                </Typography>
                                <TextField
                                  size="small"
                                  label="Amount"
                                  type="number"
                                  value={draft.limitAmount}
                                  onChange={(event) =>
                                    updateDraft(draft.id, { limitAmount: event.target.value })
                                  }
                                />
                                <FormControl size="small">
                                  <InputLabel id={`period-limit-${draft.id}`}>Period</InputLabel>
                                  <Select
                                    labelId={`period-limit-${draft.id}`}
                                    label="Period"
                                    value={draft.limitPeriod}
                                    onChange={(event) =>
                                      updateLimitPeriod(draft.id, event.target.value as LimitPeriod)
                                    }
                                  >
                                    <MenuItem value="daily">Daily</MenuItem>
                                    <MenuItem value="weekly">Weekly</MenuItem>
                                    <MenuItem value="monthly">Monthly</MenuItem>
                                  </Select>
                                </FormControl>
                                <TextField
                                  size="small"
                                  label="Start"
                                  type="date"
                                  InputLabelProps={{ shrink: true }}
                                  value={draft.limitStart}
                                  disabled={draft.limitPeriod !== 'weekly'}
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
                                  sx={compactLabelSx}
                                />
                              </Box>
                            </Box>
                          )}
                      </Box>
                    )}

                    {draft.type === 'by' && (
                      <Box
                        sx={{
                          display: 'grid',
                          gap: 1.5,
                          gridTemplateColumns: {
                            xs: '1fr',
                            md: 'repeat(4, minmax(140px, 1fr))',
                          },
                        }}
                      >
                        <TextField
                          size="small"
                          label="Amount"
                          type="number"
                          value={draft.amount}
                          onChange={(event) =>
                            updateDraft(draft.id, { amount: event.target.value })
                          }
                        />
                        <TextField
                          size="small"
                          label="By (YYYY-MM)"
                          placeholder="2026-01"
                          value={draft.month}
                          onChange={(event) => updateDraft(draft.id, { month: event.target.value })}
                        />
                        {(fieldVisibility[draft.id] ?? getInitialVisibility(draft)).priority && (
                          <TextField
                            size="small"
                            label="Priority"
                            type="number"
                            value={draft.priority}
                            onChange={(event) =>
                              updateDraft(draft.id, { priority: event.target.value })
                            }
                          />
                        )}
                        {draft.type === 'by' &&
                          (fieldVisibility[draft.id] ?? getInitialVisibility(draft)).from && (
                            <TextField
                              size="small"
                              label="Spend from (YYYY-MM)"
                              placeholder="2025-10"
                              value={draft.from}
                              onChange={(event) =>
                                updateDraft(draft.id, { from: event.target.value })
                              }
                            />
                          )}
                        {(fieldVisibility[draft.id] ?? getInitialVisibility(draft)).repeat &&
                          draft.repeatUnit && (
                            <Box sx={{ gridColumn: '1 / -1' }}>
                              <Box sx={groupBoxSx}>
                                <Typography variant="caption" sx={groupTitleSx}>
                                  Repeat
                                </Typography>
                                <TextField
                                  size="small"
                                  label="Every"
                                  type="number"
                                  placeholder="1"
                                  value={draft.repeat}
                                  onChange={(event) =>
                                    updateDraft(draft.id, { repeat: event.target.value })
                                  }
                                />
                                <FormControl size="small">
                                  <InputLabel id={`repeat-unit-${draft.id}`}>Unit</InputLabel>
                                  <Select
                                    labelId={`repeat-unit-${draft.id}`}
                                    label="Unit"
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
                              </Box>
                            </Box>
                          )}
                      </Box>
                    )}

                    {draft.type === 'schedule' && (
                      <Box
                        sx={{
                          display: 'grid',
                          gap: 1.5,
                          gridTemplateColumns: {
                            xs: '1fr',
                            md: 'repeat(4, minmax(140px, 1fr))',
                          },
                        }}
                      >
                        <FormControl size="small">
                          <InputLabel id={`schedule-select-${draft.id}`}>Schedule</InputLabel>
                          <Select
                            labelId={`schedule-select-${draft.id}`}
                            label="Schedule"
                            value={draft.name}
                            onChange={(event) =>
                              updateDraft(draft.id, { name: event.target.value })
                            }
                          >
                            {scheduleOptions.map((option) => (
                              <MenuItem key={`${draft.id}-${option}`} value={option}>
                                {option}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        {(fieldVisibility[draft.id] ?? getInitialVisibility(draft)).priority && (
                          <TextField
                            size="small"
                            label="Priority"
                            type="number"
                            value={draft.priority}
                            onChange={(event) =>
                              updateDraft(draft.id, { priority: event.target.value })
                            }
                          />
                        )}
                        {(fieldVisibility[draft.id] ?? getInitialVisibility(draft)).adjustment && (
                          <TextField
                            size="small"
                            label="Adjustment (%)"
                            type="number"
                            value={draft.adjustment}
                            onChange={(event) =>
                              updateDraft(draft.id, { adjustment: event.target.value })
                            }
                          />
                        )}
                        {(fieldVisibility[draft.id] ?? getInitialVisibility(draft)).full && (
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
                            sx={compactLabelSx}
                          />
                        )}
                      </Box>
                    )}

                    {draft.type === 'average' && (
                      <Box
                        sx={{
                          display: 'grid',
                          gap: 1.5,
                          gridTemplateColumns: {
                            xs: '1fr',
                            md: 'repeat(4, minmax(140px, 1fr))',
                          },
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
                        {(fieldVisibility[draft.id] ?? getInitialVisibility(draft)).priority && (
                          <TextField
                            size="small"
                            label="Priority"
                            type="number"
                            value={draft.priority}
                            onChange={(event) =>
                              updateDraft(draft.id, { priority: event.target.value })
                            }
                          />
                        )}
                      </Box>
                    )}

                    {draft.type === 'copy' && (
                      <Box
                        sx={{
                          display: 'grid',
                          gap: 1.5,
                          gridTemplateColumns: {
                            xs: '1fr',
                            md: 'repeat(4, minmax(140px, 1fr))',
                          },
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
                        {(fieldVisibility[draft.id] ?? getInitialVisibility(draft)).priority && (
                          <TextField
                            size="small"
                            label="Priority"
                            type="number"
                            value={draft.priority}
                            onChange={(event) =>
                              updateDraft(draft.id, { priority: event.target.value })
                            }
                          />
                        )}
                      </Box>
                    )}

                    {draft.type === 'remainder' && (
                      <Box
                        sx={{
                          display: 'grid',
                          gap: 1.5,
                          gridTemplateColumns: {
                            xs: '1fr',
                            md: 'repeat(4, minmax(140px, 1fr))',
                          },
                        }}
                      >
                        <TextField
                          size="small"
                          label="Weight (default 1)"
                          type="number"
                          value={draft.weight}
                          onChange={(event) =>
                            updateDraft(draft.id, { weight: event.target.value })
                          }
                        />
                        {(fieldVisibility[draft.id] ?? getInitialVisibility(draft)).limit &&
                          draft.limitEnabled && (
                            <Box sx={groupBoxSx}>
                              <Typography variant="caption" sx={groupTitleSx}>
                                Limit
                              </Typography>
                              <TextField
                                size="small"
                                label="Amount"
                                type="number"
                                value={draft.limitAmount}
                                onChange={(event) =>
                                  updateDraft(draft.id, { limitAmount: event.target.value })
                                }
                              />
                              <FormControl size="small">
                                <InputLabel id={`remainder-limit-${draft.id}`}>Period</InputLabel>
                                <Select
                                  labelId={`remainder-limit-${draft.id}`}
                                  label="Period"
                                  value={draft.limitPeriod}
                                  onChange={(event) =>
                                    updateLimitPeriod(draft.id, event.target.value as LimitPeriod)
                                  }
                                >
                                  <MenuItem value="daily">Daily</MenuItem>
                                  <MenuItem value="weekly">Weekly</MenuItem>
                                  <MenuItem value="monthly">Monthly</MenuItem>
                                </Select>
                              </FormControl>
                              <TextField
                                size="small"
                                label="Start"
                                type="date"
                                InputLabelProps={{ shrink: true }}
                                value={draft.limitStart}
                                disabled={draft.limitPeriod !== 'weekly'}
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
                                sx={compactLabelSx}
                              />
                            </Box>
                          )}
                      </Box>
                    )}

                    {draft.type === 'goal' && (
                      <Box
                        sx={{
                          display: 'grid',
                          gap: 1.5,
                          gridTemplateColumns: {
                            xs: '1fr',
                            md: 'repeat(4, minmax(140px, 1fr))',
                          },
                        }}
                      >
                        <TextField
                          size="small"
                          label="Goal amount"
                          type="number"
                          value={draft.amount}
                          onChange={(event) =>
                            updateDraft(draft.id, { amount: event.target.value })
                          }
                        />
                        {getOptionalFields(draft.type).length > 0 && (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={(event) => {
                              setFieldMenuAnchor(event.currentTarget);
                              setFieldMenuDraftId(draft.id);
                            }}
                          >
                            Fields
                          </Button>
                        )}
                      </Box>
                    )}
                  </Paper>
                );
              })}
            </Stack>
          </Stack>

          <Paper
            variant="outlined"
            sx={{
              p: 1.5,
              bgcolor: 'background.paper',
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: { sm: 'center' },
              justifyContent: 'space-between',
              gap: 2,
            }}
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
                  renderValue={(selected) =>
                    templateTypeOptions.find((option) => option.value === selected)?.label ??
                    String(selected)
                  }
                >
                  {templateTypeOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Typography variant="body2">{option.label}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {option.description}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button variant="outlined" size="small" onClick={addDraft}>
                Add
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Priority controls order; add it from Fields when needed.
            </Typography>
          </Paper>

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
            minRows={4}
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
