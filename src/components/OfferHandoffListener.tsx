/**
 * Lets an unlocked tab take a credential offer that a locked tab of this
 * wallet was opened on (`offerHandoff.ts`), so the holder is not asked for
 * the passphrase a second time while the wallet is already unlocked. Renders
 * nothing.
 */
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useAuthStore } from '@/stores/authStore'
import { credentialOfferPath } from '@/lib/walletRequest/credentialOffer'
import { listenForOfferHandoff } from '@/lib/walletRequest/offerHandoff'

// The pages an unlocked tab may leave for a handed-over offer: browsing
// pages with nothing in flight. A CHAPI popup, a request page, a ceremony
// (signup, recovery, Settings, a backup on Your data) or a review screen
// keeps its own work.
const ACCEPTING_PATHS = [
  /^\/$/,
  /^\/dashboard$/,
  /^\/contacts$/,
  /^\/applications$/,
  /^\/history$/,
  /^\/credential\/[^/]+(\/issuer)?$/,
  /^\/add-credential$/
]

export function OfferHandoffListener() {
  const session = useAuthStore(state => state.session)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  // Read at message time, not captured at subscription time.
  const pathnameRef = useRef(pathname)
  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  useEffect(() => {
    // Only a top-level tab of its own: never a CHAPI popup or an iframe.
    if (!session || window.opener || window.top !== window) {
      return
    }
    return listenForOfferHandoff({
      // Otherwise the locked tab logs in itself.
      canAccept: () =>
        ACCEPTING_PATHS.some(pattern => pattern.test(pathnameRef.current)),
      onOffer: request => {
        navigate(credentialOfferPath(request))
        window.focus()
      }
    })
  }, [session, navigate])

  return null
}
