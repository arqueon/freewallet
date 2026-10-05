import { memo, useMemo } from 'react'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'
import { BsAward } from 'react-icons/bs'
import type { IVerifiableCredential } from '@interop/data-integrity-core'
import { getDisplayFields } from '@/lib/viewMappers/credentialDisplayFields'
import { credentialTitle } from '@/lib/viewMappers/credentialTitle'
import { getUdgCredential } from '@/lib/viewMappers/udgCredential'
import { credentialCardStyles } from '@/styles/appStyles'
import { useVerification } from '@/hooks/useVerification'
import { VerificationStatusBadge } from '@/components/credentialDetails/VerificationPanel'
import { useTranslation } from 'react-i18next'

/**
 * One credential's dashboard card. Memoized on its props: the dashboard
 * re-renders the whole list on every search keystroke, and the display-field
 * mapping below is not free.
 */
export const CredentialCard = memo(function CredentialCard({
  cid,
  credential
}: {
  cid: string
  credential: IVerifiableCredential
}) {
  const { t } = useTranslation()
  const { credentialDescription } = useMemo(
    () => getDisplayFields(credential),
    [credential]
  )
  const description = credentialDescription ?? t('common.noDescription')
  const title = useMemo(() => credentialTitle(credential), [credential])
  // The badge the issuer embedded in the credential, when it has one.
  const badgeImage = useMemo(
    () => getUdgCredential(credential)?.image ?? '',
    [credential]
  )
  const { result, loading, error } = useVerification(credential, { cid })

  return (
    <Card variant="outlined">
      <CardActionArea
        sx={credentialCardStyles.card}
        component={RouterLink}
        to={`/credential/${cid}`}
      >
        <CardContent sx={credentialCardStyles.cardContent}>
          <Typography
            variant="subtitle1"
            gutterBottom
            sx={credentialCardStyles.title}
          >
            {title}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={credentialCardStyles.description}
          >
            {description}
          </Typography>
          <Box
            sx={
              badgeImage
                ? credentialCardStyles.cardFooterWithImage
                : credentialCardStyles.cardStatusBadge
            }
          >
            <VerificationStatusBadge
              result={result}
              loading={loading}
              error={error}
            />
            {badgeImage && (
              // In the footer row, beside the status, so it never covers
              // the description.
              <Box
                component="img"
                src={badgeImage}
                alt=""
                loading="lazy"
                sx={credentialCardStyles.badgeImage}
              />
            )}
          </Box>
          {!badgeImage && (
            <Box sx={credentialCardStyles.badge}>
              <BsAward size={28} />
            </Box>
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  )
})
