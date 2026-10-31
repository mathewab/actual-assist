import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type {
  ReportEvidence,
  ReportHistoryMonth,
  ReportObservation,
  SavedReport,
} from '../../domain/reports/ReportTypes';
import { reportRequest } from '../services/reports';
interface Exploration {
  observations: ReportObservation[];
  history: ReportHistoryMonth[];
  observedStart: string | null;
  observedEnd: string | null;
  merchants: Array<{ id: string; name: string; net: number; count: number }>;
}
export function ReportExplore({ report }: { report: SavedReport }) {
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Record<string, string> | null>(
    params.get('observation') ? { observationId: params.get('observation')! } : null
  );
  const [offset, setOffset] = useState(0);
  const available = Boolean(report.analysis);
  const overview = useQuery({
    queryKey: ['report-explore', report.id],
    queryFn: () => reportRequest<Exploration>(`/${report.id}/observations`),
    enabled: available,
  });
  const rows = useQuery({
    queryKey: ['report-rows', report.id, filter, offset],
    queryFn: () =>
      reportRequest<{
        rows: ReportEvidence[];
        total: number;
        netSpending: number;
        grossSpending: number;
        refunds: number;
        periodTotals: Array<{ month: string; netSpending: number }>;
      }>(
        `/${report.id}/transactions?${new URLSearchParams({ ...filter, limit: '25', offset: String(offset) })}`
      ),
    enabled: available && Boolean(filter),
  });
  const money = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: report.facts.currency }).format(
      n / 100
    );
  const open = (next: Record<string, string>) => {
    setOffset(0);
    setFilter(next);
    setParams(next.observationId ? { observation: next.observationId } : {});
  };
  const close = () => {
    setFilter(null);
    setParams({});
  };
  if (!available)
    return (
      <Alert severity="info">
        Transaction detail was not captured for this version. Generate a revised version to include
        saved transaction evidence.
      </Alert>
    );
  return (
    <Stack spacing={2}>
      <Typography variant="h6">Explore this month</Typography>
      {overview.error && <Alert severity="error">{overview.error.message}</Alert>}
      <Typography variant="body2">
        Observed historical records: {overview.data?.observedStart ?? 'none'} to{' '}
        {overview.data?.observedEnd ?? 'none'}. Quiet periods do not establish missing imports.
      </Typography>
      {overview.data?.observations.map((o) => (
        <Button
          key={o.id}
          variant="outlined"
          sx={{ textAlign: 'left', justifyContent: 'flex-start' }}
          onClick={() => open({ observationId: o.id })}
        >
          {o.text}
        </Button>
      ))}
      <Typography variant="subtitle1">Categories · net spending</Typography>
      {report.facts.categories.map((c) => (
        <Button key={c.id} onClick={() => open({ categoryId: c.id })}>
          {c.name} — {money(c.amount)}
        </Button>
      ))}
      <Typography variant="subtitle1">Captured payees · net spending</Typography>
      {overview.data?.merchants.map((m) => (
        <Button key={m.id} onClick={() => open({ payeeId: m.id })}>
          {m.name} — {money(m.net)} ({m.count} entries)
        </Button>
      ))}
      <Typography variant="subtitle1">Existing recorded history</Typography>
      {overview.data?.history.map((h) => (
        <Button key={h.month} onClick={() => open({ month: h.month })}>
          {h.month}: {money(h.spending)} net spending · {h.transactionCount} entries
          {h.cutoffDay ? ` · through day ${h.cutoffDay}` : ''}
        </Button>
      ))}
      <Dialog open={Boolean(filter)} onClose={close} fullWidth maxWidth="lg">
        <DialogTitle>
          Saved transaction evidence · {report.month} v{report.version}
        </DialogTitle>
        <DialogContent>
          <Typography>
            Amounts and labels are frozen in this version. Split children count once; the parent
            amount is context only.
          </Typography>
          {rows.error && <Alert severity="error">{rows.error.message}</Alert>}
          {rows.isPending && <Typography>Loading saved rows…</Typography>}
          {rows.data && (
            <>
              <Typography sx={{ my: 2 }}>
                Filtered net spending: {money(rows.data.netSpending)} · {rows.data.total} supporting
                entries. This filter does not change the report total.
              </Typography>
              {rows.data.grossSpending !== undefined && (
                <Typography>
                  Gross spending {money(rows.data.grossSpending)} minus refunds{' '}
                  {money(rows.data.refunds ?? 0)}.
                </Typography>
              )}
              {rows.data.periodTotals && rows.data.periodTotals.length > 1 && (
                <Typography>
                  Period subtotals:{' '}
                  {rows.data.periodTotals
                    .map((p) => `${p.month}: ${money(p.netSpending)}`)
                    .join(' · ')}
                  . The observation compares these periods.
                </Typography>
              )}
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {[
                      'Date',
                      'Account',
                      'Payee',
                      'Category',
                      'Signed amount',
                      'Role / split context',
                    ].map((c) => (
                      <TableCell key={c}>{c}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.data.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.date}</TableCell>
                      <TableCell>{row.accountName}</TableCell>
                      <TableCell>{row.payeeName}</TableCell>
                      <TableCell>{row.categoryName}</TableCell>
                      <TableCell>{money(row.amount)}</TableCell>
                      <TableCell>
                        {
                          {
                            income: 'Income',
                            spending: 'Spending / refund',
                            transfer: 'Excluded transfer',
                            unresolved_inflow: 'Unclassified inflow',
                          }[row.role]
                        }
                        {row.parentId ? ` · split of ${money(row.parentAmount!)}` : ''}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}>
            Previous rows
          </Button>
          <Button
            disabled={offset + 25 >= (rows.data?.total ?? 0)}
            onClick={() => setOffset(offset + 25)}
          >
            Next rows
          </Button>
          <Button onClick={close}>Back to report</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
