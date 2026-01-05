import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Autocomplete, { createFilterOptions } from '@mui/material/Autocomplete';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import { alpha } from '@mui/material/styles';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import ListSubheader from '@mui/material/ListSubheader';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import {
  api,
  type Suggestion,
  type SuggestionComponentStatus,
  type Category,
  type Payee,
} from '../services/api';
import { loadCategorySuggestionSettings } from '../services/categorySuggestionSettings';
import { ProgressBar } from './ProgressBar';

interface SuggestionListProps {
  budgetId: string;
}

/** Group of suggestions for a single payee */
interface PayeeGroup {
  payeeName: string;
  suggestedPayeeName: string | null;
  suggestions: Suggestion[];
  pendingCount: number;
  proposedCategory: string;
  proposedCategoryId: string;
  avgConfidence: number;
  payeeConfidence: number;
  categoryConfidence: number;
  payeeRationale: string;
  categoryRationale: string;
  hasPayeeSuggestion: boolean;
  hasCategorySuggestion: boolean;
  payeeStatus: SuggestionComponentStatus;
  categoryStatus: SuggestionComponentStatus;
}

/** Correction modal state */
interface CorrectionModalState {
  isOpen: boolean;
  type: 'payee' | 'category';
  suggestionIds: string[];
  currentValue: string;
}

type PayeeOption = { id: string; name: string; type: 'existing' | 'add_new' };
type PayeeCorrectionSelection =
  | { mode: 'existing'; payeeId: string }
  | { mode: 'new'; name: string };

const addNewPayeeOption: PayeeOption = { id: 'add_new', name: 'Add new payee', type: 'add_new' };
const filterPayeeOptions = createFilterOptions<PayeeOption>({ limit: 50 });

const confidenceColor = (level: string): 'success' | 'warning' | 'error' => {
  switch (level) {
    case 'high':
      return 'success';
    case 'medium':
      return 'warning';
    default:
      return 'error';
  }
};

const statusColor = (status: string): 'warning' | 'success' | 'error' | 'info' | 'default' => {
  switch (status) {
    case 'pending':
      return 'warning';
    case 'approved':
      return 'success';
    case 'rejected':
      return 'error';
    case 'applied':
      return 'info';
    case 'not-generated':
      return 'default';
    case 'unknown':
      return 'warning';
    default:
      return 'default';
  }
};

