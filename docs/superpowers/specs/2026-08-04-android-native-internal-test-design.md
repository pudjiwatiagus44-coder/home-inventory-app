# Android Native Internal Test Design

## Background

Home Inventory App currently uses a Web/PWA-first product route. The user has now approved adding a native Android app as a new mobile product line, with Android first and iOS planned later.

This design records the first Android internal-test scope before implementation. It does not start app-store release work, production signing, push notifications, photo upload, barcode scanning, payment, household sharing, or a separate account system.

## Product Scope

The first Android release is an internal APK for testing. Users sign in with the existing email and password account, then view, search, create, edit, and delete their own areas, locations, and items.

The Android app must reuse the existing backend account, session, inventory data, and permission model. The server remains the authority for user identity, household ownership, and cross-user data isolation.

Offline support is included in the first Android internal test:

- The latest synced inventory can be viewed offline.
- Users can create, edit, and delete areas, locations, and items while offline.
- Offline creates are stored locally and automatically submitted as soon as network connectivity returns.
- Offline edits and deletes are submitted after reconnection, but they must not overwrite newer server data.

## Recommended Approach

Use Kotlin native Android with Jetpack Compose and MVVM.

Android layers:

- UI: Jetpack Compose screens for login, dashboard, search, forms, and sync status.
- ViewModel: screen state, validation, user intent, and loading/error state.
- Repository: coordinates local Room data and remote API calls.
- Local storage: Room tables for inventory data, pending operations, and sync state.
- Secure storage: Android Keystore or EncryptedSharedPreferences for session credentials. The app must never store the user's password after login.
- Network: Retrofit/OkHttp or Ktor Client. Prefer Retrofit/OkHttp unless implementation context strongly favors Ktor.

Backend:

- Continue using the existing Next.js backend and self-hosted auth/inventory permission boundary.
- Android must call authenticated HTTP APIs only.
- Android must not connect directly to PostgreSQL.
- Android must not send a trusted `householdId`; the server derives household access from the current session.

## Data Model

Room should include:

- `areas`
- `locations`
- `items`
- `pending_operations`
- `sync_state`

Local inventory rows should track:

- server id
- local temporary id for offline creates
- business fields
- `serverUpdatedAt`
- `localUpdatedAt`
- sync status

Pending operations should track:

- operation type: create, update, delete
- entity type: area, location, item
- local entity id
- server entity id when available
- base `serverUpdatedAt` observed when the user started the change
- serialized payload
- retry/error state
- created timestamp

## Sync Rules

Login and app startup should fetch the current user's latest inventory snapshot.

Offline creates:

- Write to Room immediately with a temporary local id and `pending_create` status.
- When connectivity returns, automatically submit pending creates without waiting for the user to press a sync button.
- On success, replace the temporary local id with the server id and server `updatedAt`.
- If a create depends on a parent area/location that cannot be resolved, keep the operation failed and show the user a retry/fix state.

Offline edits:

- Write the local edited state and queue an update operation.
- Submit the update with the base `serverUpdatedAt` observed before editing.
- If the server record has changed, reject the update and keep server data authoritative.
- The app should show a conflict state and ask the user to refresh/re-edit.

Offline deletes:

- Mark locally as pending delete and hide or dim the row in normal lists.
- Submit the delete with the base `serverUpdatedAt`.
- If the server record has changed or no longer exists, accept the server state as authoritative and show an explanation.

Sync triggers:

- after login
- app start
- manual refresh/sync
- network reconnection
- successful online mutation

The first internal test does not include background long-running sync, push-based sync, multi-device realtime collaboration, or complex merge UI.

## API Needs

Existing APIs may need to be extended or supplemented with mobile-friendly endpoints:

- sign in with email and password
- sign out
- fetch current user inventory snapshot
- create/update/delete area
- create/update/delete location
- create/update/delete item
- submit queued offline operations with base version fields

For conflict protection, mutation APIs should accept the client's base `serverUpdatedAt` for update/delete operations and return a conflict response when server data has changed.

## Error Handling

The Android app must distinguish:

- unauthenticated session
- offline/no network
- server unavailable
- validation errors
- permission errors
- sync conflicts
- queued operation retry failures

User-facing messages should be plain and actionable. Internal server errors must not expose secrets, database URLs, stack traces, or raw SQL.

## Testing And Acceptance

Implementation acceptance should include:

- Android app can build an internal debug/test APK.
- User can log in with the existing account.
- User can view, search, create, edit, and delete inventory online.
- User can view the latest synced inventory offline.
- User can create an item offline, restore network, and see it automatically sync to the server.
- Offline edit/delete conflicts do not overwrite newer server data.
- User A cannot read or mutate User B's inventory through Android APIs.
- Android does not store raw passwords or backend/database secrets.
- Existing Web/PWA behavior remains intact.

## Out Of Scope

- iOS implementation
- app-store release
- production signing and release management
- push notifications
- photo upload
- barcode scanning
- AI recognition
- payment
- household sharing
- independent mobile-only backend or account system
