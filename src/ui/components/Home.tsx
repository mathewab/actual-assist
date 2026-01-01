import { NavLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

export function Home() {
  return (
    <Box sx={{ mx: 'auto', width: '100%', maxWidth: 1100, p: { xs: 3, md: 5 } }}>
      <Stack spacing={4}>
        <Box>
          <Typography variant="overline" color="text.secondary">
            Dashboard
          </Typography>
          <Typography variant="h5" fontWeight={700} color="text.primary" sx={{ mt: 0.5 }}>
            Welcome back
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Choose a tool to continue. More tools will appear here as they ship.
          </Typography>
        </Box>

        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={3}
          sx={{ flexWrap: { md: 'wrap' } }}
        >
          <Paper
            variant="outlined"
            sx={{
              flex: 1,
              minWidth: { md: 260 },
              p: 3,
              borderRadius: 3,
              bgcolor: 'background.default',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <Typography variant="subtitle1" fontWeight={600}>
              Category suggestions
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Review AI-powered category suggestions, make corrections, and apply changes.
            </Typography>
            <Box sx={{ mt: 'auto' }}>
              <Button component={NavLink} to="/suggestions" variant="contained" size="small">
                Open Category suggestions
              </Button>
            </Box>
          </Paper>

          <Paper
            variant="outlined"
            sx={{
              flex: 1,
              minWidth: { md: 260 },
              p: 3,
              borderRadius: 3,
              bgcolor: 'background.default',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <Typography variant="subtitle1" fontWeight={600}>
              Duplicate payee suggestions
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Review duplicate payee clusters and merge them into a single clean payee name.
            </Typography>
            <Box sx={{ mt: 'auto' }}>
              <Button component={NavLink} to="/payees/merge" variant="contained" size="small">
                Open Duplicate payee suggestions
              </Button>
            </Box>
          </Paper>

          <Paper
            variant="outlined"
            sx={{
              flex: 1,
              minWidth: { md: 260 },
              p: 3,
              borderRadius: 3,
              bgcolor: 'background.default',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <Typography variant="subtitle1" fontWeight={600}>
              Budget Template Studio
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Manage category templates, preview outputs, and keep templates in sync.
            </Typography>
            <Box sx={{ mt: 'auto' }}>
              <Button component={NavLink} to="/templates" variant="contained" size="small">
                Open Budget Template Studio
              </Button>
            </Box>
          </Paper>
        </Stack>
      </Stack>
    </Box>
  );
}
