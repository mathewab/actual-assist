import { useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Radio from '@mui/material/Radio';
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
        {options.map((theme) => {
          const isSelected = theme.id === themeId;

          return (
            <Paper
              key={theme.id}
              variant="outlined"
              onClick={() => setThemeId(theme.id)}
              sx={{
                p: 2,
                cursor: 'pointer',
                borderColor: isSelected ? 'primary.main' : 'divider',
                boxShadow: isSelected ? '0 0 0 1px' : 'none',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Radio
                  checked={isSelected}
                  onChange={() => setThemeId(theme.id)}
                  value={theme.id}
                  inputProps={{ 'aria-label': theme.label }}
                />
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Typography variant="subtitle1" fontWeight={600}>
                      {theme.label}
                    </Typography>
                    <Chip
                      label={theme.mode === 'dark' ? 'Dark' : 'Light'}
                      size="small"
                      variant="outlined"
                    />
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {theme.description}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {theme.swatches.map((color) => (
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
              </Box>
            </Paper>
          );
        })}
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
              helperText={`Default: ${defaultPayeeMergeSettings.minScore}`}
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
              helperText={`Default: ${defaultPayeeMergeSettings.aiMinClusterSize}`}
            />
          </Stack>
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
        </Stack>
      </Paper>
    </Box>
  );
}
