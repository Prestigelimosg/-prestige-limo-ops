# Manual test:browser coverage note

`npm run test:browser` is standalone/manual legacy booking smoke coverage. It maps to:

```sh
node scripts/test-booking-browser.mjs
```

It is not included in `npm run test:safe`. Keep it outside `test:safe` unless a separate review decides that the extra browser-driver coverage belongs in the safe umbrella.

## Runtime expectations

The test expects Prestige Limo Ops to already be available at `APP_URL`, or at `http://localhost:3000` when `APP_URL` is not set. It does not start the dev server itself.

By default, the test launches Chrome. For manual Safari coverage, it can be run with `BROWSER=safari` when Safari and safaridriver are available.

## Useful manual coverage

The script is useful for quick manual Safari/cross-browser booking smoke checks. It exercises the legacy browser booking flow, checks that the booking UI can parse a sample, and verifies the basic smoke signals around `Create Job Card`, `Save Booking + CRM`, browser runtime errors, and browser console errors.

For custom probing, the script supports `BOOKING_SAMPLE`. For optional multi-booking warning probing, run it with `EXPECT_MULTIPLE=1`.

## Relationship to newer browser suites

This command overlaps with newer safe-suite browser tests, especially `npm run test:booking-ui-browser` and `npm run test:app-smoke-browser`, with lighter overlap against `npm run test:mobile-usability-browser`.

Do not retire or delete `test:browser` without a separate review. Its main remaining value is manual legacy Safari/cross-browser booking smoke coverage.
