import type { ThemeOptions } from '@mui/material/styles'
import type { AppThemeId } from '@/themes/appTheme'

type ThemeMode = 'light' | 'dark'

type ThemePrimary = {
  contrastText?: string
  main: string
  light?: string
  dark?: string
}

export type ThemePaletteValues = {
  background: {
    default: string
    paper: string
  }
  primary: ThemePrimary
  warning?: ThemePrimary
}

export type ThemeDefinition = {
  fontFamily: string
  palette: Record<ThemeMode, ThemePaletteValues>
  muiComponents?: ThemeOptions['components']
}

const WEST_COAST_FONT =
  '"Helvetica Neue", Helvetica, "Inter Variable", Inter, system-ui, sans-serif'

const DEFAULT_FONT =
  '"Inter Variable", "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

export const THEME_DEFINITIONS: Record<AppThemeId, ThemeDefinition> = {
  udg: {
    fontFamily: DEFAULT_FONT,
    muiComponents: {
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: '#00427B',
            backgroundImage: 'none',
            color: '#ffffff',
            '& .MuiTypography-root, & .MuiIconButton-root, & .MuiButton-root, & .MuiInputBase-root, & .MuiSelect-icon':
              {
                color: 'inherit'
              },
            '& .MuiButton-outlined, & .MuiOutlinedInput-notchedOutline': {
              borderColor: 'rgba(255, 255, 255, 0.65)'
            }
          }
        }
      }
    },
    palette: {
      light: {
        background: { default: '#f4f7fa', paper: '#ffffff' },
        primary: { main: '#00427B', contrastText: '#ffffff' },
        warning: { main: '#9c4500', contrastText: '#ffffff' }
      },
      dark: {
        background: { default: '#101820', paper: '#192734' },
        primary: { main: '#9ccaff', contrastText: '#102030' },
        warning: { main: '#ffb74d', contrastText: '#102030' }
      }
    }
  },
  default: {
    fontFamily: DEFAULT_FONT,
    palette: {
      light: {
        background: { default: '#f7f7f7', paper: '#ffffff' },
        primary: { main: '#1976d2' }
      },
      dark: {
        background: { default: '#101418', paper: '#171c21' },
        primary: { main: '#90caf9' }
      }
    }
  },
  'west-coast': {
    fontFamily: WEST_COAST_FONT,
    palette: {
      light: {
        background: { default: '#FAF6EF', paper: '#FFFFFF' },
        primary: { main: '#F25C2A', light: '#FBE6DC', dark: '#e44d1d' }
      },
      dark: {
        background: { default: '#0E0D11', paper: '#1B1A22' },
        primary: { main: '#F25C2A', light: '#FBE6DC', dark: '#e44d1d' }
      }
    },
    muiComponents: {
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 'var(--fw-radius-md)',
            fontWeight: 700,
            letterSpacing: '0.4px'
          },
          sizeLarge: {
            height: 50,
            minWidth: 160,
            padding: '0 22px',
            fontSize: 13
          },
          contained: {
            '&:not(:disabled)': {
              boxShadow: 'var(--fw-shadow-primary)'
            },
            '&:hover': {
              boxShadow: 'var(--fw-shadow-primary)'
            }
          }
        }
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 'var(--fw-radius-lg)'
          }
        }
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 'var(--fw-radius-md)',
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: 'var(--fw-orange)'
            }
          }
        }
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            borderRight: '1px solid var(--fw-hairline)'
          }
        }
      }
    }
  }
}

export function buildMuiThemeOptions({
  themeId,
  mode
}: {
  themeId: AppThemeId
  mode: ThemeMode
}): ThemeOptions {
  const definition = THEME_DEFINITIONS[themeId]
  const palette = definition.palette[mode]
  const themeButtonOverrides =
    definition.muiComponents?.MuiButton?.styleOverrides

  return {
    palette: {
      mode,
      background: palette.background,
      primary: palette.primary,
      ...(palette.warning && { warning: palette.warning })
    },
    typography: {
      fontFamily: definition.fontFamily
    },
    components: {
      ...definition.muiComponents,
      MuiButton: {
        defaultProps: {
          disableElevation: true
        },
        styleOverrides: {
          ...themeButtonOverrides,
          root: {
            whiteSpace: 'nowrap',
            textTransform: 'none',
            ...(typeof themeButtonOverrides?.root === 'object'
              ? themeButtonOverrides.root
              : {})
          }
        }
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            textTransform: 'none'
          }
        }
      }
    }
  }
}
