/**
 * Slim top app bar for the pre-auth pages (login, signup, guest mode):
 * brand icon and app name on the left (linking back to the landing page),
 * language / theme / color-mode controls on the right. Mirrors the
 * dashboard app bar so the pre-auth pages read as part of the same
 * application.
 */
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { Link as RouterLink } from 'react-router'
import { AppBarControls } from '@/components/AppBarControls'
import { dashboardStyles } from '@/styles/appStyles'
import { APP_LOGO_URL } from '@/app.config'

export function AuthPageHeader() {
  const { t } = useTranslation()

  return (
    <AppBar
      position="static"
      color="default"
      elevation={1}
      sx={{ position: 'relative', zIndex: 2 }}
    >
      <Toolbar
        sx={{
          flexWrap: { xs: 'wrap', md: 'nowrap' },
          gap: 1,
          py: { xs: 1, md: 0 }
        }}
      >
        <Box
          component={RouterLink}
          to="/"
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexGrow: 1,
            color: 'inherit',
            textDecoration: 'none',
            '&:hover': { opacity: 0.8 }
          }}
        >
          <Box
            component="img"
            src={APP_LOGO_URL}
            alt=""
            sx={dashboardStyles.walletIcon}
          />
          <Typography variant="h6" sx={dashboardStyles.navBrandTitle}>
            {t('common.brand')}
          </Typography>
        </Box>
        <AppBarControls />
      </Toolbar>
    </AppBar>
  )
}
