import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import { API_BASE, sessionFetch } from '../services/session';
import type { SavedReport } from '../../domain/reports/ReportTypes';
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await sessionFetch(
    `${API_BASE}/v1/reports${path}`,
    body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}
  );
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error ?? 'Report request failed');
  }
  return response.json() as Promise<T>;
}
export function Reports() {
  const { id } = useParams();
  const client = useQueryClient();
  const [month, setMonth] = useState(
    new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1))
      .toISOString()
      .slice(0, 7)
  );
  const [currency, setCurrency] = useState('');
  const [offset, setOffset] = useState(0);
  const list = useQuery({
    queryKey: ['reports', offset],
    queryFn: () => request<{ reports: SavedReport[] }>(`?limit=20&offset=${offset}`),
  });
  const detail = useQuery({
    queryKey: ['report', id],
    queryFn: () => request<SavedReport>(`/${id}`),
    enabled: Boolean(id),
  });
  const generate = useMutation({
    mutationFn: (previous?: SavedReport) =>
      request<SavedReport>('', {
        month: previous?.month ?? month,
        currency: previous?.facts.currency ?? currency,
        requestKey: crypto.randomUUID(),
        ...(previous ? { supersedesId: previous.id } : {}),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['reports'] });
    },
  });
  const current = detail.data;
  const error = list.error ?? detail.error ?? generate.error;
  return (
    <Stack spacing={3} sx={{ p: { xs: 2, md: 4 } }}>
      <Typography variant="h4">Monthly reports</Typography>
      <Alert severity="warning">
        Manual CSV coverage is unconfirmed. Reports use the currently loaded cache without syncing.
        Saved versions stay unchanged after later imports.
      </Alert>
      <Typography>
        Generate a local PDF, then view or download it here. AI, notifications and scheduled
        delivery are disabled.
      </Typography>
      {error && <Alert severity="error">{error.message}</Alert>}
      {generate.isSuccess && (
        <Alert severity="success">
          Report saved.{' '}
          <Link to={`/reports/${generate.data.id}`}>View version {generate.data.version}</Link>
        </Alert>
      )}
      {!id && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            type="month"
            label="Month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Budget currency (ISO code)"
            placeholder="e.g. USD"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            helperText="Confirm your budget currency; no conversion is performed."
          />
          <Button
            variant="contained"
            disabled={!month || currency.length !== 3 || generate.isPending}
            onClick={() => generate.mutate(undefined)}
          >
            {generate.isPending ? 'Generating…' : 'Generate report'}
          </Button>
        </Stack>
      )}
      {id && <Link to="/reports">Back to monthly archive</Link>}
      {current && (
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h5">
                {current.month} · version {current.version}
              </Typography>
              <Typography>Captured {current.facts.capturedAt}</Typography>
              <Typography>{current.narrative}</Typography>
              {current.facts.warnings.map((w) => (
                <Alert key={w} severity="warning">
                  {w}
                </Alert>
              ))}
              <Stack direction="row" spacing={2}>
                <Button component="a" href={`${API_BASE}/v1/reports/${current.id}/pdf?download=1`}>
                  Download PDF
                </Button>
                <Button disabled={generate.isPending} onClick={() => generate.mutate(current)}>
                  Generate revised version
                </Button>
              </Stack>
              <Box
                component="iframe"
                title={`Report ${current.month} version ${current.version}`}
                src={`${API_BASE}/v1/reports/${current.id}/pdf`}
                sx={{ width: '100%', height: 800, border: 0 }}
              />
            </Stack>
          </CardContent>
        </Card>
      )}
      {!id && (
        <>
          {list.isPending && <Typography>Loading reports…</Typography>}
          {list.data?.reports.length === 0 && (
            <Typography>No saved reports on this page.</Typography>
          )}
          {list.data?.reports.map((report) => (
            <Card key={report.id}>
              <CardContent>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={2}
                  sx={{ justifyContent: 'space-between' }}
                >
                  <Box>
                    <Typography variant="h6">
                      {report.month} · version {report.version}
                    </Typography>
                    <Typography variant="body2">
                      Saved {report.createdAt.slice(0, 10)} · coverage unconfirmed
                    </Typography>
                  </Box>
                  <Stack direction="row">
                    <Button component={Link} to={`/reports/${report.id}`}>
                      View
                    </Button>
                    <Button
                      component="a"
                      href={`${API_BASE}/v1/reports/${report.id}/pdf?download=1`}
                    >
                      Download PDF
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ))}
          <Stack direction="row">
            <Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>
              Previous
            </Button>
            <Button
              disabled={(list.data?.reports.length ?? 0) < 20}
              onClick={() => setOffset(offset + 20)}
            >
              Next
            </Button>
          </Stack>
        </>
      )}
    </Stack>
  );
}
