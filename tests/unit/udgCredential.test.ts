import { describe, expect, it } from 'vitest'
import type { IVerifiableCredential } from '@interop/data-integrity-core'
import fixture from '../fixtures/udg-ob3.json'
import {
  criteriaText,
  getUdgCredential,
  ob3Recipient,
  rubricLevel,
  webUrl
} from '@/lib/viewMappers/udgCredential'
import es from '@/i18n/locales/es.json'

const credential = () =>
  structuredClone(fixture) as unknown as IVerifiableCredential

describe('UDG OB3 projection', () => {
  it('maps decision 0023 without replacing signed facts', () => {
    const data = getUdgCredential(credential())!
    expect(data).toMatchObject({
      recipient: 'Ana García (persona ficticia)',
      name: 'Evaluación crítica de fuentes digitales',
      type: 'MicroCredential',
      creator: 'Universidad de Guadalajara › UDGPlus',
      term: '2026-B',
      source: 'Arizona State University',
      creditsAvailable: '2',
      creditsEarned: '2',
      languages: ['es-MX'],
      code: 'UDGP-FUENTES-001',
      version: '1.0',
      criteriaUrl: 'https://example.org/fichas/fuentes/v1'
    })
    expect(data.outcomes).toHaveLength(2)
    expect(data.levels[0].name).toBe('Nivel 6 del MNC')
    expect(data.description).toContain('32 horas')
    expect(data.description).toContain('en línea')
    expect(data.issuerImage).toBe(fixture.issuer.image.id)
    expect(data.image).toBe(fixture.credentialSubject.achievement.image.id)
  })
  it('leaves other issuers and multi-subject credentials on the generic card', () => {
    const vc = credential()
    vc.issuer = { id: 'did:example:other', name: 'Otra institución' }
    expect(getUdgCredential(vc)).toBeNull()
    vc.issuer = fixture.issuer
    vc.credentialSubject = [
      fixture.credentialSubject,
      fixture.credentialSubject
    ] as never
    expect(getUdgCredential(vc)).toBeNull()
  })
  it('keeps missing optional data absent for legacy badges', () => {
    const vc = credential()
    vc.credentialSubject = {
      id: 'did:key:legacy',
      achievement: {
        name: 'Curso anterior',
        criteria: { narrative: 'Criteria not specified' }
      }
    } as never
    const data = getUdgCredential(vc)!
    expect(data).toMatchObject({
      name: 'Curso anterior',
      recipient: '',
      creator: '',
      creditsEarned: '',
      creditsAvailable: '',
      criteria: '',
      term: '',
      source: '',
      levels: [],
      outcomes: []
    })
  })
  it('preserves zero credits and does not mutate the payload', () => {
    const vc = structuredClone(fixture)
    vc.credentialSubject.creditsEarned = 0
    const before = structuredClone(vc)
    expect(getUdgCredential(vc as never)?.creditsEarned).toBe('0')
    expect(vc).toEqual(before)
  })
  it('does not mistake every framework item type for a qualification level', () => {
    const vc = structuredClone(fixture)
    vc.credentialSubject.achievement.alignment[0].targetType = 'CFItemType'
    expect(getUdgCredential(vc as never)?.outcomes).toHaveLength(2)
  })
})

it.each([
  [
    {
      name: 'Nombre directo',
      identifier: fixture.credentialSubject.identifier
    },
    'Nombre directo'
  ],
  [
    { identifier: fixture.credentialSubject.identifier },
    'Ana García (persona ficticia)'
  ],
  [{ id: 'did:key:holder', name: 'did:key:holder' }, ''],
  [
    {
      identifier: [
        { identityType: 'name', hashed: true, identityHash: 'hash-secreto' }
      ]
    },
    ''
  ],
  [
    {
      identifier: [
        { identityType: 'name', identityHash: 'sin indicación de hash' }
      ]
    },
    ''
  ],
  [
    {
      identifier: {
        identityType: 'name',
        hashed: false,
        identityHash: 'Nombre único'
      }
    },
    'Nombre único'
  ]
])('uses only a clear-text name: %j', (subject, expected) =>
  expect(ob3Recipient(subject)).toBe(expected)
)

it.each([
  'Criteria not specified',
  ' criteria NOT specified. ',
  'Criteria not specified!'
])('hides placeholder criteria: %s', value =>
  expect(criteriaText(value)).toBe('')
)
it('keeps meaningful criteria', () =>
  expect(criteriaText({ narrative: 'Compara dos fuentes.' })).toBe(
    'Compara dos fuentes.'
  ))
it('resolves rubric names within their descriptor only', () => {
  const descriptor = fixture.credentialSubject.achievement.resultDescription[0]
  expect(rubricLevel(descriptor, 'urn:udg:level:avanzado')).toBe('Avanzado')
  expect(rubricLevel(descriptor, descriptor.requiredLevel)).toBe('Competente')
  expect(rubricLevel(descriptor, 'urn:udg:level:solido')).toBe('')
  expect(rubricLevel(undefined, 'urn:missing')).toBe('')
})
it.each(['javascript:alert(1)', 'data:text/html,hello', '/relative'])(
  'rejects unsafe or nonportable links: %s',
  value => expect(webUrl(value)).toBe('')
)
it('translates all 31 OB3 achievement types', () => {
  expect(Object.keys(es.credential.achievementTypes)).toHaveLength(31)
  expect(es.credential.achievementTypes).toMatchObject({
    Course: 'Curso',
    MicroCredential: 'Microcredencial',
    Diploma: 'Diplomado',
    Certificate: 'Certificado',
    Badge: 'Insignia'
  })
})
