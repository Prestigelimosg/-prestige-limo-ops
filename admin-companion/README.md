# Prestige Limo Ops companion

This isolated iOS companion opens only the verified Prestige Admin sign-in and protected Admin pages at `https://app.prestigelimo.sg`. Its owner-approved black-and-gold `PRESTIGE LIMO OPS` artwork is used only as this native app's iOS icon.

The first successful server login must complete Face ID enrollment before a protected page can load. Later launches and foreground resumes require Face ID before the WebView is mounted. No server token, Supabase credential, provider credential, customer secret, or Admin password is stored in the native source.

The approved EAS project `@prestige-limo-ops/prestige-admin` and existing App Store Connect app `6803312296` are linked in the native configuration. Signing credentials, cloud build, submission, and TestFlight assignment remain deliberately unset until their separately approved provider steps.
