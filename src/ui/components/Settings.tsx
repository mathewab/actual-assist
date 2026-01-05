import { useState } from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppTheme } from '../theme/AppThemeProvider';
import {
  loadPayeeMergeSettings,
  savePayeeMergeSettings,
  getDefaultPayeeMergeSettings,
} from '../services/payeeMergeSettings';
import {
  loadCategorySuggestionSettings,
  saveCategorySuggestionSettings,
  getDefaultCategorySuggestionSettings,
} from '../services/categorySuggestionSettings';
import { api } from '../services/api';

export function Settings() {
  const { themeId, setThemeId, options } = useAppTheme();
  const queryClient = useQueryClient();
  const { data: appConfig } = useQuery({
    queryKey: ['app-config'],
    queryFn: () => api.getAppConfig(),
  });
  const llmConfigured = appConfig?.llmConfigured ?? true;
  const llmProviders = appConfig?.llmProviders ?? [];
  const currentProvider = appConfig?.llmProvider ?? 'openai';
  const currentModel = appConfig?.llmModel ?? '';
  const effectiveBaseUrl = appConfig?.llmBaseUrlEffective ?? '';
  const [payeeMergeSettings, setPayeeMergeSettings] = useState(loadPayeeMergeSettings());
  const defaultPayeeMergeSettings = getDefaultPayeeMergeSettings();
  const activeTheme = options.find((theme) => theme.id === themeId) ?? options[0];
  const updateLlmConfig = useMutation({
    mutationFn: (payload: { provider: string; model?: string; baseUrl?: string }) =>
      api.updateLlmConfig(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['app-config'], data);
    },
  });
  const llmSectionKey = `${currentProvider}-${appConfig?.llmModelOverride ?? ''}-${
    appConfig?.llmBaseUrl ?? ''
  }`;

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

      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<Box component="span">v</Box>}>
          <Box>
            <Typography variant="subtitle1" fontWeight={600}>
              Theme
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Choose a palette inspired by popular community themes.
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
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
        </AccordionDetails>
      </Accordion>

      <Accordion defaultExpanded sx={{ mt: 3 }}>
        <AccordionSummary expandIcon={<Box component="span">v</Box>}>
          <Box>
            <Typography variant="subtitle1" fontWeight={600}>
              LLM settings
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Choose the provider and model used for AI suggestions.
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <LlmSettingsSection
            key={llmSectionKey}
            llmConfigured={llmConfigured}
            llmProviders={llmProviders}
            currentProvider={currentProvider}
            currentModel={currentModel}
            modelOverride={appConfig?.llmModelOverride ?? ''}
            baseUrlOverride={appConfig?.llmBaseUrl ?? ''}
            effectiveBaseUrl={effectiveBaseUrl}
            updateLlmConfig={{
              isPending: updateLlmConfig.isPending,
              error: updateLlmConfig.error as Error | null,
              mutate: updateLlmConfig.mutate,
            }}
          />
        </AccordionDetails>
      </Accordion>

      <Accordion defaultExpanded sx={{ mt: 3 }}>
        <AccordionSummary expandIcon={<Box component="span">v</Box>}>
          <Box>
            <Typography variant="subtitle1" fontWeight={600}>
              Category suggestions
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Control whether AI is used to recommend categories.
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <CategorySuggestionSettingsCard
            key={`cat-ai-${llmConfigured ? 'on' : 'off'}`}
            llmConfigured={llmConfigured}
          />
        </AccordionDetails>
      </Accordion>

      <Accordion defaultExpanded sx={{ mt: 3 }}>
        <AccordionSummary expandIcon={<Box component="span">v</Box>}>
          <Box>
            <Typography variant="subtitle1" fontWeight={600}>
              Payee merge suggestions
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Configure duplicate payee clustering and AI refinement.
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
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
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', ml: 1 }}
                >
                  Lets the AI re-check duplicate groups and suggest cleaner merges.
                </Typography>
              </Box>
            </Stack>
          </Paper>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
}

