/**
 * Hands a credential offer opened in a locked tab to a tab of this wallet
 * that is already unlocked.
 *
 * The session lives in tab memory only (`authStore`), so an offer link opened
 * from outside the app -- the issuer portal's "Open in Cartera UDGPlus"
 * button, the phone camera, an installed app window capturing the link --
 * starts a new document with no session, and the offer page would ask for
 * the passphrase again although the wallet is unlocked in another tab. On
 * mount, a locked offer page asks over a same-origin BroadcastChannel; an
 * unlocked tab that is not itself in the middle of an offer takes the offer
 * (an in-app navigation to the same route, so its session is kept) and
 * answers. Nothing is fetched or signed by the handoff itself: the receiving
 * tab still shows the offer's own "Open offer" button. Without
 * BroadcastChannel, or with no unlocked tab answering in time, the locked
 * page falls back to its in-page login.
 */

const CHANNEL_NAME = 'fw-credential-offer-handoff'
const ANSWER_TIMEOUT_MS = 800

type HandoffMessage =
  | { type: 'offer'; id: string; request: string }
  | { type: 'accepted'; id: string }

function openChannel(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === 'undefined'
      ? null
      : new BroadcastChannel(CHANNEL_NAME)
  } catch {
    return null
  }
}

/**
 * Offers the raw `request` parameter to the other tabs of this wallet.
 *
 * @param options {object}
 * @param options.request {string}   the offer page's `request` parameter
 * @param [options.timeoutMs] {number}   how long to wait for an answer
 * @returns {Promise<boolean>} true when an unlocked tab took the offer
 */
export async function offerToUnlockedTab({
  request,
  timeoutMs = ANSWER_TIMEOUT_MS
}: {
  request: string
  timeoutMs?: number
}): Promise<boolean> {
  const channel = openChannel()
  if (!channel) {
    return false
  }
  const id = crypto.randomUUID()
  return new Promise(resolve => {
    const timer = setTimeout(() => finish(false), timeoutMs)
    function finish(accepted: boolean) {
      clearTimeout(timer)
      channel!.close()
      resolve(accepted)
    }
    channel.onmessage = (event: MessageEvent<HandoffMessage>) => {
      if (event.data?.type === 'accepted' && event.data.id === id) {
        finish(true)
      }
    }
    channel.postMessage({ type: 'offer', id, request } satisfies HandoffMessage)
  })
}

/**
 * Listens, from an unlocked tab, for offers a locked tab hands over.
 *
 * @param options {object}
 * @param options.canAccept {() => boolean}   whether this tab takes an offer now
 * @param options.onOffer {(request: string) => void}   opens the offer here
 * @returns {() => void} stops listening
 */
export function listenForOfferHandoff({
  canAccept,
  onOffer
}: {
  canAccept: () => boolean
  onOffer: (request: string) => void
}): () => void {
  const channel = openChannel()
  if (!channel) {
    return () => undefined
  }
  channel.onmessage = (event: MessageEvent<HandoffMessage>) => {
    const message = event.data
    if (
      message?.type !== 'offer' ||
      typeof message.request !== 'string' ||
      !canAccept()
    ) {
      return
    }
    channel.postMessage({
      type: 'accepted',
      id: message.id
    } satisfies HandoffMessage)
    onOffer(message.request)
  }
  return () => channel.close()
}
