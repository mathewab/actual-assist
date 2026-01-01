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
  const [toolsAnchor, setToolsAnchor] = useState<null | HTMLElement>(null);
  const [systemAnchor, setSystemAnchor] = useState<null | HTMLElement>(null);

  const isHomeSection = location.pathname === '/';
  const isToolsSection =
    location.pathname.startsWith('/suggestions') ||
    location.pathname.startsWith('/templates') ||
    location.pathname.startsWith('/history') ||
    location.pathname.startsWith('/apply') ||
    location.pathname.startsWith('/payees/merge');
  const isSystemSection =
    location.pathname.startsWith('/audit') ||
    location.pathname.startsWith('/settings') ||
    location.pathname.startsWith('/jobs');

  const navSections = useMemo(
    () => [
      {
        label: 'Home',
        items: [{ label: 'Home', path: '/' }],
      },
      {
        label: 'Tools',
        items: [
          { label: 'Category suggestions', path: '/suggestions' },
          { label: 'Duplicate payee suggestions', path: '/payees/merge' },
          { label: 'Budget Template Studio', path: '/templates' },
        ],
      },
      {
        label: 'System',
        items: [
          { label: 'Jobs history', path: '/jobs' },
          { label: 'Audit Log', path: '/audit' },
          { label: 'Settings', path: '/settings' },
        ],
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

        <JobCenter budgetId={budgetId} />

        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{ display: { xs: 'none', md: 'flex' } }}
        >
          <Button
            color="inherit"
            component={NavLink}
            to="/"
            sx={{
              fontWeight: 600,
              bgcolor: isHomeSection ? 'rgba(255,255,255,0.2)' : 'transparent',
            }}
          >
            Home
          </Button>
          <Button
            color="inherit"
            onClick={(event) => setToolsAnchor(event.currentTarget)}
            sx={{
              fontWeight: 600,
              bgcolor: isToolsSection ? 'rgba(255,255,255,0.2)' : 'transparent',
            }}
          >
            Tools ▾
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
        </Stack>

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
          anchorEl={toolsAnchor}
          open={Boolean(toolsAnchor)}
          onClose={() => setToolsAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        >
          {navSections[1].items.map((item) => (
            <MenuItem
              key={item.path}
              component={NavLink}
              to={item.path}
              selected={location.pathname.startsWith(item.path)}
              onClick={() => setToolsAnchor(null)}
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
          {navSections[2].items.map((item) => (
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
        </Box>
      </Drawer>
    </AppBar>
  );
}
