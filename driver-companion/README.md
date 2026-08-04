# Prestige Driver Companion

This is one small iPhone/Android companion for the existing private Driver Job workflow. It does not replace the Driver Job page: reporting, calendar, messages, driver details, OTS proof, and status controls remain on that existing page.

The installed app accepts the established exact `https://app.prestigelimo.sg/driver-job/<token>` link on cold start or while already open. It validates that URL through the existing production-origin and token-path parser, loads the safe booking summary for review, and never starts tracking or requests permission automatically. The driver still explicitly taps `Start trip tracking`. The app then uses the existing token-scoped live-location readiness/share/stop endpoints. It has no direct database credentials and introduces no second map, location writer, route, table, messaging lane, or polling timer.

The native configuration claims only that production HTTPS host and `/driver-job/` path through iOS Associated Domains and an Android verified intent filter. Actual verified App/Universal Link routing remains unavailable until the owner separately supplies the exact Apple/Android identity values and approves the matching production domain-association files. No Team ID, signing fingerprint, store URL, signing credential, OAuth client, or provider setting is stored here.

## Local validation

```sh
npm install
npm run typecheck
```

Expo Go cannot test this background-location workflow. Use a development/native build on real devices:

```sh
npx eas build --profile development --platform ios
npx eas build --profile development --platform android
```

Do not claim screen-off tracking works until one physical iPhone and one physical Android phone have each passed a bounded test with an approved test booking. The test must confirm explicit permission, first marker, screen lock/background updates, visible iOS/Android tracking indicator, explicit stop, stale/offline behavior, completed-job stop, and zero customer visibility.

## Platform limits

- iPhone requires precise foreground permission followed by `Always` background permission. The system location indicator remains visible while background tracking is active.
- Android requires precise foreground permission followed by `Allow all the time`. A persistent foreground-service notification remains visible while tracking is active.
- Force-quitting the app, disabling Location Services, revoking permission, losing network access, or some Android vendor battery controls can interrupt updates. The existing admin map must continue to display stale/offline state instead of implying that the phone is still live.
