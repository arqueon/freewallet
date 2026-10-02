/**
 * The server-observed "Created by ..." caption a collection or a Resource
 * carries in the storage browser, from its `createdBy` as
 * `resolveCreatedBy` names it: the wallet itself, a party the `connections`
 * directory names (linked while the Applications page lists it), the
 * shortened DID otherwise, or "not recorded" when the server recorded none.
 * Every form says the server observed it, so it does not read as the same
 * signal as the wallet's own `generator` record beside it.
 */
import { useTranslation } from 'react-i18next'
import type { CreatedByAttribution } from '@/lib/collectionAttribution'
import {
  AttributionCaption,
  NamedCreatorCaption
} from './CollectionAttribution'

export function ObservedCreatorAttribution({
  attribution
}: {
  attribution: CreatedByAttribution
}) {
  const { t } = useTranslation()
  if (attribution.kind === 'not-recorded') {
    return (
      <AttributionCaption>
        {t('storage.createdByNotRecorded')}
      </AttributionCaption>
    )
  }
  if (attribution.kind === 'wallet') {
    return (
      <AttributionCaption>
        {t('storage.createdByObservedWallet')}
      </AttributionCaption>
    )
  }
  return (
    <AttributionCaption>
      <NamedCreatorCaption
        i18nKey="storage.createdByObserved"
        name={attribution.name}
        {...(attribution.kind === 'party' &&
          attribution.resourceId && { resourceId: attribution.resourceId })}
      />
    </AttributionCaption>
  )
}
