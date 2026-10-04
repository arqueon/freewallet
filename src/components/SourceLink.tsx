import { Box, Link } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { UDG_SOURCE_URL } from '@/app.config'

export function SourceLink() {
  const { t } = useTranslation()
  return (
    <Box component="footer" sx={{ textAlign: 'center', py: 2 }}>
      <Link href={UDG_SOURCE_URL} target="_blank" rel="noopener noreferrer">
        {t('common.sourceCode')}
      </Link>
    </Box>
  )
}
