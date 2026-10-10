/**
 * Where a resolved piece of wallet input goes, shared by every entry point
 * that resolves one (the Add Credential paste box, the QR scanner on the
 * dashboard and on Add Credential): a credential offer to the issuance page,
 * an interaction URL to the request page, credentials to the review screen
 * before anything is stored.
 */
import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import type { WalletInputOutcome } from '@/lib/resolveWalletInput'
import { credentialOfferPath } from '@/lib/walletRequest/credentialOffer'
import { externalRequestPath } from '@/lib/walletRequest/externalRequest'

/**
 * Returns the navigation for a resolved wallet input outcome.
 *
 * @returns {(outcome: WalletInputOutcome) => void}
 */
export function useWalletInputRouting(): (outcome: WalletInputOutcome) => void {
  const navigate = useNavigate()
  return useCallback(
    (outcome: WalletInputOutcome) => {
      if (outcome.kind === 'credential-offer') {
        navigate(credentialOfferPath(outcome.url))
        return
      }
      if (outcome.kind === 'interaction-url') {
        // A request arriving from outside the app: the request page opens
        // the exchange behind it, the same page the CLI's deep link lands on.
        navigate(externalRequestPath({ url: outcome.url }))
        return
      }
      navigate('/accept-credentials', {
        state: { credentials: outcome.credentials }
      })
    },
    [navigate]
  )
}
