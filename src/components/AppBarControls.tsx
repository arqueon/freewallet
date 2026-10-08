/**
 * The app bar's right-hand control cluster: the labelled language and theme
 * pickers plus the colour-mode toggle, shared by the dashboard app bar and the
 * pre-auth page header so the two read as the same application. Anything a
 * caller passes as children (the dashboard's log in / log out button) sits at
 * the end of the same row.
 *
 * Below the `md` breakpoint the cluster collapses into one overflow button
 * that opens the same controls in a popover, so the app bar stays a single
 * row on a phone instead of wrapping into three.
 */
import { useState } from 'react'
import IconButton from '@mui/material/IconButton'
import Popover from '@mui/material/Popover'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import { MdMoreVert } from 'react-icons/md'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LanguageSelector } from '@/components/LanguageSelector'
import { ThemeModeToggle } from '@/components/ThemeModeToggle'
import { ThemePicker } from '@/components/ThemePicker'
import { dashboardStyles } from '@/styles/appStyles'

/**
 * Renders the app bar control cluster.
 *
 * @param options {object}
 * @param [options.children] {ReactNode}   extra controls for the end of the row
 * @returns {JSX.Element}
 */
export function AppBarControls({ children }: { children?: ReactNode }) {
  const { t } = useTranslation()
  const theme = useTheme()
  const compact = useMediaQuery(theme.breakpoints.down('md'))
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  if (compact) {
    return (
      <>
        <IconButton
          aria-label={t('common.moreOptions')}
          aria-haspopup="true"
          aria-expanded={anchor ? 'true' : undefined}
          onClick={event => setAnchor(event.currentTarget)}
          edge="end"
        >
          <MdMoreVert />
        </IconButton>
        <Popover
          open={Boolean(anchor)}
          anchorEl={anchor}
          onClose={() => setAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <Stack spacing={2} sx={dashboardStyles.navOverflowPanel}>
            <LanguageSelector />
            <ThemePicker />
            <ThemeModeToggle showLabel />
            {children}
          </Stack>
        </Popover>
      </>
    )
  }

  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{ alignItems: 'center', flexWrap: 'nowrap' }}
    >
      <Stack sx={dashboardStyles.navControlGroup}>
        <Typography component="span" sx={dashboardStyles.navControlLabel}>
          {t('common.language')}:
        </Typography>
        <LanguageSelector showLabel={false} />
      </Stack>
      <Stack sx={dashboardStyles.navControlGroup}>
        <Typography component="span" sx={dashboardStyles.navControlLabel}>
          {t('common.theme')}:
        </Typography>
        <ThemePicker showLabel={false} />
      </Stack>
      <ThemeModeToggle />
      {children}
    </Stack>
  )
}
