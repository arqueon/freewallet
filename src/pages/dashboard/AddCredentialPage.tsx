import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { DashboardLayout } from '@/components/DashboardLayout'
import { CredentialJsonUploadPanel } from '@/components/CredentialJsonFileUpload'
import { resolveCredentialsFromJsonFiles } from '@/lib/resolveCredentialJsonFiles'
import { resolveWalletInput } from '@/lib/resolveWalletInput'
import { MdQrCodeScanner } from 'react-icons/md'
import { ScanCredentialQrDialog } from '@/components/ScanCredentialQrDialog'
import { useWalletInputRouting } from '@/hooks/useWalletInputRouting'
import { resolveCredentialsInputErrorMessage } from '@/lib/resolveCredentialsInputErrorMessage'
import { dashboardStyles } from '@/styles/appStyles'

export function AddCredentialPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [scanQrOpen, setScanQrOpen] = useState(false)
  const routeWalletInput = useWalletInputRouting()

  async function handleAdd() {
    setError(null)

    const trimmed = input.trimStart()
    if (!trimmed) {
      setError(t('addCredential.errors.empty'))
      return
    }

    setLoading(true)
    try {
      routeWalletInput(await resolveWalletInput(trimmed))
    } catch (err: unknown) {
      setError(resolveCredentialsInputErrorMessage(err, t, { trimmed }))
    } finally {
      setLoading(false)
    }
  }

  async function handleFiles(files: File[]) {
    setError(null)
    setLoading(true)
    try {
      const credentials = await resolveCredentialsFromJsonFiles(files)
      navigate('/accept-credentials', { state: { credentials } })
    } catch (err: unknown) {
      setError(resolveCredentialsInputErrorMessage(err, t))
    } finally {
      setLoading(false)
    }
  }

  return (
    <DashboardLayout title={t('addCredential.title')}>
      <Box sx={dashboardStyles.addCredentialForm}>
        {error ? <Alert severity="error">{error}</Alert> : null}

        <TextField
          multiline
          minRows={4}
          placeholder={t('addCredential.placeholder')}
          value={input}
          onChange={event => {
            setInput(event.target.value)
            if (error) {
              setError(null)
            }
          }}
          error={!!error}
          fullWidth
          disabled={loading}
        />

        <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            onClick={handleAdd}
            loading={loading}
            sx={dashboardStyles.addCredentialButton}
          >
            {t('addCredential.add')}
          </Button>
          <Button
            variant="outlined"
            startIcon={<MdQrCodeScanner size={20} />}
            onClick={() => setScanQrOpen(true)}
            disabled={loading}
            sx={dashboardStyles.addCredentialButton}
          >
            {t('dashboard.scanQr.button')}
          </Button>
          <Button
            variant="outlined"
            onClick={() => navigate('/dashboard')}
            disabled={loading}
            sx={dashboardStyles.addCredentialButton}
          >
            {t('common.cancel')}
          </Button>
        </Stack>

        <ScanCredentialQrDialog
          open={scanQrOpen}
          onClose={() => setScanQrOpen(false)}
          onResolved={outcome => {
            setScanQrOpen(false)
            routeWalletInput(outcome)
          }}
        />

        <Divider>{t('addCredential.upload.orUpload')}</Divider>

        <CredentialJsonUploadPanel onFiles={handleFiles} disabled={loading} />
      </Box>
    </DashboardLayout>
  )
}
