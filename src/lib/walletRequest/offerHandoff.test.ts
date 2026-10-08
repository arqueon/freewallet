import { describe, expect, it } from 'vitest'
import { listenForOfferHandoff, offerToUnlockedTab } from './offerHandoff'

describe('credential offer handoff between tabs', () => {
  it('hands the offer to a listening tab that accepts it', async () => {
    const received: string[] = []
    const stop = listenForOfferHandoff({
      canAccept: () => true,
      onOffer: request => received.push(request)
    })
    try {
      await expect(offerToUnlockedTab({ request: 'offer-1' })).resolves.toBe(
        true
      )
      expect(received).toEqual(['offer-1'])
    } finally {
      stop()
    }
  })

  it('falls back to the local login when no tab accepts', async () => {
    const stop = listenForOfferHandoff({
      canAccept: () => false,
      onOffer: () => {
        throw new Error('must not open')
      }
    })
    try {
      await expect(
        offerToUnlockedTab({ request: 'offer-2', timeoutMs: 50 })
      ).resolves.toBe(false)
    } finally {
      stop()
    }
  })
})
