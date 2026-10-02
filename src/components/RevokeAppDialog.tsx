/**
 * Confirmation dialog for revoking a connected application's access, shared by
 * the Applications list and the application detail page. An orphaned app (one
 * whose recorded grants were all signed by a since-disconnected wallet client)
 * gets its own wording, since its grants already stopped verifying.
 *
 * An app holding a share of one of the wallet's own collections is told which
 * collections the disconnect takes its key off (`sharedCollections`), so the
 * confirmation says no less than the Storage page's shares dialog would.
 *
 * The same dialog confirms revoking a connected AGENT (`agent`), whose copy
 * speaks only of the storage grants: an agent holds no app key to delete and
 * is no collection's epoch recipient, so nothing is rotated. It has no
 * orphaned wording, because an agent revocation never skips the revocation
 * POSTs -- an orphaned marking there is not evidence that the grant is dead.
 */
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import { useTranslation } from 'react-i18next'

/**
 * Renders the revoke-access confirmation dialog.
 *
 * @param options {object}
 * @param options.open {boolean}
 * @param options.appName {string}   the app's (or agent's) display name
 * @param [options.agent] {boolean}   whether the row is an agent rather than
 *   an App Connect application
 * @param [options.orphaned] {boolean}   whether the app's grants are orphaned
 *   (read on the app path only)
 * @param [options.sharedCollections] {string[]}   the display names of the
 *   wallet collections the app holds a share of, which the revoke un-shares
 * @param options.revoking {boolean}   whether a revocation is in flight
 * @param options.error {boolean}   whether the last attempt failed
 * @param options.onCancel {Function}
 * @param options.onConfirm {Function}
 * @returns {JSX.Element}
 */
export function RevokeAppDialog({
  open,
  appName,
  agent = false,
  orphaned = false,
  sharedCollections = [],
  revoking,
  error,
  onCancel,
  onConfirm
}: {
  open: boolean
  appName: string
  agent?: boolean
  orphaned?: boolean
  sharedCollections?: string[]
  revoking: boolean
  error: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!revoking) {
          onCancel()
        }
      }}
    >
      <DialogTitle>
        {t(
          agent ? 'applications.revokeAgentTitle' : 'applications.revokeTitle'
        )}
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          {t(
            agent
              ? 'applications.revokeAgentConfirm'
              : orphaned
                ? 'applications.revokeConfirmOrphaned'
                : 'applications.revokeConfirm',
            { name: appName }
          )}
        </DialogContentText>
        {sharedCollections.length > 0 && (
          <DialogContentText sx={{ mt: 2 }}>
            {t('applications.revokeConfirmShares', {
              name: appName,
              collections: sharedCollections.join(', ')
            })}
          </DialogContentText>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {t(
              agent
                ? 'applications.revokeAgentFailed'
                : 'applications.revokeFailed'
            )}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={revoking}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={onConfirm}
          loading={revoking}
        >
          {t('applications.revokeConfirmAction')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
