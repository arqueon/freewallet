/**
 * The aggregate credential display projection (`getDisplayFields`) moved to
 * `@interop/vc-display`; re-exported here so existing importers are
 * unaffected. The library returns raw ISO dates (the raw-values seam); the
 * `expirationDate` field is a raw ISO string, formatted at the UI layer.
 */
import {
  getDisplayFields as sharedDisplayFields,
  extractIssuedTo
} from '@interop/vc-display'
import type { IVerifiableCredential } from '@interop/data-integrity-core'

export function getDisplayFields(credential: IVerifiableCredential) {
  const fields = sharedDisplayFields(credential)
  const types = Array.isArray(credential.type)
    ? credential.type
    : [credential.type]
  if (types.includes('OpenBadgeCredential')) {
    const subject = Array.isArray(credential.credentialSubject)
      ? credential.credentialSubject[0]
      : credential.credentialSubject
    // A badge title is not a recipient name. Preserve real person/identifier
    // names; fall back to the subject DID for a pseudonymous OB3 recipient.
    fields.issuedTo =
      extractIssuedTo({ ...credential, name: undefined }) ||
      (typeof subject?.id === 'string' ? subject.id : '')
  }
  return fields
}
