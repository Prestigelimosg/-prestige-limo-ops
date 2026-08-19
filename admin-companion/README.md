# Prestige SG Admin companion

This isolated iOS companion opens only the verified Prestige Admin sign-in and protected Admin pages at `https://app.prestigelimo.sg`.

The first successful server login must complete Face ID enrollment before a protected page can load. Later launches and foreground resumes require Face ID before the WebView is mounted. No server token, Supabase credential, provider credential, customer secret, or Admin password is stored in the native source.

The EAS project ID, Apple App ID, App Store Connect app ID, icon, signing credentials, build, submission, and TestFlight assignment remain deliberately unset until their separately approved provider steps.
