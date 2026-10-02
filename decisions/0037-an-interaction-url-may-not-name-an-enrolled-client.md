# 0037: An interaction URL may not name an enrolled client's did:key

- Status: accepted
- Date: 2026-10-01
- Driving work: the design of the `connections` directory, whose entries
  are keyed by the grantee DID an interaction-URL request supplies with
  no proof of possession. Extracted at that design's approval.
- Affects: freewallet (`src/lib/walletRequest/externalRequest.ts`'s
  pre-consent refusal matrix and the `ExternalRequestRefusal` union, the
  `/external/request` page's copy, the e2e refusal tests).

## Context

The interaction-URL page grants capabilities to the one `controller` DID
the request names. The precheck admitted any single controller. With the
directory, the grant lands on the entry at that DID. An enrolled wallet
client's did:key is public for good in the account log, so a link naming
a revoked client's did:key would put live grants on that client's retired
`wallet-client` entry, which no listing shows and no disconnect reaches.

## Decision

Before consent renders, the interaction-URL precheck refuses a request
whose controller is the did:key of a client the verified account document
lists, or ever listed. The refusal is the `ExternalRequestRefusal` member
`enrolledClient`, with its own copy cell on the page. It is a page
contract: a permanent name the tests assert on.

A consent that reaches the directory and finds an entry of another
`kind` at the controller's id, for example a link naming a disconnected
app's DID, is refused at the entry write by wallet-core's
`ConnectionKindMismatchError`, which the page and the popup surface as a
failed consent.

## Rejected Alternatives

- **One shared refusal name for both cases.** The two refusals happen at
  different times, one before consent and one after the user approved,
  and are thrown by different repos. One name hides the second as a
  precheck.
- **Admit the controller and un-retire the client entry.** The client
  was removed by a document edit; a link must not restore a row for it.

## Consequences

- The precheck reads the verified account document, which the page
  already resolves for the account.
- A link that happens to name a current client's did:key is refused too,
  which no legitimate requester composes.

## Revisit Criteria

Reopen this decision when one or more of the following holds:

1. Interaction-URL requests gain a proof of possession of the
   controller key, so a link can no longer name a key it does not hold.
