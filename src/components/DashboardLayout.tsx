import { useState } from 'react'
import { IconButton, useMediaQuery, useTheme } from '@mui/material'
import { MdMenu } from 'react-icons/md'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Drawer from '@mui/material/Drawer'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { AppBarControls } from '@/components/AppBarControls'
import { Toast } from '@/components/Toast'
import { dashboardStyles } from '@/styles/appStyles'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router'
import { useAuthStore } from '@/stores/authStore'
import { APP_LOGO_URL } from '@/app.config'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

const primaryNavItems = [
  { labelKey: 'nav.dashboard', to: '/dashboard' },
  { labelKey: 'nav.contacts', to: '/contacts' },
  { labelKey: 'nav.applications', to: '/applications' },
  { labelKey: 'nav.storage', to: '/storage' }
] as const

const settingsNavItems = [{ labelKey: 'nav.history', to: '/history' }] as const

export function DashboardLayout({
  title,
  children
}: {
  title: string
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const theme = useTheme()
  const mobile = useMediaQuery(theme.breakpoints.down('md'))
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const session = useAuthStore(state => state.session)

  function handleLogout() {
    navigate('/logout')
  }

  return (
    <Box>
      <AppBar
        position="sticky"
        color="default"
        elevation={1}
        // The permanent desktop drawer starts below the bar, so the bar must
        // sit above it. The temporary mobile drawer is a modal at the drawer
        // z-index too: raising the bar over it would hide the drawer's first
        // items, so on a phone the drawer covers the bar instead.
        sx={mobile ? undefined : { zIndex: theme => theme.zIndex.drawer + 1 }}
      >
        <Toolbar sx={{ gap: 1, flexWrap: 'nowrap' }}>
          {mobile && (
            <IconButton
              aria-label={t('common.menu')}
              onClick={() => setMenuOpen(true)}
            >
              <MdMenu />
            </IconButton>
          )}
          <Box
            component="img"
            src={APP_LOGO_URL}
            alt={t('common.brand')}
            sx={dashboardStyles.walletIcon}
          />
          <Typography
            variant="h6"
            noWrap
            sx={{ flexGrow: 1, minWidth: 0, ...dashboardStyles.navBrandTitle }}
          >
            {t('common.brand')}
          </Typography>
          <AppBarControls>
            {session ? (
              <Button variant="outlined" onClick={handleLogout}>
                {t('common.logOut')}
              </Button>
            ) : (
              <Button variant="outlined" component={RouterLink} to="/login">
                {t('common.logIn')}
              </Button>
            )}
          </AppBarControls>
        </Toolbar>
      </AppBar>

      <Box sx={dashboardStyles.container}>
        <Drawer
          variant={mobile ? 'temporary' : 'permanent'}
          open={mobile ? menuOpen : true}
          onClose={() => setMenuOpen(false)}
          sx={
            mobile
              ? { '& .MuiDrawer-paper': { width: 280 } }
              : {
                  ...dashboardStyles.drawer,
                  '& .MuiDrawer-paper': {
                    width: 280,
                    top: 64,
                    height: 'calc(100% - 64px)'
                  }
                }
          }
        >
          <Box component="nav" onClick={() => setMenuOpen(false)}>
            <List sx={dashboardStyles.navList}>
              {primaryNavItems.map(item => (
                <ListItemButton
                  key={item.to}
                  component={RouterLink}
                  to={item.to}
                  selected={pathname === item.to}
                  sx={dashboardStyles.navItem}
                >
                  <ListItemText
                    primary={t(item.labelKey)}
                    slotProps={{ primary: { sx: dashboardStyles.navItemText } }}
                  />
                </ListItemButton>
              ))}

              <ListItemButton
                component={RouterLink}
                to="/settings"
                selected={pathname === '/settings'}
                sx={dashboardStyles.navSectionTitleButton}
              >
                <ListItemText
                  primary={t('nav.settings')}
                  slotProps={{
                    primary: { sx: dashboardStyles.navSectionTitle }
                  }}
                />
              </ListItemButton>

              <List sx={dashboardStyles.navSubList}>
                {settingsNavItems.map(item => (
                  <ListItemButton
                    key={item.to}
                    component={RouterLink}
                    to={item.to}
                    selected={pathname === item.to}
                    sx={dashboardStyles.navSubItem}
                  >
                    <ListItemText
                      primary={t(item.labelKey)}
                      sx={dashboardStyles.navItemText}
                    />
                  </ListItemButton>
                ))}
              </List>
            </List>
          </Box>
        </Drawer>

        <Box component="main" sx={dashboardStyles.main}>
          <Typography variant="h4" component="h1" sx={dashboardStyles.title}>
            {title}
          </Typography>
          {children}
        </Box>
      </Box>
      <Toast />
    </Box>
  )
}
