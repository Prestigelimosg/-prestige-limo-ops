# Prestige SG Customer Companion

This is the isolated iPhone foundation for the existing Prestige Limo Customer experience. It keeps the approved light-mode `/book` and `/my-bookings` pages as the only booking and portal workflows and adds only a native header, two native navigation tabs, strict same-origin navigation, and an optional local Face ID privacy lock.

The companion does not contain a second booking form, CRM matcher, booking writer, invoice implementation, payment implementation, customer-message implementation, or database client. The existing HTTPS pages keep their current same-origin cookies, APIs, persistence, CRM identification, invoice/PDF reads, messages, driver tracking, amendments, and cancellation-review handoffs.

## Local validation

```sh
npm install
npm run typecheck
npx expo run:ios
```

The first local/native checkpoint is iPhone-only and does not create an Apple App ID, App Store Connect record, EAS project, signed build, TestFlight group, or public release. The existing Customer logo is copied byte-for-byte into this project. Universal Link association remains unmodified until the exact Customer Apple App ID exists and the owner separately approves the public read-only association update. Until then, existing signed Customer App links continue their established browser behavior.

Do not claim the Customer App is App Store ready until a later approved lane proves signed-link activation into the installed app, cookie/session continuity, Face ID relaunch and foreground locking, both tabs, invoice PDF handling, customer/PA row isolation, forbidden-field absence, and physical iPhone acceptance.

The initial dependency audit reports inherited Expo/Metro/Xcode and React Native advisories, with no critical finding. npm's proposed automatic resolution is an incompatible downgrade to Expo 53/React Native 0.72, so no automatic audit fix is applied. Recheck the complete native toolchain against current upstream releases before the separately approved signed App Store build.
