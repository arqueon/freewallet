import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, Stack, Typography } from '@mui/material'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { IVerifiableCredential } from '@interop/data-integrity-core'
import { AuthPageHeader } from '@/components/AuthPageHeader'
import { CHAPILoginForm } from '@/pages/chapi/CHAPILoginForm'
import { CredentialDetail } from '@/components/credentialDetails/CredentialDetail'
import { useAuthStore } from '@/stores/authStore'
import { loginWithPassphrase } from '@/session/initSession'
import { completeAppLogin } from '@/session/completeAppLogin'
import { loginErrorKey } from '@/session/loginErrorKey'
import {
  credentialOfferUrl,
  openCredentialOffer,
  claimCredentialOffer
} from '@/lib/walletRequest/credentialOffer'
import { offerToUnlockedTab } from '@/lib/walletRequest/offerHandoff'
import { didAuthHolderPresentable } from '@/lib/walletRequest/composeVP'
import { queriesOf } from '@/lib/walletRequest/classify'
import type { IVPRDetails } from '@/lib/walletRequest/types'

/**
 * A one-use offer is opened only by a button, never an effect (StrictMode,
 * reload and speculative navigation must not consume it). Signing and saving
 * are separate approvals; a failed local save retains the received VC to retry.
 */
export function CredentialOfferPage() {
  const { search } = useLocation()
  return <CredentialOffer key={search} />
}

function CredentialOffer() {
  const { t } = useTranslation()
  const { search } = useLocation()
  const navigate = useNavigate()
  const session = useAuthStore(state => state.session)
  const [request, setRequest] = useState<IVPRDetails | null>(null)
  const [credentials, setCredentials] = useState<IVerifiableCredential[]>([])
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [loginError, setLoginError] = useState<string | null>(null)
  const rawRequest = new URLSearchParams(search).get('request') ?? ''
  let exchangeUrl: string | undefined
  try {
    exchangeUrl = credentialOfferUrl(rawRequest)
  } catch {
    exchangeUrl = undefined
  }
  // A link opened from outside the app is a new document, and the session
  // lives in tab memory only: before asking for the passphrase, hand the
  // offer to a tab of this wallet that is already unlocked.
  const [handoff, setHandoff] = useState<'checking' | 'handed' | 'none'>(() =>
    session || !exchangeUrl ? 'none' : 'checking'
  )
  const handoffAsked = useRef(false)
  useEffect(() => {
    if (handoff !== 'checking' || handoffAsked.current) {
      return
    }
    handoffAsked.current = true
    void offerToUnlockedTab({ request: rawRequest }).then(accepted =>
      setHandoff(accepted ? 'handed' : 'none')
    )
  }, [handoff, rawRequest])

  async function run(action: () => Promise<void>, errorKey: string) {
    if (inFlight.current) {
      return
    }
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch {
      setError(t(errorKey))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  async function handleLogin(passphrase: string) {
    setLoginError(null)
    try {
      const result = await loginWithPassphrase({ passphrase })
      if (!result.session) {
        setLoginError(
          t(
            result.userExists
              ? 'auth.errors.clientNotEnrolled'
              : 'auth.errors.profileNotFound'
          )
        )
        return
      }
      await completeAppLogin({ session: result.session, t })
    } catch (err) {
      setLoginError(
        t(loginErrorKey({ err, label: 'Credential offer login' }).key)
      )
    }
  }

  const supported =
    session &&
    request &&
    didAuthHolderPresentable({
      session,
      queries: queriesOf(request),
      appConnect: false
    })
  return (
    <Box>
      <AuthPageHeader />
      <Stack
        component="main"
        spacing={3}
        sx={{
          maxWidth: 900,
          mx: 'auto',
          p: { xs: 2, sm: 4 },
          overflowWrap: 'anywhere'
        }}
      >
        <Typography variant="h4" component="h1">
          {t('claim.title')}
        </Typography>
        {!exchangeUrl ? (
          <Alert severity="error">{t('claim.invalidLink')}</Alert>
        ) : (
          <>
            <Typography>
              {t('claim.destination', { origin: new URL(exchangeUrl).origin })}
            </Typography>
            {error && <Alert severity="error">{error}</Alert>}
            {handoff === 'handed' && !session && (
              <>
                <Alert severity="info">{t('claim.handedOff')}</Alert>
                <Button onClick={() => setHandoff('none')}>
                  {t('claim.continueHere')}
                </Button>
              </>
            )}
            {!request && handoff !== 'handed' && (
              <>
                <Typography>{t('claim.intro')}</Typography>
                <Button
                  variant="contained"
                  disabled={busy || handoff === 'checking'}
                  onClick={() =>
                    void run(async () => {
                      setRequest(await openCredentialOffer(exchangeUrl))
                    }, 'claim.openError')
                  }
                >
                  {t('claim.open')}
                </Button>
              </>
            )}
            {request && !session && (
              <>
                <Typography>{t('claim.login')}</Typography>
                <CHAPILoginForm onSubmit={handleLogin} error={loginError} />
                <Button
                  component={RouterLink}
                  to="/signup"
                  target="_blank"
                  rel="noopener"
                >
                  {t('claim.createWallet')}
                </Button>
              </>
            )}
            {request && session && !credentials.length && (
              <>
                <Alert severity="info">
                  {t('claim.consent', { domain: request.domain })}
                </Alert>
                {session.isGuest && (
                  <Alert severity="warning">{t('claim.guest')}</Alert>
                )}
                {!supported && (
                  <Alert severity="error">{t('claim.unsupported')}</Alert>
                )}
                <Button
                  variant="contained"
                  disabled={busy || !supported}
                  onClick={() =>
                    void run(async () => {
                      setCredentials(
                        await claimCredentialOffer({
                          request,
                          exchangeUrl,
                          session
                        })
                      )
                    }, 'claim.exchangeError')
                  }
                >
                  {t('claim.claim')}
                </Button>
              </>
            )}
            {credentials.map((credential, index) => (
              <CredentialDetail key={index} vc={credential} />
            ))}
            {!!credentials.length && session && (
              <>
                <Typography>{t('claim.saveNotice')}</Typography>
                <Button
                  variant="contained"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await session.storageReady
                      for (const credential of credentials) {
                        await session.storage.addCredential({
                          credential,
                          user: session.user
                        })
                      }
                      navigate('/dashboard', { replace: true })
                    }, 'claim.saveError')
                  }
                >
                  {t('claim.save')}
                </Button>
              </>
            )}
          </>
        )}
        <Button
          component={RouterLink}
          to={session ? '/dashboard' : '/'}
          disabled={busy}
        >
          {t('common.cancel')}
        </Button>
      </Stack>
    </Box>
  )
}
