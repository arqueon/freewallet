import { expect, it } from 'vitest'
import { createTheme, getContrastRatio } from '@mui/material/styles'
import { buildMuiThemeOptions } from './themeConfig'

it.each(['light', 'dark'] as const)(
  'UDG %s primary text and controls meet AA',
  mode => {
    const theme = createTheme(buildMuiThemeOptions({ themeId: 'udg', mode }))
    const { primary, background, warning } = theme.palette
    expect(
      getContrastRatio(warning.main, warning.contrastText)
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      getContrastRatio(primary.main, primary.contrastText)
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      getContrastRatio(primary.main, background.paper)
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      getContrastRatio(primary.main, background.default)
    ).toBeGreaterThanOrEqual(4.5)
  }
)