export function SuggestionList({ budgetId }: SuggestionListProps) {
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down('sm'));
  const queryClient = useQueryClient();
  const [expandedPayees, setExpandedPayees] = useState<Set<string>>(new Set());
  const [correctionModal, setCorrectionModal] = useState<CorrectionModalState | null>(null);
  const [payeeSelection, setPayeeSelection] = useState<PayeeCorrectionSelection | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const { data: appConfig } = useQuery({
    queryKey: ['app-config'],
    queryFn: () => api.getAppConfig(),
  });
  const llmConfigured = appConfig?.llmConfigured ?? true;
  const categorySuggestionSettings = useMemo(
    () =>
      loadCategorySuggestionSettings({
        allowAI: llmConfigured,
        defaultUseAI: llmConfigured,
      }),
    [llmConfigured]
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ['suggestions', budgetId],
    queryFn: () => api.getSuggestionsByBudgetId(budgetId),
    enabled: !!budgetId,
  });

  const { data: approvedChangesCount } = useQuery({
    queryKey: ['approved-changes', budgetId],
    queryFn: () => api.getApprovedChanges(budgetId),
    enabled: !!budgetId,
    select: (approved) => approved.changes.length,
  });

  const { data: uncategorizedData, isLoading: isUncategorizedLoading } = useQuery({
    queryKey: ['uncategorized', budgetId],
    queryFn: () => api.getUncategorizedTransactions(budgetId),
    enabled: !!budgetId,
  });

  // Fetch categories for the dropdown
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.getCategories(),
  });

  const { data: payeesData } = useQuery({
    queryKey: ['payees'],
    queryFn: () => api.getPayees(),
  });

  const categories = categoriesData?.categories || [];
  const payeeOptions: PayeeOption[] = (payeesData?.payees || []).map((payee: Payee) => ({
    id: payee.id,
    name: payee.name,
    type: 'existing',
  }));
  const uncategorizedCount = uncategorizedData?.transactions.length ?? 0;

  // Group categories by group name for better UX
  const groupedCategories = categories.reduce(
    (acc, cat) => {
      const group = cat.groupName || 'Uncategorized';
      if (!acc[group]) acc[group] = [];
      acc[group].push(cat);
      return acc;
    },
    {} as Record<string, Category[]>
  );

  const selectedPayeeOption =
    payeeSelection?.mode === 'existing'
      ? (payeeOptions.find((option) => option.id === payeeSelection.payeeId) ?? null)
      : payeeSelection?.mode === 'new'
        ? addNewPayeeOption
        : null;
  const payeeInputValue =
    payeeSelection?.mode === 'existing'
      ? (payeeOptions.find((option) => option.id === payeeSelection.payeeId)?.name ?? '')
      : payeeSelection?.mode === 'new'
        ? payeeSelection.name
        : '';
  const hasValidPayeeCorrection =
    payeeSelection?.mode === 'existing'
      ? Boolean(payeeOptions.find((option) => option.id === payeeSelection.payeeId))
      : payeeSelection?.mode === 'new' && payeeSelection.name.trim().length > 0;

  const suggestionsJobMutation = useMutation({
    mutationFn: () => api.createSuggestionsJob(budgetId, categorySuggestionSettings.useAI),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs', budgetId] });
    },
  });

  const correctPayeeMutation = useMutation({
    mutationFn: ({
      ids,
      correction,
    }: {
      ids: string[];
      correction: { payeeId?: string; payeeName: string };
    }) => api.bulkCorrectPayeeSuggestions(ids, correction),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
      setCorrectionModal(null);
      setPayeeSelection(null);
    },
  });

  const correctCategoryMutation = useMutation({
    mutationFn: ({
      ids,
      correction,
    }: {
      ids: string[];
      correction: { categoryId: string; categoryName?: string };
    }) => api.bulkCorrectCategorySuggestions(ids, correction),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
      setCorrectionModal(null);
      setPayeeSelection(null);
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: (ids: string[]) => api.bulkApproveSuggestions(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
    },
  });

  const bulkRejectMutation = useMutation({
    mutationFn: (ids: string[]) => api.bulkRejectSuggestions(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
    },
  });

  const bulkResetMutation = useMutation({
    mutationFn: (ids: string[]) => api.bulkResetSuggestions(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
    },
  });

  const approveSuggestionMutation = useMutation({
    mutationFn: (id: string) => api.approveSuggestion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
    },
  });

  const resetSuggestionMutation = useMutation({
    mutationFn: (id: string) => api.resetSuggestion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
    },
  });

  const retrySuggestionMutation = useMutation({
    mutationFn: (id: string) => api.retrySuggestion(budgetId, id, categorySuggestionSettings.useAI),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['jobs', budgetId] });
    },
  });

  const generateLabel = categorySuggestionSettings.useAI ? 'Generate (AI)' : 'Generate';
  const generateHint = categorySuggestionSettings.useAI
    ? 'Click "Generate (AI)" to request new suggestions'
    : 'Click "Generate" to request new suggestions';

  const toggleExpanded = (payeeName: string) => {
    setExpandedPayees((prev) => {
      const next = new Set(prev);
      if (next.has(payeeName)) {
        next.delete(payeeName);
      } else {
        next.add(payeeName);
      }
      return next;
    });
  };

  const openCorrectionModal = (
    type: 'payee' | 'category',
    suggestionIds: string[],
    currentValue: string
  ) => {
    setCorrectionModal({ isOpen: true, type, suggestionIds, currentValue });
    setPayeeSelection(null);
    setSelectedCategoryId('');
  };

  const handleCorrectionSubmit = () => {
    if (!correctionModal) return;

    if (correctionModal.type === 'payee') {
      if (!payeeSelection) return;
      if (payeeSelection.mode === 'new') {
        const trimmedName = payeeSelection.name.trim();
        if (!trimmedName) return;
        correctPayeeMutation.mutate({
          ids: correctionModal.suggestionIds,
          correction: { payeeName: trimmedName },
        });
        return;
      }
      const selectedPayee = payeeOptions.find((option) => option.id === payeeSelection.payeeId);
      if (!selectedPayee?.name) return;
      correctPayeeMutation.mutate({
        ids: correctionModal.suggestionIds,
        correction: { payeeId: payeeSelection.payeeId, payeeName: selectedPayee.name },
      });
    } else {
      // For category, use the selected category from dropdown
      if (!selectedCategoryId) return;
      const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
      correctCategoryMutation.mutate({
        ids: correctionModal.suggestionIds,
        correction: {
          categoryId: selectedCategoryId,
          categoryName: selectedCategory?.name,
        },
      });
    }
  };

  // Filter out applied suggestions - they appear in History page
  const suggestions = (data?.suggestions || []).filter((s) => s.status !== 'applied');
  const hasApprovedChanges = (approvedChangesCount ?? 0) > 0;

  if (isLoading) {
    return (
      <Paper
        variant="outlined"
        sx={{ px: 4, py: 6, textAlign: 'center', bgcolor: 'background.default' }}
      >
        <Typography variant="body2" color="text.secondary">
          Loading suggestions...
        </Typography>
      </Paper>
    );
  }

  if (error) {
    return (
      <Alert severity="error" variant="outlined">
        Error loading suggestions: {error.message}
      </Alert>
    );
  }

  // Group suggestions by payee
  const payeeGroups = groupByPayee(suggestions);

  return (
    <Box sx={{ mx: 'auto', width: '100%', maxWidth: 1200, p: 3 }}>
      <Box
        sx={{
          mb: 3,
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { sm: 'center' },
          justifyContent: 'space-between',
          gap: 2,
          borderBottom: '1px solid',
          borderColor: 'divider',
          pb: 2,
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography variant="h6" fontWeight={600} color="text.primary">
            Category suggestions ({suggestions.length} transactions, {payeeGroups.length} payees)
          </Typography>
          <Typography
            component={NavLink}
            to="/history"
            variant="caption"
            color="text.secondary"
            sx={{
              textDecoration: 'none',
              alignSelf: 'flex-start',
              '&:hover': { color: 'text.primary' },
            }}
          >
            View applied history
          </Typography>
        </Box>
        <Stack direction="row" spacing={2} flexWrap="wrap">
          {hasApprovedChanges && (
            <Button
              component={NavLink}
              to="/apply"
              variant="contained"
              color="success"
              size="small"
            >
              <Badge
                color="default"
                badgeContent={approvedChangesCount}
                sx={{ '& .MuiBadge-badge': { bgcolor: 'common.white', color: 'success.main' } }}
              >
                Apply Changes
              </Badge>
            </Button>
          )}
          {(isUncategorizedLoading || uncategorizedCount > 0) && (
            <Button
              variant="contained"
              color="warning"
              size="small"
              onClick={() => suggestionsJobMutation.mutate()}
              disabled={
                suggestionsJobMutation.isPending ||
                isUncategorizedLoading ||
                uncategorizedCount === 0
              }
            >
              {suggestionsJobMutation.isPending ? 'Starting generation...' : generateLabel}
            </Button>
          )}
        </Stack>
      </Box>

      {retrySuggestionMutation.isPending && (
        <ProgressBar
          message={
            categorySuggestionSettings.useAI
              ? 'Retrying AI suggestion for payee group...'
              : 'Retrying suggestion for payee group...'
          }
        />
      )}

      {suggestionsJobMutation.error && (
        <Alert severity="error" variant="outlined" sx={{ mb: 2 }}>
          {generateLabel} failed: {suggestionsJobMutation.error.message}
        </Alert>
      )}

      {payeeGroups.length === 0 ? (
        <Paper
          variant="outlined"
          sx={{ px: 4, py: 6, textAlign: 'center', bgcolor: 'background.default' }}
        >
          <Typography variant="body2" color="text.secondary">
            {uncategorizedCount === 0
              ? 'No uncategorized transactions found'
              : 'No suggestions available yet'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {uncategorizedCount === 0 ? 'All transactions are categorized.' : generateHint}
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={0.5}>
          {payeeGroups.map((group) => {
            const isExpanded = expandedPayees.has(group.payeeName);
            const pendingIds = group.suggestions
              .filter((s) => s.status === 'pending')
              .map((s) => s.id);
            const pendingApprovableIds = group.suggestions
              .filter((s) => s.status === 'pending' && isApprovableSuggestion(s))
              .map((s) => s.id);
            const pendingCategoryIds = group.suggestions
              .filter((s) => s.categorySuggestion.status === 'pending')
              .map((s) => s.id);
            const pendingPayeeIds = group.suggestions
              .filter((s) => s.payeeSuggestion.status === 'pending')
              .map((s) => s.id);
            const processedIds = group.suggestions
              .filter((s) => s.status === 'approved' || s.status === 'rejected')
              .map((s) => s.id);
            const approvedIds = group.suggestions
              .filter((s) => s.status === 'approved')
              .map((s) => s.id);
            const hasPending = pendingIds.length > 0;
            const hasPendingApprovable = pendingApprovableIds.length > 0;
            const hasApproved = approvedIds.length > 0;
            const hasProcessed = processedIds.length > 0;
            const firstSuggestion = group.suggestions[0];
            const rejectableIds = group.suggestions
              .filter((s) => s.status === 'pending' && isRejectableSuggestion(s))
              .map((s) => s.id);
            const hasRejectable = rejectableIds.length > 0;

            return (
              <Paper
                key={group.payeeName}
                variant="outlined"
                sx={(theme) => ({
                  bgcolor: isExpanded
                    ? theme.palette.background.default
                    : hasApproved && !hasPending
                      ? alpha(
                          theme.palette.success.main,
                          theme.palette.mode === 'dark' ? 0.18 : 0.08
                        )
                      : theme.palette.background.paper,
                })}
              >
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', md: 'row' },
                    alignItems: { md: 'center' },
                    gap: 2,
                    px: 2,
                    py: 1.5,
                    cursor: 'pointer',
                  }}
                  onClick={() => toggleExpanded(group.payeeName)}
                >
                  <Typography variant="caption" color="text.secondary">
                    {isExpanded ? '▼' : '▶'}
                  </Typography>

                  <Box sx={{ minWidth: { md: 220 }, flex: { md: '0 0 220px' } }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {group.payeeName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {group.suggestions.length} txn{group.suggestions.length !== 1 ? 's' : ''}
                    </Typography>
                  </Box>

                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    flexWrap="wrap"
                    sx={{ flex: 1 }}
                  >
                    {group.hasPayeeSuggestion &&
                      (group.payeeStatus === 'pending' || group.payeeStatus === 'approved') && (
                        <Chip
                          size="small"
                          variant="outlined"
                          color="secondary"
                          label={`→ ${group.suggestedPayeeName}`}
                          sx={{ maxWidth: 200 }}
                        />
                      )}
                    <Chip
                      size="small"
                      variant={group.hasCategorySuggestion ? 'outlined' : 'filled'}
                      color={group.hasCategorySuggestion ? 'info' : 'default'}
                      label={group.proposedCategory}
                      sx={{ maxWidth: 200 }}
                    />
                    <Chip
                      size="small"
                      variant="outlined"
                      color={confidenceColor(getConfidenceLevel(group.avgConfidence))}
                      label={`${Math.round(group.avgConfidence * 100)}%`}
                    />
                  </Stack>

                  <Stack direction="row" spacing={1} alignItems="center">
                    {hasPendingApprovable && (
                      <Button
                        size="small"
                        variant="contained"
                        color="success"
                        onClick={(e) => {
                          e.stopPropagation();
                          bulkApproveMutation.mutate(pendingApprovableIds);
                        }}
                        disabled={bulkApproveMutation.isPending}
                      >
                        Approve
                      </Button>
                    )}
                    {hasProcessed && (
                      <Button
                        size="small"
                        variant="contained"
                        color="warning"
                        onClick={(e) => {
                          e.stopPropagation();
                          bulkResetMutation.mutate(processedIds);
                        }}
                        disabled={bulkResetMutation.isPending}
                      >
                        Undo
                      </Button>
                    )}
                  </Stack>
                </Box>

                {isExpanded && (
                  <Box sx={{ borderTop: '1px solid', borderColor: 'divider', px: 2, py: 2 }}>
                    <Stack spacing={2}>
                      {group.categoryStatus === 'pending' && (
                        <Paper variant="outlined" sx={{ p: 2 }}>
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                            <Typography variant="caption" fontWeight={700} color="text.secondary">
                              Category
                            </Typography>
                            <Typography variant="body2" fontWeight={600}>
                              {group.hasCategorySuggestion
                                ? group.proposedCategory
                                : 'Not generated'}
                            </Typography>
                            <Chip
                              size="small"
                              variant="outlined"
                              color={confidenceColor(getConfidenceLevel(group.categoryConfidence))}
                              label={`${Math.round(group.categoryConfidence * 100)}%`}
                              sx={{ ml: 'auto' }}
                            />
                          </Stack>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                            {group.hasCategorySuggestion
                              ? group.categoryRationale
                              : `No suggestion yet. ${generateLabel} or correct to proceed.`}
                          </Typography>
                          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1.5 }}>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() =>
                                openCorrectionModal(
                                  'category',
                                  pendingCategoryIds,
                                  group.proposedCategory
                                )
                              }
                            >
                              Correct
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              color="warning"
                              onClick={() => retrySuggestionMutation.mutate(firstSuggestion.id)}
                              disabled={retrySuggestionMutation.isPending}
                            >
                              {retrySuggestionMutation.isPending
                                ? 'Working...'
                                : group.hasCategorySuggestion
                                  ? 'Retry'
                                  : generateLabel}
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              onClick={() => bulkRejectMutation.mutate(rejectableIds)}
                              disabled={bulkRejectMutation.isPending || !hasRejectable}
                            >
                              Reject
                            </Button>
                          </Stack>
                        </Paper>
                      )}

                      {group.hasPayeeSuggestion && group.payeeStatus === 'pending' && (
                        <Paper variant="outlined" sx={{ p: 2 }}>
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                            <Typography variant="caption" fontWeight={700} color="text.secondary">
                              Payee
                            </Typography>
                            <Typography variant="body2" fontWeight={600}>
                              {group.payeeName} → {group.suggestedPayeeName}
                            </Typography>
                            <Chip
                              size="small"
                              variant="outlined"
                              color={confidenceColor(getConfidenceLevel(group.payeeConfidence))}
                              label={`${Math.round(group.payeeConfidence * 100)}%`}
                              sx={{ ml: 'auto' }}
                            />
                          </Stack>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                            {group.payeeRationale}
                          </Typography>
                          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1.5 }}>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() =>
                                openCorrectionModal(
                                  'payee',
                                  pendingPayeeIds,
                                  group.suggestedPayeeName || ''
                                )
                              }
                            >
                              Correct
                            </Button>
                          </Stack>
                        </Paper>
                      )}
                    </Stack>

                    {isSmall ? (
                      <Stack spacing={1.5} sx={{ mt: 2 }}>
                        {group.suggestions.map((suggestion) => {
                          const statusClass = getStatusClass(suggestion);
                          const isFaded = ['approved', 'rejected', 'applied'].includes(statusClass);
                          return (
                            <Paper
                              key={suggestion.id}
                              variant="outlined"
                              sx={{
                                p: 1.5,
                                bgcolor: 'background.paper',
                                opacity: isFaded ? 0.6 : 1,
                              }}
                            >
                              <Stack spacing={1}>
                                <Box
                                  sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 1,
                                  }}
                                >
                                  <Box>
                                    <Typography variant="caption" color="text.secondary">
                                      {formatDate(suggestion.transactionDate)}
                                    </Typography>
                                    <Typography variant="body2" fontFamily="monospace">
                                      {formatAmount(suggestion.transactionAmount)}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {suggestion.transactionAccountName || '—'}
                                    </Typography>
                                  </Box>
                                  <Stack direction="row" spacing={1} alignItems="center">
                                    <Chip
                                      size="small"
                                      variant="outlined"
                                      color={statusColor(statusClass)}
                                      label={getStatusLabel(suggestion).toUpperCase()}
                                    />
                                  </Stack>
                                </Box>

                                <Stack direction="row" spacing={1} flexWrap="wrap">
                                  {suggestion.status === 'pending' && (
                                    <Button
                                      size="small"
                                      variant="contained"
                                      color="success"
                                      onClick={() =>
                                        approveSuggestionMutation.mutate(suggestion.id)
                                      }
                                      disabled={
                                        approveSuggestionMutation.isPending ||
                                        !isApprovableSuggestion(suggestion)
                                      }
                                    >
                                      Approve
                                    </Button>
                                  )}
                                  {(suggestion.status === 'approved' ||
                                    suggestion.status === 'rejected') && (
                                    <Button
                                      size="small"
                                      variant="contained"
                                      color="warning"
                                      onClick={() => resetSuggestionMutation.mutate(suggestion.id)}
                                      disabled={resetSuggestionMutation.isPending}
                                    >
                                      Undo
                                    </Button>
                                  )}
                                </Stack>
                              </Stack>
                            </Paper>
                          );
                        })}
                      </Stack>
                    ) : (
                      <Paper variant="outlined" sx={{ mt: 2, bgcolor: 'background.paper' }}>
                        <Table size="small" aria-label="transactions">
                          <TableHead>
                            <TableRow>
                              {['Date', 'Account', 'Amount', 'Status', 'Actions'].map((label) => (
                                <TableCell
                                  key={label}
                                  sx={{
                                    bgcolor: 'background.paper',
                                    borderBottomColor: 'divider',
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    letterSpacing: '0.08em',
                                    textTransform: 'uppercase',
                                    color: 'text.secondary',
                                  }}
                                >
                                  {label}
                                </TableCell>
                              ))}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {group.suggestions.map((suggestion) => {
                              const statusClass = getStatusClass(suggestion);
                              const isFaded = ['approved', 'rejected', 'applied'].includes(
                                statusClass
                              );

                              return (
                                <TableRow key={suggestion.id} sx={{ opacity: isFaded ? 0.6 : 1 }}>
                                  <TableCell sx={{ borderBottomColor: 'divider' }}>
                                    {formatDate(suggestion.transactionDate)}
                                  </TableCell>
                                  <TableCell sx={{ borderBottomColor: 'divider' }}>
                                    {suggestion.transactionAccountName || '—'}
                                  </TableCell>
                                  <TableCell
                                    align="right"
                                    sx={{
                                      borderBottomColor: 'divider',
                                      fontFamily: 'monospace',
                                      fontSize: '0.75rem',
                                    }}
                                  >
                                    {formatAmount(suggestion.transactionAmount)}
                                  </TableCell>
                                  <TableCell sx={{ borderBottomColor: 'divider' }}>
                                    <Chip
                                      size="small"
                                      variant="outlined"
                                      color={statusColor(statusClass)}
                                      label={getStatusLabel(suggestion).toUpperCase()}
                                    />
                                  </TableCell>
                                  <TableCell align="right" sx={{ borderBottomColor: 'divider' }}>
                                    {suggestion.status === 'pending' && (
                                      <Button
                                        size="small"
                                        variant="contained"
                                        color="success"
                                        onClick={() =>
                                          approveSuggestionMutation.mutate(suggestion.id)
                                        }
                                        disabled={
                                          approveSuggestionMutation.isPending ||
                                          !isApprovableSuggestion(suggestion)
                                        }
                                      >
                                        Approve
                                      </Button>
                                    )}
                                    {(suggestion.status === 'approved' ||
                                      suggestion.status === 'rejected') && (
                                      <Button
                                        size="small"
                                        variant="contained"
                                        color="warning"
                                        onClick={() =>
                                          resetSuggestionMutation.mutate(suggestion.id)
                                        }
                                        disabled={resetSuggestionMutation.isPending}
                                      >
                                        Undo
                                      </Button>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </Paper>
                    )}
                  </Box>
                )}
              </Paper>
            );
          })}
        </Stack>
      )}

      <Dialog
        open={Boolean(correctionModal)}
        onClose={() => setCorrectionModal(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          Provide Correct {correctionModal?.type === 'payee' ? 'Payee' : 'Category'}
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Current suggestion: <strong>{correctionModal?.currentValue}</strong>
          </Typography>

          {correctionModal?.type === 'payee' ? (
            <Autocomplete
              options={[...payeeOptions, addNewPayeeOption]}
              value={selectedPayeeOption}
              inputValue={payeeInputValue}
              onInputChange={(_, newInputValue, reason) => {
                if (reason === 'input') {
                  setPayeeSelection({ mode: 'new', name: newInputValue });
                }
                if (reason === 'clear') {
                  setPayeeSelection(null);
                }
              }}
              onChange={(_, newValue) => {
                if (!newValue) {
                  setPayeeSelection(null);
                  return;
                }
                if (typeof newValue === 'string') {
                  setPayeeSelection({ mode: 'new', name: newValue });
                  return;
                }
                if (newValue.type === 'add_new') {
                  setPayeeSelection({
                    mode: 'new',
                    name: payeeSelection?.mode === 'new' ? payeeSelection.name : '',
                  });
                  return;
                }
                setPayeeSelection({ mode: 'existing', payeeId: newValue.id });
              }}
              getOptionLabel={(option) => (typeof option === 'string' ? option : option.name)}
              isOptionEqualToValue={(option, value) =>
                typeof option !== 'string' &&
                typeof value !== 'string' &&
                option.id === value.id &&
                option.type === value.type
              }
              filterOptions={(options, params) => {
                const existingOptions = options.filter((option) => option.type !== 'add_new');
                const filtered = filterPayeeOptions(existingOptions, params);
                const inputValue = params.inputValue.trim();
                if (!inputValue) return filtered;
                const match = existingOptions.some(
                  (option) => option.name.toLowerCase() === inputValue.toLowerCase()
                );
                return match ? filtered : [...filtered, addNewPayeeOption];
              }}
              noOptionsText={
                payeeInputValue.trim().length === 0
                  ? 'Start typing to search payees'
                  : 'No matching payees'
              }
              fullWidth
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Correct payee"
                  placeholder="Search or enter payee..."
                  size="small"
                  autoFocus
                  helperText={
                    payeeSelection?.mode === 'new' ? 'Enter the new payee name.' : undefined
                  }
                />
              )}
            />
          ) : (
            <FormControl fullWidth size="small" autoFocus>
              <InputLabel id="correction-category-label">Select a category</InputLabel>
              <Select
                labelId="correction-category-label"
                label="Select a category"
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
              >
                <MenuItem value="">-- Select a category --</MenuItem>
                {Object.entries(groupedCategories).flatMap(([groupName, cats]) => [
                  <ListSubheader key={`group-${groupName}`}>{groupName}</ListSubheader>,
                  ...cats.map((cat) => (
                    <MenuItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </MenuItem>
                  )),
                ])}
              </Select>
            </FormControl>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCorrectionModal(null)} variant="outlined">
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleCorrectionSubmit}
            disabled={
              correctPayeeMutation.isPending ||
              correctCategoryMutation.isPending ||
              (correctionModal?.type === 'payee' ? !hasValidPayeeCorrection : !selectedCategoryId)
            }
          >
            Submit Correction
          </Button>
        </DialogActions>
      </Dialog>

      {payeeGroups.length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
              <Stack direction="row" spacing={1} alignItems="center">
                <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: 'success.main' }} />
                <Typography variant="caption">≥80%</Typography>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: 'warning.main' }} />
                <Typography variant="caption">50-79%</Typography>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: 'error.main' }} />
                <Typography variant="caption">&lt;50%</Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                Click row to expand
              </Typography>
            </Stack>
          </Paper>
        </>
      )}
    </Box>
  );
}

