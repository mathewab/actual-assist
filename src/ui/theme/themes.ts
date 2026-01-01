import type { PaletteOptions } from '@mui/material/styles';

export type ThemeId = 'classic-light' | 'nord' | 'catppuccin-latte' | 'solarized-light';

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  description: string;
  mode: 'light' | 'dark';
  palette: PaletteOptions;
  cssVars: {
    bg: string;
    text: string;
    surface: string;
    muted: string;
  };
  swatches: string[];
}

export const themes: ThemeDefinition[] = [
  {
    id: 'classic-light',
    label: 'Classic Light',
    description: 'Clean white surface with crisp blues for a familiar default.',
    mode: 'light',
    palette: {
      mode: 'light',
      primary: { main: '#2563eb' },
      secondary: { main: '#0ea5e9' },
      error: { main: '#dc2626' },
      warning: { main: '#d97706' },
      success: { main: '#16a34a' },
      background: { default: '#f8fafc', paper: '#ffffff' },
      text: { primary: '#0f172a', secondary: '#475569' },
      divider: '#e2e8f0',
    },
    cssVars: {
      bg: '#f8fafc',
      text: '#0f172a',
      surface: '#ffffff',
      muted: '#475569',
    },
    swatches: ['#ffffff', '#f8fafc', '#2563eb', '#0ea5e9', '#16a34a'],
  },
  {
    id: 'nord',
    label: 'Nord',
    description: 'Cool, muted blues with soft contrast for focused dark UIs.',
    mode: 'dark',
    palette: {
      mode: 'dark',
      primary: { main: '#88c0d0' },
      secondary: { main: '#b48ead' },
      error: { main: '#bf616a' },
      warning: { main: '#ebcb8b' },
      success: { main: '#a3be8c' },
      background: { default: '#2e3440', paper: '#3b4252' },
      text: { primary: '#d8dee9', secondary: '#e5e9f0' },
      divider: '#4c566a',
    },
    cssVars: {
      bg: '#2e3440',
      text: '#d8dee9',
      surface: '#3b4252',
      muted: '#e5e9f0',
    },
    swatches: ['#2e3440', '#3b4252', '#88c0d0', '#b48ead', '#a3be8c'],
  },
  {
    id: 'catppuccin-latte',
    label: 'Catppuccin Latte',
    description: 'Warm, creamy pastels with friendly contrast.',
    mode: 'light',
    palette: {
      mode: 'light',
      primary: { main: '#1e66f5' },
      secondary: { main: '#7287fd' },
      error: { main: '#d20f39' },
      warning: { main: '#df8e1d' },
      success: { main: '#40a02b' },
      background: { default: '#eff1f5', paper: '#e6e9ef' },
      text: { primary: '#4c4f69', secondary: '#6c6f85' },
      divider: '#ccd0da',
    },
    cssVars: {
      bg: '#eff1f5',
      text: '#4c4f69',
      surface: '#e6e9ef',
      muted: '#6c6f85',
    },
    swatches: ['#eff1f5', '#e6e9ef', '#1e66f5', '#7287fd', '#40a02b'],
  },
  {
    id: 'solarized-light',
    label: 'Solarized Light',
    description: 'Balanced warm neutrals with iconic blue and cyan accents.',
    mode: 'light',
    palette: {
      mode: 'light',
      primary: { main: '#268bd2' },
      secondary: { main: '#2aa198' },
      error: { main: '#dc322f' },
      warning: { main: '#b58900' },
      success: { main: '#859900' },
      background: { default: '#fdf6e3', paper: '#eee8d5' },
      text: { primary: '#657b83', secondary: '#586e75' },
      divider: '#93a1a1',
    },
    cssVars: {
      bg: '#fdf6e3',
      text: '#657b83',
      surface: '#eee8d5',
      muted: '#586e75',
    },
    swatches: ['#fdf6e3', '#eee8d5', '#268bd2', '#2aa198', '#859900'],
  },
];

export const defaultThemeId: ThemeId = themes[0].id;
