import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  api,
  type Suggestion,
  type SuggestionComponentStatus,
  type Category,
} from '../services/api';
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

const confidenceClass = (level: string) => {
  switch (level) {
    case 'high':
      return 'bg-emerald-50 text-emerald-700';
    case 'medium':
      return 'bg-amber-50 text-amber-700';
    default:
      return 'bg-rose-50 text-rose-700';
  }
};

const statusTagClass = (status: string) => {
  switch (status) {
    case 'pending':
      return 'bg-amber-50 text-amber-700';
    case 'approved':
      return 'bg-emerald-50 text-emerald-700';
    case 'rejected':
      return 'bg-rose-50 text-rose-700';
    case 'applied':
      return 'bg-blue-50 text-blue-700';
    case 'not-generated':
      return 'bg-slate-100 text-slate-600';
    case 'unknown':
      return 'bg-amber-50 text-amber-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
};

export function SuggestionList({ budgetId }: SuggestionListProps) {
  const queryClient = useQueryClient();
  const [expandedPayees, setExpandedPayees] = useState<Set<string>>(new Set());
  const [correctionModal, setCorrectionModal] = useState<CorrectionModalState | null>(null);
  const [correctionInput, setCorrectionInput] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');

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

  // Fetch categories for the dropdown
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.getCategories(),
  });

  const categories = categoriesData?.categories || [];

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

  const suggestionsJobMutation = useMutation({
    mutationFn: () => api.createSuggestionsJob(budgetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs', budgetId] });
    },
  });

  const correctPayeeMutation = useMutation({
    mutationFn: ({ ids, correction }: { ids: string[]; correction: { payeeName: string } }) =>
      api.bulkCorrectPayeeSuggestions(ids, correction),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
      setCorrectionModal(null);
      setCorrectionInput('');
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
      setCorrectionInput('');
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
    mutationFn: (id: string) => api.retrySuggestion(budgetId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['jobs', budgetId] });
    },
  });

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
    setCorrectionInput('');
    setSelectedCategoryId('');
  };

  const handleCorrectionSubmit = () => {
    if (!correctionModal) return;

    if (correctionModal.type === 'payee') {
      if (!correctionInput.trim()) return;
      correctPayeeMutation.mutate({
        ids: correctionModal.suggestionIds,
        correction: { payeeName: correctionInput.trim() },
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
      <div className="rounded-md bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
        Loading suggestions...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-rose-50 px-6 py-4 text-center text-sm text-rose-700">
        Error loading suggestions: {error.message}
      </div>
    );
  }

  // Group suggestions by payee
  const payeeGroups = groupByPayee(suggestions);

  return (
    <div className="mx-auto w-full max-w-[1200px] p-4">
      <div className="mb-4 flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-slate-800">
          Suggestions ({suggestions.length} transactions, {payeeGroups.length} payees)
        </h2>
        <div className="flex flex-wrap gap-2">
          {hasApprovedChanges && (
            <NavLink
              to="/apply"
              className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
            >
              Apply Changes
              <span
                className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white px-2 text-xs font-bold text-emerald-700 shadow"
                aria-label={`${approvedChangesCount} to apply`}
              >
                {approvedChangesCount}
              </span>
            </NavLink>
          )}
          <button
            className="rounded-md bg-amber-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-900 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => suggestionsJobMutation.mutate()}
            disabled={suggestionsJobMutation.isPending}
          >
            {suggestionsJobMutation.isPending ? 'Starting generation...' : '✨ Generate'}
          </button>
        </div>
      </div>

      {retrySuggestionMutation.isPending && (
        <ProgressBar message="Retrying AI suggestion for payee group..." />
      )}

      {suggestionsJobMutation.error && (
        <div className="mb-3 rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Generate failed: {suggestionsJobMutation.error.message}
        </div>
      )}

      {payeeGroups.length === 0 ? (
        <div className="rounded-md bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
          <p>No suggestions available</p>
          <p className="mt-2 text-xs text-slate-400">
            Click &quot;Generate&quot; to fetch new suggestions
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-px overflow-hidden rounded-md bg-slate-200">
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

            const rowClasses = [
              'transition',
              isExpanded ? 'bg-slate-50' : 'bg-white',
              !isExpanded ? 'hover:bg-slate-50' : '',
              hasApproved && !hasPending ? 'bg-emerald-50 hover:bg-emerald-100' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <div key={group.payeeName} className={rowClasses}>
                {/* Main row - always visible */}
                <div
                  className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-3"
                  onClick={() => toggleExpanded(group.payeeName)}
                >
                  <span className="text-xs text-slate-400">{isExpanded ? '▼' : '▶'}</span>

                  <div className="flex min-w-0 flex-col gap-0.5 md:flex-[0_0_220px]">
                    <span className="text-sm font-medium text-slate-800 md:truncate">
                      {group.payeeName}
                    </span>
                    <span className="text-xs text-slate-400">
                      {group.suggestions.length} txn{group.suggestions.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    {group.hasPayeeSuggestion &&
                      (group.payeeStatus === 'pending' || group.payeeStatus === 'approved') && (
                        <span
                          className={`inline-flex max-w-[180px] items-center truncate rounded px-2 py-0.5 text-xs ${
                            group.payeeStatus === 'approved'
                              ? 'border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700'
                              : 'bg-violet-50 text-violet-700'
                          }`}
                        >
                          → {group.suggestedPayeeName}
                        </span>
                      )}
                    <span
                      className={`inline-flex max-w-[180px] items-center truncate rounded px-2 py-0.5 text-xs ${
                        !group.hasCategorySuggestion
                          ? 'border border-dashed border-slate-300 bg-slate-100 text-slate-500'
                          : group.categoryStatus === 'approved'
                            ? 'border border-sky-200 bg-sky-50 text-sky-700'
                            : 'bg-blue-50 text-blue-700'
                      }`}
                    >
                      {group.proposedCategory}
                    </span>
                    <span
                      className={`inline-flex items-center rounded px-2 py-0.5 text-[0.7rem] font-semibold ${confidenceClass(
                        getConfidenceLevel(group.avgConfidence)
                      )}`}
                    >
                      {Math.round(group.avgConfidence * 100)}%
                    </span>
                  </div>

                  {/* Action buttons */}
                  <div className="flex shrink-0 gap-2 self-end md:self-center">
                    {hasPendingApprovable && (
                      <button
                        className="rounded bg-emerald-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          bulkApproveMutation.mutate(pendingApprovableIds);
                        }}
                        disabled={bulkApproveMutation.isPending}
                        title="Approve all suggestions"
                      >
                        ✓ Approve
                      </button>
                    )}
                    {hasProcessed && (
                      <button
                        className="rounded bg-amber-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          bulkResetMutation.mutate(processedIds);
                        }}
                        disabled={bulkResetMutation.isPending}
                        title="Undo approved/rejected suggestions"
                      >
                        ↩ Undo
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded section - reasoning + actions + transactions */}
                {isExpanded && (
                  <div className="border-t border-slate-200 px-4 pb-4 pt-3 md:pl-7">
                    {/* Suggestion details with reasoning */}
                    <div className="flex flex-col gap-3">
                      {/* Category suggestion */}
                      {group.categoryStatus === 'pending' && (
                        <div className="rounded-md border border-slate-200 bg-white p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-400">
                              Category
                            </span>
                            <span className="text-sm font-medium text-slate-700">
                              {group.hasCategorySuggestion
                                ? group.proposedCategory
                                : 'Not generated'}
                            </span>
                            <span
                              className={`ml-auto rounded px-2 py-0.5 text-[0.65rem] font-semibold ${confidenceClass(
                                getConfidenceLevel(group.categoryConfidence)
                              )}`}
                            >
                              {Math.round(group.categoryConfidence * 100)}%
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-slate-600">
                            {group.hasCategorySuggestion
                              ? group.categoryRationale
                              : 'No suggestion yet. Generate or correct to proceed.'}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              className="rounded bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                              onClick={() =>
                                openCorrectionModal(
                                  'category',
                                  pendingCategoryIds,
                                  group.proposedCategory
                                )
                              }
                            >
                              ✎ Correct
                            </button>
                            <button
                              className="rounded bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
                              onClick={() => retrySuggestionMutation.mutate(firstSuggestion.id)}
                              disabled={retrySuggestionMutation.isPending}
                            >
                              {retrySuggestionMutation.isPending
                                ? '⏳'
                                : group.hasCategorySuggestion
                                  ? '↻'
                                  : '✨'}{' '}
                              {group.hasCategorySuggestion ? 'Retry' : 'Generate'}
                            </button>
                            <button
                              className="rounded bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                              onClick={() => bulkRejectMutation.mutate(rejectableIds)}
                              disabled={bulkRejectMutation.isPending || !hasRejectable}
                            >
                              ✕ Reject
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Payee suggestion (if different from original) */}
                      {group.hasPayeeSuggestion && group.payeeStatus === 'pending' && (
                        <div className="rounded-md border border-slate-200 bg-white p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-400">
                              Payee
                            </span>
                            <span className="text-sm font-medium text-slate-700">
                              {group.payeeName} → {group.suggestedPayeeName}
                            </span>
                            <span
                              className={`ml-auto rounded px-2 py-0.5 text-[0.65rem] font-semibold ${confidenceClass(
                                getConfidenceLevel(group.payeeConfidence)
                              )}`}
                            >
                              {Math.round(group.payeeConfidence * 100)}%
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-slate-600">{group.payeeRationale}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              className="rounded bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                              onClick={() =>
                                openCorrectionModal(
                                  'payee',
                                  pendingPayeeIds,
                                  group.suggestedPayeeName || ''
                                )
                              }
                            >
                              ✎ Correct
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Transactions table */}
                    <div className="mt-3 overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr>
                            <th className="bg-slate-100 px-3 py-2 text-left text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">
                              Date
                            </th>
                            <th className="bg-slate-100 px-3 py-2 text-left text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">
                              Account
                            </th>
                            <th className="bg-slate-100 px-3 py-2 text-left text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">
                              Amount
                            </th>
                            <th className="bg-slate-100 px-3 py-2 text-left text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">
                              Status
                            </th>
                            <th className="bg-slate-100 px-3 py-2 text-left text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.suggestions.map((suggestion) => {
                            const statusClass = getStatusClass(suggestion);
                            return (
                              <tr
                                key={suggestion.id}
                                className={`border-t border-slate-100 ${
                                  ['approved', 'rejected', 'applied'].includes(statusClass)
                                    ? 'opacity-50'
                                    : ''
                                }`}
                              >
                                <td className="px-3 py-2">
                                  {formatDate(suggestion.transactionDate)}
                                </td>
                                <td className="px-3 py-2">
                                  {suggestion.transactionAccountName || '—'}
                                </td>
                                <td className="px-3 py-2 text-right font-mono text-[0.7rem]">
                                  {formatAmount(suggestion.transactionAmount)}
                                </td>
                                <td className="px-3 py-2">
                                  <span
                                    className={`inline-flex rounded px-2 py-0.5 text-[0.65rem] font-semibold uppercase ${statusTagClass(
                                      statusClass
                                    )}`}
                                  >
                                    {getStatusLabel(suggestion)}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {suggestion.status === 'pending' && (
                                    <button
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
                                      onClick={() =>
                                        approveSuggestionMutation.mutate(suggestion.id)
                                      }
                                      disabled={
                                        approveSuggestionMutation.isPending ||
                                        !isApprovableSuggestion(suggestion)
                                      }
                                      title={
                                        isApprovableSuggestion(suggestion)
                                          ? 'Approve'
                                          : 'No suggestion to approve'
                                      }
                                      aria-label="Approve"
                                    >
                                      ✓
                                    </button>
                                  )}
                                  {(suggestion.status === 'approved' ||
                                    suggestion.status === 'rejected') && (
                                    <button
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-amber-500 text-xs font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
                                      onClick={() => resetSuggestionMutation.mutate(suggestion.id)}
                                      disabled={resetSuggestionMutation.isPending}
                                      title="Undo"
                                      aria-label="Undo"
                                    >
                                      ↩
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Correction Modal */}
      {correctionModal && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40"
          onClick={() => setCorrectionModal(null)}
        >
          <div
            className="w-[90%] max-w-sm rounded-lg bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-800">
              Provide Correct {correctionModal.type === 'payee' ? 'Payee' : 'Category'}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Current suggestion: <strong>{correctionModal.currentValue}</strong>
            </p>

            {correctionModal.type === 'payee' ? (
              <input
                type="text"
                className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Enter correct payee name..."
                value={correctionInput}
                onChange={(e) => setCorrectionInput(e.target.value)}
                autoFocus
              />
            ) : (
              <select
                className="mt-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                autoFocus
              >
                <option value="">-- Select a category --</option>
                {Object.entries(groupedCategories).map(([groupName, cats]) => (
                  <optgroup key={groupName} label={groupName}>
                    {cats.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                onClick={() => setCorrectionModal(null)}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleCorrectionSubmit}
                disabled={
                  correctPayeeMutation.isPending ||
                  correctCategoryMutation.isPending ||
                  (correctionModal.type === 'payee' ? !correctionInput.trim() : !selectedCategoryId)
                }
              >
                Submit Correction
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-4 rounded-md bg-slate-100 px-3 py-2 text-[0.7rem] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-emerald-500"></span> ≥80%
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-amber-400"></span> 50-79%
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-rose-400"></span> &lt;50%
        </span>
        <span className="text-slate-400 md:ml-auto">Click row to expand</span>
      </div>
    </div>
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