/** Group suggestions by payee, sorted by pending transaction count (desc) */
function groupByPayee(suggestions: Suggestion[]): PayeeGroup[] {
  const groups = new Map<string, Suggestion[]>();

  for (const s of suggestions) {
    const payee = s.transactionPayee || 'Unknown';
    const existing = groups.get(payee) || [];
    existing.push(s);
    groups.set(payee, existing);
  }

  const result: PayeeGroup[] = [];
  for (const [payeeName, items] of groups) {
    const pendingItems = items.filter((s) => s.status === 'pending');
    const avgConfidence = items.reduce((sum, s) => sum + s.confidence, 0) / items.length;
    // Use a suggestion with a category proposal as representative when available
    const representative =
      items.find((s) => Boolean(s.categorySuggestion?.proposedCategoryId)) || items[0];

    // Extract independent payee and category data
    const payeeSuggestion = representative.payeeSuggestion;
    const categorySuggestion = representative.categorySuggestion;

    // Determine if there's a meaningful payee suggestion (different from original)
    const hasPayeeSuggestion = !!(
      payeeSuggestion?.proposedPayeeName && payeeSuggestion.proposedPayeeName !== payeeName
    );
    const hasCategorySuggestion =
      categorySuggestion?.proposedCategoryId !== null &&
      categorySuggestion?.proposedCategoryId !== undefined;

    result.push({
      payeeName,
      suggestedPayeeName:
        payeeSuggestion?.proposedPayeeName || representative.suggestedPayeeName || null,
      suggestions: items.sort(
        (a, b) =>
          new Date(b.transactionDate || 0).getTime() - new Date(a.transactionDate || 0).getTime()
      ),
      pendingCount: pendingItems.length,
      proposedCategory: hasCategorySuggestion
        ? categorySuggestion?.proposedCategoryName ||
          representative.proposedCategoryName ||
          'Unknown'
        : 'Not generated',
      proposedCategoryId:
        categorySuggestion?.proposedCategoryId || representative.proposedCategoryId,
      avgConfidence,
      payeeConfidence: payeeSuggestion?.confidence ?? representative.confidence,
      categoryConfidence: categorySuggestion?.confidence ?? representative.confidence,
      payeeRationale: payeeSuggestion?.rationale || 'No payee change suggested',
      categoryRationale: hasCategorySuggestion
        ? categorySuggestion?.rationale || representative.rationale || 'No rationale provided'
        : 'No suggestion yet',
      hasPayeeSuggestion,
      hasCategorySuggestion,
      payeeStatus: payeeSuggestion?.status || 'skipped',
      categoryStatus: categorySuggestion?.status || 'pending',
    });
  }

  // Sort by pending count descending, then by total count
  return result.sort((a, b) => {
    if (b.pendingCount !== a.pendingCount) return b.pendingCount - a.pendingCount;
    return b.suggestions.length - a.suggestions.length;
  });
}

