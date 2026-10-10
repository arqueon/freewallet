import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { MdDarkMode, MdLightMode } from 'react-icons/md'
import { useTranslation } from 'react-i18next'
import { useAppTheme } from '@/context/appThemeContext'

/**
 * Toggles the active theme between light and dark mode: an icon button in the
 * app bar, or a labelled text button (`showLabel`) inside the narrow-screen
 * overflow menu, where an unlabelled icon would read as decoration.
 *
 * @param options {object}
 * @param [options.showLabel] {boolean}   render the action's text beside the icon
 * @returns {JSX.Element}
 */
export function ThemeModeToggle({
  showLabel = false
}: { showLabel?: boolean } = {}) {
  const { mode, toggleMode } = useAppTheme()
  const { t } = useTranslation()
  const label =
    mode === 'dark'
      ? t('common.switchToLightMode')
      : t('common.switchToDarkMode')
  const icon =
    mode === 'dark' ? <MdLightMode size={18} /> : <MdDarkMode size={18} />

  if (showLabel) {
    return (
      <Button
        variant="text"
        color="inherit"
        startIcon={icon}
        onClick={toggleMode}
        sx={{ justifyContent: 'flex-start' }}
      >
        {label}
      </Button>
    )
  }

  return (
    <Tooltip title={label}>
      <IconButton size="small" onClick={toggleMode} aria-label={label}>
        {icon}
      </IconButton>
    </Tooltip>
  )
}
