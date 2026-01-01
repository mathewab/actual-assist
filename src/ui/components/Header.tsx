import { useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { JobCenter } from './JobCenter';

interface HeaderProps {
  budgetName?: string;
  budgetId?: string;
}

export function Header({ budgetName, budgetId }: HeaderProps) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [suggestionsAnchor, setSuggestionsAnchor] = useState<null | HTMLElement>(null);
  const [systemAnchor, setSystemAnchor] = useState<null | HTMLElement>(null);
  const [budgetAnchor, setBudgetAnchor] = useState<null | HTMLElement>(null);

  const isSuggestionsSection =
    location.pathname === '/' || location.pathname.startsWith('/history');
  const isSystemSection =
    location.pathname.startsWith('/audit') || location.pathname.startsWith('/settings');
  const isBudgetSection = location.pathname.startsWith('/templates');

  const navSections = useMemo(
    () => [
      {
        label: 'Suggestions',
        items: [
          { label: 'Review', path: '/' },
          { label: 'History', path: '/history' },
        ],
      },
      {
        label: 'System',
        items: [
          { label: 'Audit Log', path: '/audit' },
          { label: 'Settings', path: '/settings' },
        ],
      },
      {
        label: 'Budget',
        items: [{ label: 'Templates', path: '/templates' }],
      },
    ],
    []
  );

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        bgcolor: 'transparent',
        backgroundImage: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
        color: 'common.white',
      }}
    >
      <Toolbar sx={{ gap: 2, px: { xs: 2, md: 3 } }}>
        <Typography variant="h6" fontWeight={700} sx={{ flexShrink: 0 }}>
          Actual Assist
        </Typography>
        {budgetName && (
          <Chip
            size="small"
            label={budgetName}
            sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}
          />
        )}

        <Box sx={{ flex: 1 }} />

        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{ display: { xs: 'none', md: 'flex' } }}
        >
          <Button
            color="inherit"
            onClick={(event) => setSuggestionsAnchor(event.currentTarget)}
            sx={{
              fontWeight: 600,
              bgcolor: isSuggestionsSection ? 'rgba(255,255,255,0.2)' : 'transparent',
            }}
          >
            Suggestions ▾
          </Button>
          <Button
            color="inherit"
            onClick={(event) => setSystemAnchor(event.currentTarget)}
            sx={{
              fontWeight: 600,
              bgcolor: isSystemSection ? 'rgba(255,255,255,0.2)' : 'transparent',
            }}
          >
            System ▾
          </Button>
          <Button
            color="inherit"
            onClick={(event) => setBudgetAnchor(event.currentTarget)}
            sx={{
              fontWeight: 600,
              bgcolor: isBudgetSection ? 'rgba(255,255,255,0.2)' : 'transparent',
            }}
          >
            Budget ▾
          </Button>
        </Stack>

        <Box sx={{ display: { xs: 'none', md: 'block' } }}>
          <JobCenter budgetId={budgetId} />
        </Box>

        <IconButton
          color="inherit"
          onClick={() => setMobileOpen(true)}
          sx={{ display: { xs: 'inline-flex', md: 'none' } }}
          aria-label="Open navigation"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M3 6h18" strokeLinecap="round" />
            <path d="M3 12h18" strokeLinecap="round" />
            <path d="M3 18h18" strokeLinecap="round" />
          </svg>
        </IconButton>

        <Menu
          anchorEl={suggestionsAnchor}
          open={Boolean(suggestionsAnchor)}
          onClose={() => setSuggestionsAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        >
          {navSections[0].items.map((item) => (
            <MenuItem
              key={item.path}
              component={NavLink}
              to={item.path}
              selected={location.pathname === item.path}
              onClick={() => setSuggestionsAnchor(null)}
            >
              {item.label}
            </MenuItem>
          ))}
        </Menu>
        <Menu
          anchorEl={systemAnchor}
          open={Boolean(systemAnchor)}
          onClose={() => setSystemAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        >
          {navSections[1].items.map((item) => (
            <MenuItem
              key={item.path}
              component={NavLink}
              to={item.path}
              selected={location.pathname.startsWith(item.path)}
              onClick={() => setSystemAnchor(null)}
            >
              {item.label}
            </MenuItem>
          ))}
        </Menu>
        <Menu
          anchorEl={budgetAnchor}
          open={Boolean(budgetAnchor)}
          onClose={() => setBudgetAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        >
          {navSections[2].items.map((item) => (
            <MenuItem
              key={item.path}
              component={NavLink}
              to={item.path}
              selected={location.pathname.startsWith(item.path)}
              onClick={() => setBudgetAnchor(null)}
            >
              {item.label}
            </MenuItem>
          ))}
        </Menu>
      </Toolbar>

      <Drawer anchor="right" open={mobileOpen} onClose={() => setMobileOpen(false)}>
        <Box sx={{ width: 280, p: 2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="subtitle1" fontWeight={600}>
              Navigation
            </Typography>
            <IconButton onClick={() => setMobileOpen(false)} aria-label="Close navigation">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M6 6l12 12" strokeLinecap="round" />
                <path d="M18 6l-12 12" strokeLinecap="round" />
              </svg>
            </IconButton>
          </Stack>

          {navSections.map((section) => (
            <Box key={section.label} sx={{ mt: 2 }}>
              <Typography variant="overline" color="text.secondary">
                {section.label}
              </Typography>
              <List dense>
                {section.items.map((item) => (
                  <ListItemButton
                    key={item.path}
                    component={NavLink}
                    to={item.path}
                    onClick={() => setMobileOpen(false)}
                  >
                    <ListItemText primary={item.label} />
                  </ListItemButton>
                ))}
              </List>
              <Divider />
            </Box>
          ))}

          <Box sx={{ mt: 2 }}>
            <Typography variant="overline" color="text.secondary">
              Jobs
            </Typography>
            <Box sx={{ mt: 1 }}>
              <JobCenter budgetId={budgetId} />
            </Box>
          </Box>
        </Box>
      </Drawer>
    </AppBar>
  );
}
