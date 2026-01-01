import { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { api } from '../services/api';
import { loadPayeeMergeSettings } from '../services/payeeMergeSettings';

interface HomeProps {
  budgetId: string;
}

export function Home({ budgetId }: HomeProps) {
  const payeeMergeSettings = useMemo(() => loadPayeeMergeSettings(), []);

  const {
    data: uncategorizedData,
    isLoading: uncategorizedLoading,
    isError: uncategorizedError,
  } = useQuery({
    queryKey: ['uncategorized', budgetId],
    queryFn: () => api.getUncategorizedTransactions(budgetId),
    enabled: !!budgetId,
  });

  const {
    data: payeeMergeData,
    isLoading: payeeMergeLoading,
    isError: payeeMergeError,
  } = useQuery({
    queryKey: ['payee-merge-suggestions', budgetId, payeeMergeSettings.minScore],
    queryFn: () => api.getPayeeMergeSuggestions(budgetId, payeeMergeSettings.minScore),
    enabled: !!budgetId,
  });

  const {
    data: templateData,
    isLoading: templateLoading,
    isError: templateError,
  } = useQuery({
    queryKey: ['templates', budgetId],
    queryFn: () => api.listCategoryTemplates(),
    enabled: !!budgetId,
  });

  const uncategorizedCount = uncategorizedData?.transactions?.length ?? 0;
  const payeeClusters = payeeMergeData?.clusters ?? [];
  const payeeCache = payeeMergeData?.cache;
  const payeeGenerated = Boolean(payeeCache?.payeeHash) || payeeClusters.length > 0;
  const templatesCount = templateData?.templates?.length ?? 0;

  const uncategorizedHint = uncategorizedLoading
    ? 'Checking uncategorized transactions...'
    : uncategorizedError
      ? 'Uncategorized count unavailable.'
      : `${uncategorizedCount} uncategorized transaction${uncategorizedCount === 1 ? '' : 's'}.`;

  const payeeMergeHint = payeeMergeLoading
    ? 'Checking duplicate groups...'
    : payeeMergeError
      ? 'Duplicate group count unavailable.'
      : payeeGenerated
        ? `${payeeClusters.length} duplicate group${payeeClusters.length === 1 ? '' : 's'} found.`
        : 'Not generated yet.';

  const templatesHint = templateLoading
    ? 'Checking templates...'
    : templateError
      ? 'Template count unavailable.'
      : `${templatesCount} template${templatesCount === 1 ? '' : 's'} found.`;

  const cardSx = {
    flex: 1,
    minWidth: { md: 260 },
    p: 3,
    borderRadius: 3,
    bgcolor: 'background.default',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    textDecoration: 'none',
    color: 'inherit',
  } as const;

  const hintSx = {
    alignSelf: 'flex-start',
    bgcolor: 'action.hover',
    borderRadius: 1,
    px: 1,
    py: 0.5,
  } as const;

  return (
    <Box sx={{ mx: 'auto', width: '100%', maxWidth: 1100, p: { xs: 3, md: 5 } }}>
      <Stack spacing={4}>
        <Box>
          <Typography variant="overline" color="text.secondary">
            Dashboard
          </Typography>
        </Box>

        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={3}
          sx={{ flexWrap: { md: 'wrap' } }}
        >
          <Paper
            component={NavLink}
            to="/suggestions"
            variant="outlined"
            sx={cardSx}
            className="shadow-sm transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-xl"
          >
            <Typography variant="subtitle1" fontWeight={600}>
              Category suggestions
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Review AI-powered category suggestions, make corrections, and apply changes.
            </Typography>
            <Box sx={hintSx}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                {uncategorizedHint}
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 'auto' }}>
              Open Category suggestions →
            </Typography>
          </Paper>

          <Paper
            component={NavLink}
            to="/payees/merge"
            variant="outlined"
            sx={cardSx}
            className="shadow-sm transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-xl"
          >
            <Typography variant="subtitle1" fontWeight={600}>
              Duplicate payee suggestions
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Review duplicate payee clusters and merge them into a single clean payee name.
            </Typography>
            <Box sx={hintSx}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                {payeeMergeHint}
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 'auto' }}>
              Open Duplicate payee suggestions →
            </Typography>
          </Paper>

          <Paper
            component={NavLink}
            to="/templates"
            variant="outlined"
            sx={cardSx}
            className="shadow-sm transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-xl"
          >
            <Typography variant="subtitle1" fontWeight={600}>
              Budget Template Studio
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Manage category templates, preview outputs, and keep templates in sync.
            </Typography>
            <Box sx={hintSx}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                {templatesHint}
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 'auto' }}>
              Open Budget Template Studio →
            </Typography>
          </Paper>
        </Stack>
      </Stack>
    </Box>
  );
}
