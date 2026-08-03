# Google authentication setup

Google authentication is an additional Phase 1 login method. It does not replace email/password,
create public registrations, or issue Google sessions to the CRM. NestJS verifies each Google ID
token and then issues the existing CRM access token and rotating refresh session.

## Security model

- Only Google ID tokens are accepted from web and mobile clients. Email, name, avatar and provider
  subject values supplied separately by a client are ignored.
- NestJS validates the Google signature, issuer, configured audience, expiry, verified-email claim
  and a short-lived single-use server nonce.
- A first Google login can activate only an existing, current invitation. It never creates a
  membership.
- An active email/password account must sign in locally and link Google from Profile >
  Authentication methods. Matching email text alone never links accounts.
- Web refresh tokens remain in the existing Secure, HttpOnly cookie. Mobile CRM refresh tokens
  remain in `expo-secure-store`. Google tokens are never persisted by either client.
- The implementation uses ID-token verification and does not require a Google OAuth client secret.

## Google Cloud project

Configure the OAuth consent screen before creating clients. While the consent screen is in testing,
add every developer/test Google account as a test user. Use separate OAuth clients for development,
staging and production so origins, signing certificates and release credentials cannot be mixed.

### Web client

Create an OAuth client of type **Web application**.

Development authorized JavaScript origin:

```text
http://localhost:3000
```

The web implementation uses the Google Identity Services JavaScript popup callback. It does not use
a redirect endpoint, so an authorized redirect URI is not required for this flow. Add the exact
HTTPS origin for each hosted web environment.

Set the same Web client ID in both places:

```dotenv
GOOGLE_AUTH_WEB_CLIENT_ID=<web-client-id>.apps.googleusercontent.com
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<web-client-id>.apps.googleusercontent.com
```

`GOOGLE_AUTH_WEB_CLIENT_ID` is the sole backend audience for both browser and native Google ID
tokens. `NEXT_PUBLIC_GOOGLE_CLIENT_ID` must be the same Web client ID. It is a public identifier
embedded in the web bundle, not a secret.

### Android client

Create an OAuth client of type **Android** for every signing certificate used with the application.

```text
Package name: in.godigitalmarketing.automobilecrm
```

Use a real SHA-1 certificate fingerprint. Typical registrations are:

1. Local development/debug signing certificate.
2. EAS or other release/upload signing certificate.
3. Google Play App Signing certificate.

Never paste Google's example fingerprint. A local debug fingerprint can be read after the Android
toolchain has generated a debug keystore:

```powershell
keytool -list -v -alias androiddebugkey `
  -keystore "apps/mobile/android/app/debug.keystore" `
  -storepass android -keypass android
```

The Android client registers the package/signing-certificate pair with Google; its client ID is not
an API audience and does not need an application environment variable. The native app requests an
ID token for the Web/server client ID:

```dotenv
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<web-client-id>.apps.googleusercontent.com
```

Android Credential Manager returns directly to the registered application; it does not use a custom
OAuth redirect URI.

### iOS client

Create an OAuth client of type **iOS**.

```text
Bundle identifier: in.godigitalmarketing.automobilecrm
```

Set the iOS client ID only in the Expo build environment:

```dotenv
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<ios-client-id>.apps.googleusercontent.com
```

`apps/mobile/app.config.ts` derives the reversed iOS client-ID URL scheme required by the native
Google Sign-In SDK. This identifier registers the iOS application and is never accepted as an API
token audience. Do not hand-write that scheme or reuse the app's `gdmcrm` deep-link scheme as a
Google redirect.

## Remaining Phase 1 Google variables

```dotenv
# Single-use login/link nonce lifetime; allowed range is 60-600 seconds.
GOOGLE_AUTH_CHALLENGE_TTL_SECONDS=300
```

Public variables (`NEXT_PUBLIC_*`, `EXPO_PUBLIC_*`) may contain OAuth client IDs only. Never place a
client secret, CRM token, database credential or provider token in a public variable.

## Mobile build requirement

The selected native integration uses Android Credential Manager and the Google Sign-In iOS SDK
through `react-native-nitro-google-signin`. It cannot run in Expo Go. After supplying real OAuth
clients, regenerate a development build and test on a device/emulator signed with a registered
certificate.

`apps/mobile/eas.json` binds the `development`, `preview`, and `production` build profiles to the
matching EAS environment. Configure these public values separately in every environment:

```text
EXPO_PUBLIC_API_URL
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID (iOS builds)
```

