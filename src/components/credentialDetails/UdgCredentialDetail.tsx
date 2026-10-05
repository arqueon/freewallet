/**
 * UDG achievement card over the signed payload; missing metadata stays absent.
 */
import type { ReactNode } from 'react'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Divider,
  Link,
  Paper,
  Stack,
  Typography
} from '@mui/material'
import { MdExpandMore } from 'react-icons/md'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { IVerifiableCredential } from '@interop/data-integrity-core'
import type { UseVerificationReturn } from '@/hooks/useVerification'
import type { CredentialDetailActions } from '@/types/credentialActions'
import type { getUdgCredential } from '@/lib/viewMappers/udgCredential'
import { formatDate } from '@/lib/viewMappers/formatDate'
import { getProofCreatedIso } from '@/lib/getProofCreatedIso'
import { AchievementResults } from './AchievementResults'
import { CredentialActions } from './CredentialActions'
import { VerificationPanel, VerificationStatusBadge } from './VerificationPanel'

function Detail({ label, value }: { label: string; value: string }) {
  return value ? (
    <Box>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ whiteSpace: 'pre-line' }}>{value}</Typography>
    </Box>
  ) : null
}

export function UdgCredentialDetail({
  vc,
  data,
  verification,
  actions,
  children
}: {
  vc: IVerifiableCredential
  data: NonNullable<ReturnType<typeof getUdgCredential>>
  verification: UseVerificationReturn
  actions?: CredentialDetailActions
  children: ReactNode
}) {
  const { t, i18n } = useTranslation()
  const label = (key: string) => t(`credential.udg.${key}`)
  const date = (value: unknown, civil = false) =>
    value
      ? formatDate({ isoDate: String(value), locale: i18n.language, civil })
      : ''
  const languages = data.languages
    .map(language => {
      try {
        return (
          new Intl.DisplayNames([i18n.language], { type: 'language' }).of(
            language
          ) || language
        )
      } catch {
        return language
      }
    })
    .join(', ')
  return (
    <Paper
      variant="outlined"
      data-testid="udg-credential"
      sx={{ borderRadius: 3, overflow: 'hidden', overflowWrap: 'anywhere' }}
    >
      <Stack
        spacing={2.5}
        sx={{
          p: { xs: 2.5, sm: 4 },
          alignItems: 'center',
          textAlign: 'center',
          bgcolor: 'action.hover'
        }}
      >
        {data.image && (
          <Box
            component="img"
            src={data.image}
            alt={t('credential.udg.imageAlt', { name: data.name })}
            sx={{
              width: { xs: 176, sm: 224 },
              height: { xs: 176, sm: 224 },
              maxWidth: '100%',
              objectFit: 'contain'
            }}
          />
        )}
        <Box>
          {data.type && (
            <Chip
              size="small"
              label={t(`credential.achievementTypes.${data.type}`, {
                defaultValue: data.type
              })}
              sx={{ mb: 1 }}
            />
          )}
          <Typography
            component="h2"
            variant="h4"
            sx={{ fontWeight: 700, fontSize: { xs: '1.65rem', sm: '2rem' } }}
          >
            {data.name}
          </Typography>
        </Box>
        <Box>
          {data.recipient ? (
            <>
              <Typography color="text.secondary" variant="body2">
                {label('holder')}
              </Typography>
              <Typography variant="h6">{data.recipient}</Typography>
            </>
          ) : (
            <Typography>{label('linked')}</Typography>
          )}
        </Box>
        {(data.issuerName || data.issuerImage) && (
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            {data.issuerImage && (
              <Box
                component="img"
                src={data.issuerImage}
                alt={data.issuerName}
                sx={{
                  width: 56,
                  height: 64,
                  objectFit: 'contain',
                  bgcolor: '#fff',
                  borderRadius: 1,
                  p: 0.5
                }}
              />
            )}
            <Box sx={{ textAlign: 'left' }}>
              <Typography variant="body2" color="text.secondary">
                {t('common.issuer')}
              </Typography>
              <Typography sx={{ fontWeight: 600 }}>
                {data.issuerName}
              </Typography>
            </Box>
          </Stack>
        )}
        {data.creator && (
          <Detail label={label('creator')} value={data.creator} />
        )}
        {data.program && (
          <Detail label={label('program')} value={data.program} />
        )}
        {data.tags.length > 0 && (
          <Detail label={label('tags')} value={data.tags.join(' · ')} />
        )}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <Detail label={label('term')} value={data.term} />
          <Detail label={label('source')} value={data.source} />
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <Detail
            label={t('credential.validFrom')}
            value={date(
              vc.validFrom || vc.issuanceDate || getProofCreatedIso(vc)
            )}
          />
          <Detail
            label={t('credential.expirationDate')}
            value={date(vc.validUntil || vc.expirationDate)}
          />
        </Stack>
      </Stack>
      <Accordion
        disableGutters
        elevation={0}
        sx={{
          borderTop: 1,
          borderBottom: 1,
          borderColor: 'divider',
          '&:before': { display: 'none' }
        }}
      >
        <AccordionSummary
          expandIcon={<MdExpandMore />}
          aria-controls="udg-verification-details"
          id="udg-verification-summary"
        >
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{ alignItems: { xs: 'flex-start', sm: 'center' } }}
          >
            <VerificationStatusBadge
              loading={verification.loading}
              result={verification.result}
              error={verification.error}
            />
            <Typography variant="body2">{label('checks')}</Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails id="udg-verification-details">
          <VerificationPanel verification={verification} />
        </AccordionDetails>
      </Accordion>
      <Stack spacing={3} sx={{ p: { xs: 2.5, sm: 4 } }}>
        <Box component="section" aria-label={label('accredits')}>
          <Typography
            component="h3"
            variant="h5"
            sx={{ mb: 2, fontWeight: 600 }}
          >
            {label('accredits')}
          </Typography>
          {data.description && (
            <Typography sx={{ whiteSpace: 'pre-line', mb: 2 }}>
              {data.description}
            </Typography>
          )}
          {(['outcomes', 'levels'] as const).map(
            group =>
              data[group].length > 0 && (
                <Box key={group} sx={{ my: 2 }}>
                  <Typography
                    component="h4"
                    variant="subtitle1"
                    sx={{ fontWeight: 600 }}
                  >
                    {label(group)}
                  </Typography>
                  <Stack component="ul" spacing={1.5} sx={{ pl: 2.5 }}>
                    {data[group].map((entry, index) => (
                      <Box component="li" key={index}>
                        <Typography>
                          {entry.url ? (
                            <Link
                              href={entry.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {entry.name || entry.code}
                            </Link>
                          ) : (
                            entry.name || entry.code
                          )}
                        </Typography>
                        {entry.description && (
                          <Typography variant="body2">
                            {entry.description}
                          </Typography>
                        )}
                        {entry.framework && (
                          <Typography variant="body2" color="text.secondary">
                            {entry.framework}
                            {entry.code ? ` · ${entry.code}` : ''}
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Stack>
                </Box>
              )
          )}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
              gap: 2,
              my: 2
            }}
          >
            {(
              [
                'creditsAvailable',
                'creditsEarned',
                'field',
                'code',
                'version'
              ] as const
            ).map(key => (
              <Detail key={key} label={label(key)} value={data[key]} />
            ))}
            <Detail label={label('language')} value={languages} />
            <Detail label={label('start')} value={date(data.start, true)} />
            <Detail label={label('end')} value={date(data.end, true)} />
          </Box>
          {data.criteriaUrl && (
            <Link
              href={data.criteriaUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {label('viewCriteria')}
            </Link>
          )}
        </Box>
        {(data.criteria ||
          (Array.isArray(vc.credentialSubject)
            ? vc.credentialSubject[0]
            : vc.credentialSubject
          )?.result) && (
          <Box component="section" aria-label={label('evaluated')}>
            <Divider sx={{ mb: 3 }} />
            <Typography
              component="h3"
              variant="h5"
              sx={{ mb: 2, fontWeight: 600 }}
            >
              {label('evaluated')}
            </Typography>
            {data.criteria && (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {data.criteria}
              </ReactMarkdown>
            )}
            <AchievementResults vc={vc} />
          </Box>
        )}
        {actions && <CredentialActions actions={actions} />}
      </Stack>
      <Divider />
      {children}
    </Paper>
  )
}
