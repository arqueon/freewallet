/**
 * Optional UDG presentation of OB3 data. This selects a layout, never trust:
 * verification still comes exclusively from the existing verifier.
 */
import type { IVerifiableCredential } from '@interop/data-integrity-core'

export function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function recordsOf(value: unknown): Record<string, unknown>[] {
  return (Array.isArray(value) ? value : [value])
    .filter(
      value => value && typeof value === 'object' && !Array.isArray(value)
    )
    .map(recordOf)
}

export function textOf(value: unknown): string {
  return typeof value === 'string'
    ? value.trim()
    : typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : ''
}

export function webUrl(value: unknown): string {
  const text = textOf(value)
  try {
    const url = new URL(text)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

/**
 * The cohort's program or event. The issuing console sends it as the
 * subject description ("Programa o evento: <name>.") and, when present, in
 * the subject tags; the label prefix and the closing period are dropped.
 */
export function programOf(subject: Record<string, unknown>): string {
  const tags = (Array.isArray(subject.tag) ? subject.tag : [subject.tag])
    .map(textOf)
    .filter(Boolean)
  if (tags.length > 0) {
    return tags.join(' · ')
  }
  return textOf(subject.description)
    .replace(/^\s*(programa o evento|program or event)\s*:\s*/i, '')
    .replace(/\.\s*$/, '')
    .trim()
}

function imageUrl(value: unknown): string {
  return webUrl(typeof value === 'string' ? value : recordOf(value).id)
}

export function ob3Recipient(subject: Record<string, unknown>): string {
  const direct = textOf(subject.name)
  if (direct && !/^did:/i.test(direct)) {
    return direct
  }
  const identifier = recordsOf(subject.identifier).find(
    entry =>
      entry.identityType === 'name' &&
      entry.hashed === false &&
      textOf(entry.identityHash) &&
      !/^did:/i.test(textOf(entry.identityHash))
  )
  return textOf(identifier?.identityHash)
}

export function criteriaText(value: unknown): string {
  const narrative = textOf(
    typeof value === 'string' ? value : recordOf(value).narrative
  )
  return /^criteria\s+not\s+specified[.!]?$/i.test(narrative) ? '' : narrative
}

export function getUdgCredential(vc: IVerifiableCredential) {
  const types = Array.isArray(vc.type) ? vc.type : [vc.type]
  const issuer = recordOf(vc.issuer)
  const issuerId = textOf(typeof vc.issuer === 'string' ? vc.issuer : issuer.id)
  const udgIssuer =
    issuerId === 'did:web:microcredenciales.arqueonautis.org' ||
    ['Universidad de Guadalajara', 'Consola de gestores UDGPlus'].includes(
      textOf(issuer.name)
    )
  const subjects = recordsOf(vc.credentialSubject)
  // Multi-subject credentials retain the generic view rather than hiding people.
  if (
    !udgIssuer ||
    !types.includes('OpenBadgeCredential') ||
    subjects.length !== 1
  ) {
    return null
  }
  const subject = subjects[0]
  const achievement = recordOf(subject.achievement)
  if (!Object.keys(achievement).length) {
    return null
  }
  const creator = recordOf(achievement.creator)
  const parent = recordOf(creator.parentOrg)
  const creatorName = textOf(creator.name)
  const alignments = recordsOf(achievement.alignment)
    .map(entry => ({
      name: textOf(entry.targetName),
      description: textOf(entry.targetDescription),
      framework: textOf(entry.targetFramework),
      code: textOf(entry.targetCode),
      url: webUrl(entry.targetUrl),
      isLevel: /\bMNC\b|Marco Nacional de Cualificaciones/i.test(
        textOf(entry.targetFramework)
      )
    }))
    .filter(entry => entry.name || entry.description || entry.code)
  const source = subject.source
  const languages = Array.isArray(achievement.inLanguage)
    ? achievement.inLanguage
    : [achievement.inLanguage]
  return {
    name: textOf(achievement.name) || textOf(vc.name),
    type: textOf(achievement.achievementType),
    image: imageUrl(achievement.image),
    recipient: ob3Recipient(subject),
    issuerName: textOf(issuer.name),
    issuerImage: imageUrl(issuer.image),
    creator: creatorName
      ? [textOf(parent.name) || textOf(issuer.name), creatorName]
          .filter(Boolean)
          .join(' › ')
      : '',
    term: textOf(subject.term),
    program: programOf(subject),
    source: typeof source === 'string' ? source : textOf(recordOf(source).name),
    tags: (Array.isArray(achievement.tag) ? achievement.tag : [achievement.tag])
      .map(textOf)
      .filter(Boolean),
    description: textOf(achievement.description),
    criteria: criteriaText(achievement.criteria),
    criteriaUrl: webUrl(recordOf(achievement.criteria).id),
    outcomes: alignments.filter(entry => !entry.isLevel),
    levels: alignments.filter(entry => entry.isLevel),
    creditsAvailable: textOf(achievement.creditsAvailable),
    creditsEarned: textOf(subject.creditsEarned),
    languages: languages.map(textOf).filter(Boolean),
    field: textOf(achievement.fieldOfStudy),
    code: textOf(achievement.humanCode),
    version: textOf(achievement.version),
    start: textOf(subject.activityStartDate),
    end: textOf(subject.activityEndDate)
  }
}

/**
 * Join within this criterion only: IDs from another rubric must not label it.
 */
export function rubricLevel(
  descriptor: Record<string, unknown> | undefined,
  id: unknown
): string {
  const reference = textOf(id)
  if (!reference) {
    return ''
  }
  return textOf(
    recordsOf(descriptor?.rubricCriterionLevel).find(
      level => level.id === reference
    )?.name
  )
}
