/**
 * The aggregate credential display projection (`getDisplayFields`) moved to
 * `@interop/vc-display`; re-exported here so existing importers are
 * unaffected. The library returns raw ISO dates (the raw-values seam); the
 * `expirationDate` field is a raw ISO string, formatted at the UI layer.
 */
import { getDisplayFields as sharedDisplayFields } from '@interop/vc-display'
import type { IVerifiableCredential } from '@interop/data-integrity-core'
import { ob3Recipient, recordOf, criteriaText } from './udgCredential'

export function getDisplayFields(credential: IVerifiableCredential) {
  const fields = sharedDisplayFields(credential)
  const types = Array.isArray(credential.type)
    ? credential.type
    : [credential.type]
  if (types.includes('OpenBadgeCredential')) {
    const subject = Array.isArray(credential.credentialSubject)
      ? credential.credentialSubject[0]
      : credential.credentialSubject
    fields.issuedTo = ob3Recipient(recordOf(subject))
    fields.criteria = criteriaText(fields.criteria)
  }
  return fields
}
