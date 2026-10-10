# Credential issuance links (UDG fork)

This fork adds `/#/request?request=...`, an issuance-only entry point. The
implementation requested for the UDG fork uses the existing session, signer,
VC API transport and StorageManager. It changes no key custody, account
ceremony, persistence tier or shared package contract. No `_spec` checkout
is present; contribution bookkeeping remains with maintainers per CONTRIBUTING.

The existing `/external/request` route remains capability-grant-only and
still refuses DID Authentication. The new route never delegates capabilities,
sends app keys, or selects held credentials. Unlike CHAPI, a link supplies no
attested requesting origin. The consent screen therefore names the exchange
origin as the destination, without claiming the linking site is authenticated.

`credentialOfferUrl` accepts a protocols JSON object, an absolute exchange
URL, or a wallet/LCW wrapper with a `request` parameter. Nested wrappers are
bounded. Paste and QR dispatch recognize explicit offers and paths ending in
`/exchanges/:id`; arbitrary credential URLs still use the credential resolver.
An arbitrary exchange pathname works through the explicit `/request` route
or protocols JSON. Certo's `/api/exchanges/:id?iuv=1` is normalized directly
to the POST endpoint; other `iuv` agent URLs retain their existing routing.

No fetch occurs during parsing or mounting. The user opens the offer, which
POSTs `{}`. Exactly one DIDAuthentication query, a nonempty challenge, a
domain matching the exchange origin, and a same-origin delivery endpoint are
required. Production requires HTTPS. Development permits HTTP loopback.
Redirects, URL userinfo, fragments, ambient cookies and referrers are refused
or omitted by the exchange transport. There is no CORS proxy for offers.

Without a live session the page runs the same in-page passphrase login as the
external-request page, through `completeAppLogin`. A new user can create a
wallet in another tab and return. Existing session routing and the storage
ready gate stay unchanged.

The session lives in tab memory only, so every offer link opened from outside
the app (the portal's "Abrir en Cartera UDGPlus" button, the phone camera, an
installed app window capturing the link) is a new document without one. Before
asking for the passphrase, a locked offer page asks the other tabs of this
origin over a BroadcastChannel (`offerHandoff.ts`). A top-level tab with a live
session, resting on a browsing page (dashboard, contacts, applications,
history, a credential, add credential), takes the offer by an in-app
navigation to the same route and answers; the locked page then says where the
offer went and still offers to continue in place. The handoff fetches and signs
nothing, and with no answer within 800 ms the page logs in as before. Consent signs with `composeVP`, which preserves
challenge and domain and the accepted-method dispatch (decision 0016). Local
mode uses did:key. `acceptedCryptosuites` negotiates eddsa-rdfc-2022; absent
negotiation retains the upstream Ed25519Signature2020 fallback.

The holder proof is delivered by `submitHolderProof`, which reads the status
itself. A 404 or 410 is `ExchangeUnavailableError`: Certo answers an expired,
used or refused offer the same way on purpose, so the message names all three.
A 202 whose body says `status: "pending-approval"` means the holder must
confirm this new wallet in the portal; any other 202 is an error. While
pending, `awaitWalletApproval` re-sends the same signed presentation (the offer
keeps its challenge): every 10 s, 30 s after a 429, for at most 4 minutes,
since Certo rate-limits its exchange endpoints per address across offers. A
"retry now" button ends the current pause early. A server that never sends 202
never enters the wait.

The received credentials render with the normal verifier and detail view.
A second button writes through `session.storage.addCredential`, including its
app-key refusal, CID deduplication, encrypted local storage and activity entry.
Failed saves keep the received VC in page memory for an idempotent retry. A
reload after issuance loses that unsaved response; the user must request a
new offer. No local mender can recreate a consumed issuer response. The offer
is not written to localStorage and its complete URL is not logged here.

Tests cover parser refusals, domain/delivery binding, and a real Chromium
round trip to a local HTTP server verifying the holder proof cryptographically.
The server issues a signed VC 2.0 OB3 credential and Bitstring Status List;
the browser saves it and reopens it after ordinary login. Issuer-registry trust
remains independent of cryptographic signature validity.