function LlmSettingsSection(props: {
  llmConfigured: boolean;
  llmProviders: Array<{
    id: string;
    label: string;
    configured: boolean;
    defaultModel: string;
  }>;
  currentProvider: string;
  currentModel: string;
  modelOverride: string;
  baseUrlOverride: string;
  effectiveBaseUrl: string;
  updateLlmConfig: {
    isPending: boolean;
    error: Error | null;
    mutate: (payload: { provider: string; model?: string; baseUrl?: string }) => void;
  };
}) {
  const {
    llmConfigured,
    llmProviders,
    currentProvider,
    currentModel,
    modelOverride,
    baseUrlOverride,
    effectiveBaseUrl,
    updateLlmConfig,
  } = props;
  const [modelDraft, setModelDraft] = useState(modelOverride);
  const [baseUrlDraft, setBaseUrlDraft] = useState(baseUrlOverride);
  const providerDefaultModel =
    llmProviders.find((provider) => provider.id === currentProvider)?.defaultModel ?? '';

  return (
    <Stack spacing={2}>
      <TextField
        select
        label="LLM provider"
        size="small"
        value={currentProvider}
        disabled={llmProviders.length === 0 || updateLlmConfig.isPending}
        onChange={(event) =>
          updateLlmConfig.mutate({
            provider: event.target.value,
            model: modelDraft.trim() || undefined,
          })
        }
        helperText={
          llmConfigured ? `Active model: ${currentModel}` : 'Selected provider is not configured.'
        }
      >
        {llmProviders.map((provider) => (
          <MenuItem key={provider.id} value={provider.id} disabled={!provider.configured}>
            {provider.label}
            {!provider.configured ? ' (missing API key)' : ''}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="Model override"
        size="small"
        value={modelDraft}
        disabled={llmProviders.length === 0 || updateLlmConfig.isPending}
        onChange={(event) => setModelDraft(event.target.value)}
        onBlur={() =>
          updateLlmConfig.mutate({
            provider: currentProvider,
            model: modelDraft.trim() || undefined,
            baseUrl: baseUrlDraft.trim() || undefined,
          })
        }
        helperText={
          providerDefaultModel
            ? `Default model: ${providerDefaultModel}`
            : 'Leave blank to use the provider default.'
        }
      />
      <TextField
        label="Base URL override"
        size="small"
        value={baseUrlDraft}
        disabled={llmProviders.length === 0 || updateLlmConfig.isPending}
        onChange={(event) => setBaseUrlDraft(event.target.value)}
        onBlur={() =>
          updateLlmConfig.mutate({
            provider: currentProvider,
            model: modelDraft.trim() || undefined,
            baseUrl: baseUrlDraft.trim() || undefined,
          })
        }
        helperText={
          effectiveBaseUrl
            ? `Effective base URL: ${effectiveBaseUrl}`
            : 'Leave blank to use the provider default.'
        }
      />
      {updateLlmConfig.error ? (
        <Typography variant="body2" color="error">
          {updateLlmConfig.error.message}
        </Typography>
      ) : null}
    </Stack>
  );
}

function CategorySuggestionSettingsCard({ llmConfigured }: { llmConfigured: boolean }) {
  const [categorySuggestionSettings, setCategorySuggestionSettings] = useState(() =>
    loadCategorySuggestionSettings({
      allowAI: llmConfigured,
      defaultUseAI: llmConfigured,
    })
  );
  const defaultCategorySuggestionSettings = getDefaultCategorySuggestionSettings({
    allowAI: llmConfigured,
    defaultUseAI: llmConfigured,
  });

  const updateCategorySuggestionSettings = (
    updater: (prev: typeof categorySuggestionSettings) => typeof categorySuggestionSettings
  ) => {
    setCategorySuggestionSettings((prev) => {
      const next = updater(prev);
      saveCategorySuggestionSettings(next);
      return next;
    });
  };

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
      <Box>
        <FormControlLabel
          control={
            <Switch
              checked={categorySuggestionSettings.useAI}
              disabled={!llmConfigured}
              onChange={(event) =>
                updateCategorySuggestionSettings((prev) => ({
                  ...prev,
                  useAI: event.target.checked,
                }))
              }
            />
          }
          label="Use AI for category suggestions"
        />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 1 }}>
          {llmConfigured
            ? 'Uses heuristics only when disabled.'
            : 'AI is not configured. Add a provider API key to enable AI suggestions.'}{' '}
          Default: {defaultCategorySuggestionSettings.useAI ? 'on' : 'off'}.
        </Typography>
      </Box>
    </Paper>
  );
}
