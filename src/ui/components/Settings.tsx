import { useState } from 'react';
import Box from '@mui/material/Box';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useAppTheme } from '../theme/AppThemeProvider';
import {
  loadPayeeMergeSettings,
  savePayeeMergeSettings,
  getDefaultPayeeMergeSettings,
} from '../services/payeeMergeSettings';

export function Settings() {
  const { themeId, setThemeId, options } = useAppTheme();
  const [payeeMergeSettings, setPayeeMergeSettings] = useState(loadPayeeMergeSettings());
  const defaultPayeeMergeSettings = getDefaultPayeeMergeSettings();
  const activeTheme = options.find((theme) => theme.id === themeId) ?? options[0];

  const updatePayeeMergeSettings = (
    updater: (prev: typeof payeeMergeSettings) => typeof payeeMergeSettings
  ) => {
    setPayeeMergeSettings((prev) => {
      const next = updater(prev);
      savePayeeMergeSettings(next);
      return next;
    });
  };

  return (
    <Box sx={{ mx: 'auto', width: '100%', maxWidth: 1100, p: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" fontWeight={600} color="text.primary">
          Settings
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Personalize the look and feel of the workspace.
        </Typography>
      </Box>

      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          Theme
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Choose a palette inspired by popular community themes.
        </Typography>
      </Box>

      <Stack spacing={2}>
        <TextField
          select
          label="Theme"
          size="small"
          value={themeId}
          onChange={(event) => setThemeId(event.target.value as typeof themeId)}
          helperText="Switch the color palette used across the workspace."
        >
          {options.map((theme) => (
            <MenuItem key={theme.id} value={theme.id}>
              {theme.label} · {theme.mode === 'dark' ? 'Dark' : 'Light'}
            </MenuItem>
          ))}
        </TextField>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            {activeTheme.label}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {activeTheme.description}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5 }}>
            {activeTheme.swatches.map((color) => (
              <Box
                key={color}
                sx={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  bgcolor: color,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              />
            ))}
          </Box>
        </Paper>
      </Stack>

      <Box sx={{ mt: 5, mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          Payee merge suggestions
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Configure duplicate payee clustering and AI refinement.
        </Typography>
      </Box>

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
            <TextField
              label="Min score"
              type="number"
              size="small"
              value={payeeMergeSettings.minScore}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (Number.isNaN(parsed)) return;
                updatePayeeMergeSettings((prev) => ({
                  ...prev,
                  minScore: Math.max(0, Math.min(100, parsed)),
                }));
              }}
              inputProps={{ min: 0, max: 100, step: 1 }}
              helperText={`Similarity threshold for grouping payees. Default: ${defaultPayeeMergeSettings.minScore}`}
            />
            <TextField
              label="AI min cluster size"
              type="number"
              size="small"
              value={payeeMergeSettings.aiMinClusterSize}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (Number.isNaN(parsed)) return;
                updatePayeeMergeSettings((prev) => ({
                  ...prev,
                  aiMinClusterSize: Math.max(2, Math.floor(parsed)),
                }));
              }}
              inputProps={{ min: 2, step: 1 }}
              helperText={`Minimum payees before AI refinement runs. Default: ${defaultPayeeMergeSettings.aiMinClusterSize}`}
            />
          </Stack>
          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={payeeMergeSettings.useAI}
                  onChange={(event) =>
                    updatePayeeMergeSettings((prev) => ({
                      ...prev,
                      useAI: event.target.checked,
                    }))
                  }
                />
              }
              label="Use AI to refine clusters"
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 1 }}>
              Lets the AI re-check duplicate groups and suggest cleaner merges.
            </Typography>
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}