The Web ID in each environment must equal that environment's API `GOOGLE_AUTH_WEB_CLIENT_ID`.
Every EAS native build fails if the Web ID is absent, and every EAS iOS build also fails if the iOS
ID is absent. Use EAS environment selection (or `eas env:pull` locally), not `NODE_ENV`, to switch
configuration. Do not commit real credentials or generated native signing material.

## Nonce, state and redirect applicability

The implemented browser and native flows receive an ID token directly from the provider SDK and do
not expose an OAuth authorization-code redirect endpoint. OAuth `state` and PKCE are therefore not
applicable to the current callback shape. Request binding is supplied by the server-created,
short-lived, single-use nonce: the client sends the challenge identifier and Google ID token, and
NestJS consumes the challenge before verifying the token nonce. Login challenges are not accepted
for linking, and link challenges are bound to the authenticated CRM session and internal user.

If a future phase adds an authorization-code or redirect-based flow, it must first add a
server-stored single-use `state`, PKCE validation, an exact redirect-URI allowlist and tests for
cross-flow replay. Do not reuse the existing ID-token callback as a redirect endpoint.

## Environment validation matrix

Create different OAuth clients for development, staging and production. Client IDs are public, but
they must still be configuration-controlled so test and production trust domains cannot cross.

| Environment | API/Web audience configuration                                                                                   | Browser registration                                                      | Native registration                                                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Development | `GOOGLE_AUTH_WEB_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID` and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` are identical | `http://localhost:3000`; no redirect URI for the GIS popup callback       | Android package plus the actual debug SHA-1; iOS bundle plus development iOS client in `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`                               |
| Staging     | Three identifiers are identical to the staging Web client                                                        | Exact staging HTTPS origin; no redirect URI for the GIS popup callback    | Android package plus EAS preview signing SHA-1; iOS bundle plus staging iOS client; values stored in the EAS preview environment                        |
| Production  | Three identifiers are identical to the production Web client                                                     | Exact production HTTPS origin; no redirect URI for the GIS popup callback | Android package plus EAS release/upload and Play App Signing SHA-1 certificates; production iOS client; values stored in the EAS production environment |

The API must fail closed if its Web audience is missing. Web and native production builds must fail
if their required public identifiers are missing. Never introduce a Google client secret into any
of these variables; the current ID-token verification flow does not consume one.

## External release-validation checklist

### Android

1. Extract the SHA-1 from each keystore or Play App Signing certificate that will sign an installed
   artifact. Record its source and environment without committing private signing material.
2. Register every SHA-1 with package `in.godigitalmarketing.automobilecrm` as an Android OAuth
   client in the same Google Cloud project as that environment's Web client.
3. Set the matching EAS environment's `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`; do not add an Android
   client-ID environment variable.
4. Create an EAS development/preview build signed by the registered certificate and install it on a
   device or Google-capable emulator. Expo Go is not a valid test artifact.
5. Run invited login, unknown-user rejection, account-conflict rejection, disabled-user and
   suspended-tenant rejection, link, last-method unlink rejection, successful unlink/session
   revocation, refresh rotation and logout with real provider tokens.

### iOS

1. Create an iOS OAuth client for bundle `in.godigitalmarketing.automobilecrm` in each environment's
   Google Cloud project.
2. Put that public identifier in the matching EAS environment as
   `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`; keep `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` equal to the API Web
   audience.
3. Generate a new signed development/preview build so `app.config.ts` can emit the correct reversed
   client-ID scheme. Install it on a real device or simulator capable of completing Google sign-in.
4. Repeat the Android behavioral matrix and confirm the provider callback returns to the app.

### Web and API

1. Register the exact development/staging/production JavaScript origins on their respective Web
   OAuth clients. Do not add a redirect URI for the current popup callback.
2. Deploy matching backend and browser Web client IDs, then exercise the same blocked-account,
   invitation, linking, unlinking, refresh and logout cases through the hosted HTTPS origin.
3. Confirm browser storage contains neither a CRM refresh token nor a Google token and confirm
   provider tokens/claims are absent from structured logs and error responses.

## Audit status on 2026-08-03

The private local audit environment has a configured API Web audience and matching web/mobile
Web-server public identifiers; their values were deliberately not emitted. No usable iOS client ID,
registered Android signing-SHA evidence, signed native artifact, physical-device execution or live
Google token exchange was available. Repository validation therefore proves configuration shape,
native bundle identifiers and implementation behavior with deterministic provider doubles, while
the checklist above remains an external release gate.

## Provider references

- [Google Identity Services web setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)
- [Google server-side ID-token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
- [Expo Google authentication](https://docs.expo.dev/guides/google-authentication/)
- [Expo EAS environment selection](https://docs.expo.dev/eas/environment-variables/usage/)
