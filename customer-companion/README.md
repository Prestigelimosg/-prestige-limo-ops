# Prestige SG Customer Companion

This is the isolated iPhone foundation for the existing Prestige Limo Customer experience. It keeps the approved light-mode `/book` and `/my-bookings` pages as the only booking and portal workflows and adds only a native header, two native navigation tabs, strict same-origin navigation, and an optional local Face ID privacy lock.

The companion does not contain a second booking form, CRM matcher, booking writer, invoice implementation, payment implementation, customer-message implementation, or database client. The existing HTTPS pages keep their current same-origin cookies, APIs, persistence, CRM identification, invoice/PDF reads, messages, driver tracking, amendments, and cancellation-review handoffs.

## Local validation

```sh
npm install
npm run typecheck
npx expo run:ios
```

Customer Build 1 remains the existing TestFlight binary. The bounded Customer Build 2 source checkpoint adds only the exact `applinks:app.prestigelimo.sg` entitlement, the existing signed Customer portal path in the public AASA response, and an in-memory initial/foreground link handoff behind the established Face ID gate. It does not create a signed build, upload, submission, TestFlight assignment, App Review submission, or public release.

Only `https://app.prestigelimo.sg/api/customer-portal-access/*` is eligible to enter the installed Customer app. The native handler rejects other domains and Prestige paths, fragments, unknown or duplicate query fields, and tracking without one valid public booking reference. A valid private link stays in memory until Face ID unlock, then uses the existing WebView portal route so the server can set the existing same-origin session cookie and redirect to My Bookings. The private link is never stored in SecureStore, AsyncStorage, a file, or another native persistence lane.

Do not claim Customer Build 2 or App Store readiness until a later approved provider lane creates and inspects the signed binary and physical iPhone verification proves signed-link activation into the installed app, cookie/session continuity, Face ID relaunch and foreground locking, both tabs, invoice PDF handling, customer/PA row isolation, forbidden-field absence, and physical acceptance.

The initial dependency audit reports inherited Expo/Metro/Xcode and React Native advisories, with no critical finding. npm's proposed automatic resolution is an incompatible downgrade to Expo 53/React Native 0.72, so no automatic audit fix is applied. Recheck the complete native toolchain against current upstream releases before the separately approved signed App Store build.
