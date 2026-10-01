/**
 * Unit tests for the roster projections in the app config: the standard and
 * system collection lists carry the roster spec fields verbatim.
 */
import { describe, it, expect } from 'vitest'
import {
  WALLET_SPACE_SYNCED_SPECS,
  WALLET_SPACE_SYSTEM_SPECS
} from '@interop/wallet-core/space'
import { SYSTEM_COLLECTIONS, WALLET_STANDARD_COLLECTIONS } from './app.config'

describe('roster projections', () => {
  it('projects grantable verbatim onto the standard collections', () => {
    expect(
      WALLET_STANDARD_COLLECTIONS.map(({ id, grantable }) => [id, grantable])
    ).toEqual(
      WALLET_SPACE_SYNCED_SPECS.map(spec => [spec.collectionId, spec.grantable])
    )
  })

  it('projects grantable verbatim onto the system collections', () => {
    expect(
      SYSTEM_COLLECTIONS.map(({ id, grantable }) => [id, grantable])
    ).toEqual(
      WALLET_SPACE_SYSTEM_SPECS.map(spec => [spec.collectionId, spec.grantable])
    )
  })
})
