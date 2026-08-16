# Prestige SG Driver Companion

This is the iPhone/iPad/Android container for the existing private Driver Job workflow. It renders that established page inside Prestige Driver, while the public page remains the complete no-app browser fallback for drivers who do not install the app.

Without an incoming private link, the installed app opens Driver Portal. A Driver account can be created only from an already acknowledged private Job Link and remains pending until the first valid native sign-in binds it to that one app installation. Face ID can be enabled only after that account-backed sign-in. It unlocks the local app without replacing the server's active-account and one-installation checks.

The installed app accepts only the established exact `https://app.prestigelimo.sg/driver-job/<token>` link on cold start or while already open, plus the bounded `calendar=saved|error` return. The WebView retains the same safe card, acknowledgement, Calendar, messages, status, OTS proof, and issue controls and their existing token-scoped backend writers. The native bridge carries only start/stop/terminal tracking commands without a token or payload. Browser geolocation is disabled in the installed context; the Expo background tracker is the sole app GPS producer.

The native configuration claims only that production HTTPS host and `/driver-job/` path through iOS Associated Domains and an Android verified intent filter. Same-origin job and policy navigation stays in the WebView. Google Calendar authorization alone opens a provider-controlled OS authorization session, then returns through the same Universal/App Link. The production domain association files contain only the already-proven app identities; no signing credential or provider secret is stored here.

## Local validation

```sh
npm install
npm run typecheck
```

Expo Go cannot prove the complete embedded workflow or background location. A separately approved development/native build is required for physical acceptance:

```sh
npx eas build --profile development --platform ios
npx eas build --profile development --platform android
```

Do not claim the installed workflow works until physical iPhone/iPad and Android acceptance covers cold/warm exact links, acknowledged-link account creation, first native sign-in, second-phone rejection, Face ID enable/relaunch/foreground unlock, acknowledgement, all four statuses, Calendar return, messages, issue reporting, OTS camera/library upload, explicit permission, first marker, screen lock/background updates, visible OS tracking indicator, explicit stop, completed-job stop, forbidden-field absence, and zero customer visibility.

## Platform limits

- iPhone and iPad require precise foreground permission followed by `Always` background permission. Camera or photo-library access is requested only when the driver chooses the OTS proof input. The system location indicator remains visible while background tracking is active.
- Android requires precise foreground permission followed by `Allow all the time`. A persistent foreground-service notification remains visible while tracking is active.
- Force-quitting the app, disabling Location Services, revoking permission, losing network access, or some Android vendor battery controls can interrupt updates. The existing admin map must continue to display stale/offline state instead of implying that the phone is still live.
