/**
 * The "Created by ..." caption a collection carries in the storage browser:
 * the application it was provisioned for, by the name stamped on the
 * collection's `generator` or else the name its `connections` entry holds
 * for it (linked while the app is still connected), the bare origin recorded at
 * provisioning when neither names the app, or the wallet itself for the
 * collections it provisions. The naming order is `collectionCreatorLabel`'s,
 * an interaction-URL agent's stamp included.
 */
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { Trans, useTranslation } from 'react-i18next'
import { Link as RouterLink } from 'react-router'
import { collectionCreatorLabel } from '@/lib/collectionAttribution'
import type { CollectionCreator } from '@/lib/connectedApps'
import type { StorageCollection } from '@/lib/storage'
import { storageStyles } from '@/styles/appStyles'
import { isWalletCollection } from './displayUtils'

export function CollectionAttribution({
  collection,
  creator,
  linkToApp = true
}: {
  collection: StorageCollection
  creator?: CollectionCreator
  /**
   * False where the caption sits inside a row that is itself a link (the
   * folder card): the app name is then plain text, since interactive content
   * cannot nest in a link. The collection's own page carries the link.
   */
  linkToApp?: boolean
}) {
  const { t } = useTranslation()

  const caption = isWalletCollection(collection.id)
    ? t('storage.createdByWallet')
    : creatorCaption({ collection, creator, linkToApp })
  if (!caption) {
    return null
  }
  return (
    <Typography
      variant="caption"
      component="div"
      sx={storageStyles.collectionAttribution}
    >
      {caption}
    </Typography>
  )
}

/**
 * The stamped-creator half of the caption: the creator's label, linked to
 * its application detail page while the Applications page lists the app,
 * and plain text otherwise; a collection with no stamp has no
 * caption.
 */
function creatorCaption({
  collection,
  creator,
  linkToApp
}: {
  collection: StorageCollection
  creator?: CollectionCreator
  linkToApp: boolean
}) {
  const label = collectionCreatorLabel({
    generator: collection.generator,
    recordName: creator?.name
  })
  if (!label) {
    return null
  }
  const nameComponent =
    creator?.resourceId && linkToApp ? (
      <Link
        component={RouterLink}
        to={`/applications/${creator.resourceId}`}
        underline="hover"
      />
    ) : (
      <Box component="span" />
    )
  return (
    <Trans
      i18nKey="storage.createdByApp"
      values={{ name: label }}
      components={{ app: nameComponent }}
    />
  )
}
