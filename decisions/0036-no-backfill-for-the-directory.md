# 0036: No backfill for the directory

- Status: accepted
- Date: 2026-10-01
- Driving work: the design of the `connections` directory, which had to
  say what happens to accounts, bundles, and keys that predate it.
  Extracted at that design's approval.
- Affects: freewallet (signup provisioning, the credential-anchored mend's
  collection set, `src/session/appKeySweep.ts` and its registration, the
  content migration); dcw (its one-time provisioning gate); wallet-backup
  (the archive survey's roster set).

## Context

The directory joins the wallet Space provision roster, so a new account
gets it at signup on every path. An account created before the build
has no `connections` collection. Only a remembered login re-walks the
roster, and a credential-anchored account never runs one unless someone
opts into remembering a browser. On such an account every consent fails
closed at the entry write, and the mend's widened collection set warns on
every transient login.

Two older artifacts have the same shape. The archive survey classifies
every non-roster collection as an app collection to migrate, so once the
writer roster's id leaves the roster, an older bundle's empty
`registered-writers` migrates as an app collection, and after the app-key
collection's rename so does an older bundle's app-key collection with its
seeds. The stranded app-key sweep retires an app's authority by reading
its grants before deleting a key stranded in `private-credentials`, and
such a key predates the directory, so the sweep would revoke nothing.

## Decision

Nothing backfills the directory. Signup provisions it on every path, and
no mender provisions it on an account that lacks it. The content
migration survey is not changed, and the retired roster ids migrate as
whatever the survey classifies them. The stranded app-key sweep stays,
and its one grant source is the directory. It is not given a
history-reading grant path. A key that predates the directory has no
entry, so the sweep revokes no grant for it. It rotates the app out of
the collections whose `generator` stamp names the app, then deletes the
key.

## Rejected Alternatives

- **A transient session provisions missing roster collections.** It
  holds the user key and its generation delegation covers the Space, so
  it could. It would also close the existing torn-signup provisioning
  gap. Set aside as a build for a population the greenfield stance
  excludes; the signup path is the only one that must provision.
- **The credential-anchored mend's fan-out creates a missing
  collection.** Mixes tear-mending with provisioning, needs a second
  change in the roster-mint precondition, and does nothing for the
  mobile wallet.
- **A skip list of retired roster ids in wallet-backup or wallet-core.**
  A list maintained whenever a roster id retires, for bundles from
  before the build.
- **A history-reading grant path for the sweep alone.** A permanent
  exception to "the history log is audit trail only" (0034), keeping the
  lost-row gap on that branch for a population older than the one this
  record already excludes.

## Consequences

- Every account created before the build loses App Connect and
  interaction-URL grants until a remembered login happens to provision
  the directory. The mobile wallet's one-time provisioning gate stays.
- The mend's set widens with the build, and its warning on a pre-build
  account is accepted noise.
- A content migration of an older bundle can create an empty app
  collection named `registered-writers`, and after the rename an app
  collection holding the old account's app-key seeds. The storage
  facade's refusal of externally supplied app keys covers only
  `addCredential`, not the app-collection path.
- A stranded key that predates the directory is still deleted, but the
  app behind it keeps its grants until they expire. Only the
  collections its `generator` stamp names are rotated away from it.
- The sweep reads the directory before it touches a key that names an
  app. A failed read, a missing directory, or a directory binding the
  session refuses leaves every such stranded key and orphan public copy
  in place until a later login reads the directory. Until then a
  stranded key keeps both of `private-credentials`' exits open, the
  public link and the share, and an orphan public copy stays
  world-readable.
- The sweep runs on the remembered-login chain alone, so an account that
  never runs a remembered login keeps its stranded keys.

## Revisit Criteria

Reopen this decision when one or more of the following holds:

1. A deployment with pre-build accounts goes to real users, so the
   "until a remembered login" window is observed rather than assumed.
   The transient-session provisioning alternative is the build.
2. A bundle from a pre-rename account is migrated in practice and its
   seeds land in an app collection. The survey skip list is the build.

## Changelog

- 2026-10-01: Reversed the stranded app-key sweep's retirement to match
  the code. The sweep stays with the directory as its grant source, and
  the Consequences state what it leaves for a pre-directory key and on a
  refused directory read.
