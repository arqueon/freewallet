import { Box, Stack, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { IVerifiableCredential } from '@interop/data-integrity-core'
import { SectionHeader } from './InfoBlock'

/**
 * OB3 resultDescription IDs join each subject result to its criterion.
 * Render declared values, without interpreting a score as a verification.
 */
export function AchievementResults({ vc }: { vc: IVerifiableCredential }) {
  const { t } = useTranslation()
  const raw = vc.credentialSubject
  const subjects = Array.isArray(raw) ? raw : [raw]
  const rows = subjects.flatMap(subject => {
    const data = subject as Record<string, unknown>
    const achievement = data.achievement as
      { resultDescription?: unknown } | undefined
    const descriptors = arrayOfRecords(achievement?.resultDescription)
    return arrayOfRecords(data.result).map(result => ({
      result,
      descriptor: descriptors.find(desc => desc.id === result.resultDescription)
    }))
  })
  if (!rows.length) {
    return null
  }
  return (
    <Box>
      <SectionHeader>{t('credential.results')}</SectionHeader>
      <Stack spacing={2}>
        {rows.map(({ result, descriptor }, index) => (
          <Box key={index}>
            <Typography variant="subtitle2">
              {textOf(descriptor?.name) || textOf(result.resultDescription)}
            </Typography>
            {textOf(descriptor?.description) && (
              <Typography variant="body2">
                {textOf(descriptor?.description)}
              </Typography>
            )}
            {textOf(result.value) && (
              <Typography variant="body2">
                {t('credential.resultValue', { value: textOf(result.value) })}
              </Typography>
            )}
            {textOf(result.status) && (
              <Typography variant="body2">
                {t('credential.resultStatus', {
                  status: t(
                    `credential.resultStatuses.${textOf(result.status)}`,
                    { defaultValue: textOf(result.status) }
                  )
                })}
              </Typography>
            )}
            {textOf(descriptor?.requiredValue) && (
              <Typography variant="body2">
                {t('credential.resultRequired', {
                  value: textOf(descriptor?.requiredValue)
                })}
              </Typography>
            )}
          </Box>
        ))}
      </Stack>
    </Box>
  )
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return (Array.isArray(value) ? value : value ? [value] : []).filter(
    (entry): entry is Record<string, unknown> =>
      !!entry && typeof entry === 'object'
  )
}

function textOf(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : ''
}