function getConfidenceLevel(confidence: number): string {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatAmount(amount: number | null): string {
  if (amount === null || amount === undefined) return '—';
  // Actual Budget stores amounts in cents, convert to dollars
  const dollars = amount / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(dollars);
}

function hasPayeeProposal(suggestion: Suggestion): boolean {
  return Boolean(
    suggestion.payeeSuggestion?.proposedPayeeName &&
    suggestion.payeeSuggestion.proposedPayeeName !== suggestion.transactionPayee
  );
}

function hasCategorySuggestion(suggestion: Suggestion): boolean {
  return (
    suggestion.categorySuggestion?.proposedCategoryId !== null &&
    suggestion.categorySuggestion?.proposedCategoryId !== undefined
  );
}

function isCategoryApprovable(suggestion: Suggestion): boolean {
  const categoryId = suggestion.categorySuggestion?.proposedCategoryId;
  return Boolean(categoryId && categoryId !== 'unknown');
}

function isApprovableSuggestion(suggestion: Suggestion): boolean {
  return isCategoryApprovable(suggestion);
}

function isRejectableSuggestion(suggestion: Suggestion): boolean {
  return hasCategorySuggestion(suggestion) || hasPayeeProposal(suggestion);
}

function getStatusLabel(suggestion: Suggestion): string {
  if (!hasCategorySuggestion(suggestion) && !hasPayeeProposal(suggestion)) {
    return 'not generated';
  }
  if (suggestion.categorySuggestion?.proposedCategoryId === 'unknown') {
    return 'unknown';
  }
  return suggestion.status;
}

function getStatusClass(suggestion: Suggestion): string {
  if (!hasCategorySuggestion(suggestion) && !hasPayeeProposal(suggestion)) {
    return 'not-generated';
  }
  if (suggestion.categorySuggestion?.proposedCategoryId === 'unknown') {
    return 'unknown';
  }
  return suggestion.status;
}
