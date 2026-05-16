# Prestige Limo Ops System Rules

These are permanent business and implementation rules for Prestige Limo Ops. Future changes must preserve them unless the operator explicitly updates this file.

## 1. WhatsApp Job Card Rules

- First line must be vehicle plus booking code, for example `AVF MNG`, `AVF DEP`, `AVF TRF`, or `AVF DSP`.
- Second line must be the pickup date/time in concise dispatch format.
- Routes must be clean operational routes only, formatted as `Pickup > Drop-off`.
- Job cards must not include greetings, customer chatter, full customer sentences, unit numbers, postal codes, or unnecessary full addresses when a landmark is known.
- Passenger/boss/name is shown as `Name: <name>` when available.
- Booker/requestor is stored internally in CRM and must not be shown on the WhatsApp job card.
- MNG is airport arrival or meet-and-greet.
- DEP is departure.
- TRF is point-to-point transfer.
- DSP is disposal/hourly/standby/event use.
- Midnight surcharge applies for pickup times from `2300` through `0659`.
- ETA and buffer text, when added, must be operationally concise and not conversational.
- Job card cleanliness has priority over preserving original customer wording.

## 2. Pricing Rules

- Default customer pricing:
  - Arrival/MNG: `85`
  - Departure/DEP: `75`
  - Transfer/TRF: `55`
  - Disposal/DSP: `65` per hour
- Default driver payout:
  - Arrival/MNG: `65-75`
  - Departure/DEP: `55-65`
  - Transfer/TRF: `45-70`, depending on distance
  - Disposal/DSP: `50` per hour
- Midnight customer surcharge: `15` for pickup times from `2300` through `0659`.
- Midnight driver payout surcharge: `10`.
- Extra stop driver payout: `10`.
- DSP pricing is hourly unless a custom rule says otherwise.
- Boss/name-specific customer rates override company/account rates.
- Company/account rates override default Prestige Limo rates.
- Custom driver payout rules may be stored by boss/name or by company/account.
- Known special rules:
  - Su Ling DSP customer rate: `60/hr`
  - Tiger Global / June Aw:
    - Arrival/MNG: `75`
    - Departure/DEP: `65`
    - Bosses: Mr Deep and Mr Stanley
  - Transzend: do not save traveler/passenger contact/name in Excel-style records, but names may appear on operational job cards when needed.

## 3. CRM Rules

- One company/domain/contact identity should resolve to one account; do not create duplicate customer tabs/accounts for the same company.
- Company/account profiles store rates, payout rules, aliases, privacy rules, and default relationship metadata.
- Booker profiles are stored internally and linked to company/account.
- Booker name/contact/email are CRM data and must not appear on job cards.
- Boss/traveler/name profiles are stored separately from bookers and linked to:
  - company/account
  - booker name
  - booker contact
  - booker email when available
  - default pickup/dropoff addresses
  - preferred vehicle
  - custom customer rates
  - driver payout rules
- Name/passenger/boss is operational and may appear on job cards and driver dispatch.
- Company/booker/boss should auto-link when a message contains company, booker, boss/name, contact, or email.
- Preserve historical relationships; do not overwrite useful existing CRM relationships with blank values.
- Preserve traveler/name memory and never blank a valid stored name.
- Save preferred vehicle and reusable address memory from confirmed bookings.
- Known relationship mappings:
  - Nicole Yap belongs under BNY; boss/traveler is Mr Rohan Singh.
  - Sharron belongs under Shiseido.
  - Polly Wong belongs under Apollo.
  - June Aw belongs under Tiger Global.

## 4. Parser Rules

- Auto read and auto detect are the core parser architecture.
- The parser must think like a dispatcher: infer operational intent first, then extract fields.
- Priority order:
  - operational meaning
  - name/passenger/boss
  - route
  - booking type
  - timing
  - company/booker
  - CRM relationships
  - clean operational output
- Users should not need strict templates long-term.
- Parser design must be layered:
  - WhatsApp cleanup
  - intent detection
  - operational extraction
  - CRM enrichment
  - clean output generation
- Parser improvements should favor resilient operational interpretation over rigid label-only parsing.
- Support WhatsApp multiline transcripts.
- Strip WhatsApp timestamp and sender prefixes before operational parsing.
- Ignore blank lines.
- Preserve cleaned message bodies as parser debug `cleanedLines`.
- Support messy real-world WhatsApp formatting, copied group chats, shorthand, typos, and conversational booking language.
- Flight detection must support universal 2-letter IATA airline code plus 1-4 digits, including compact and spaced forms such as `SQ377`, `SQ 377`, `QR948`, `BA15`, `QF1`, `TR485`, `EK355`, `CX734`, `JL36`, `NH844`, and `MU546`.
- Flight codes must normalize to uppercase compact form, for example `SQ 377` to `SQ377` and `qr948` to `QR948`.
- Airport arrival/MNG detection must handle airport pickup, pick up from airport, flight number before destination, arrival, arriving, ETA, landing, flight-arrives wording, and meet-and-greet wording.
- Departure/DEP detection must handle departure, depart, drop off airport, to airport, airport drop off, ETD, flight departure, taking flight, and pickup/address before flight or terminal.
- Airport terminal detection must handle `T1`, `T2`, `T3`, `T4`, and `Terminal 1/2/3/4`.
- If no terminal is stated for an airport arrival/departure, use `Changi Airport` without inventing a terminal.
- DSP detection must handle standby, disposal, hourly, dinner, wedding, event, send-back, and return-trip wording.
- If both pickup and dropoff are non-airport and no flight is present, infer `TRF` unless DSP/standby/hourly/event wording exists.
- Normalize all parsed pickup times to `HHMMhrs`.
- Extract only clean operational fields, never whole customer sentences.
- Route detection must prefer landmark-based operational locations when full addresses, unit numbers, postal codes, and conversational text are present.
- Location cleanup must remove:
  - greetings
  - conversational text
  - `please`, `kindly`, `thanks`, and similar filler
  - unit numbers
  - postal codes
  - full addresses when a landmark exists
- Human-name extraction must prefer actual names over generic nouns.
- `for <name>` may indicate passenger/boss/name.
- Name extraction must stop before operational words such as `today`, `tomorrow`, `from`, `to`, `at`, `pickup`, `arriving`, `landing`, and `flight`.
- Generic operational words such as `arrival`, `arriving`, `landing`, `pickup`, `transfer`, `guest`, and `passenger` must not become names by themselves.
- Booker/company phrases like `<booker> from <company>` must populate booker and company, not pickup.
- Driver extraction must support natural wording such as `get <driver> to drive <name>`.
- WhatsApp next-line names are supported.
- Route cleanup must remove passenger fragments such as `for Mr...`, `for Ms...`, and `for pax...`.
- Informal home wording such as `go home`, `send home`, and `to home` should populate a clean destination when present.
- DSP parsing should support wait-duration wording, intermediate stops, and return destinations such as `return to <place>`.
- Pickup extraction must be strict after `from`, `pickup from`, and `send from`, and must not include surrounding conversational text.
- Multi-booking messages with numbered lists, bullet lists, multiple flight codes, or multiple passenger lines must stop the single-booking parse pipeline early.
- Multi-booking parser output must contain only `multipleBookingsDetected: true`, a parser warning, cleaned lines, and `extractedBookingsPreview`; it must not expose merged single-booking fields like `flight`, `pickup`, `dropoff`, or `name`.
- UI must show the multi-booking warning banner and must not auto-fill booking form fields for multi-job messages.
- Ambiguous parses should leave missing critical fields blank and surface a parser warning rather than inventing route values.
- `get <driver> standby` indicates driver name.
- `send him/her/them back to <location>` indicates return/dropoff.
- Never overwrite a valid parsed or stored name with blank parser or CRM data.

## 5. Operational Rules

- The app is an internal operations dashboard only.
- There is no customer portal.
- Workflow must stay mobile-friendly and fast for dispatch use.
- Dispatcher should be able to paste, parse, review, assign driver, copy job card, copy driver dispatch, save CRM, and load/search bookings quickly.
- Driver dispatch generation must be concise and operational.
- Job cards and dispatch messages must prioritize clean operational data over original customer prose.
- Saved bookings dashboard should support quick search by name, company, flight, and route.

## 6. Regression Protection

- Keep permanent parser tests for all major booking styles:
  - WhatsApp multiline
  - WhatsApp blank lines
  - airport arrival/MNG
  - airport departure/DEP
  - transfer/TRF
  - DSP dinner/standby
  - return-trip wording
  - name propagation
  - clean route extraction
- Runtime tests should verify:
  - parsed state includes `name`
  - name input is populated
  - job card includes `Name: <name>`
  - driver dispatch includes `Passenger: <name>`
- Locked live-passed parser cases that must not change:
  - `Mr Lim Yeow Beng SQ377 0740hrs airport to 2C Anamalai Ave`
  - `Need 2 cars tomorrow. ... Mr Lee SQ377 arriving 0740hrs to Ritz Carlton. ... Ms Wong from St Regis to T3 at 9pm taking SQ638.`
  - `Hi bro, Ah Seng familiar with this guest already. ... Mr Faisal from Andaz to Tuas site 2pm ... standby till 6pm ... back to hotel.`
  - `Good afternoon William, my name is Brent Johnston ... SQ 633 arrives at Changi ... staying at the V Bencoolen Hotel.`
  - `Hi William, Nicole here from BNY. ... Mr Rohan Singh ... Flight NH844.`
- Future patches must not break name propagation again.
- Future parser changes must not reintroduce whole-sentence pickup/dropoff fields.
- Before every future task, run:
  - `npm run test:parser`
  - `npm run lint`
  - `npm run build`
- If any parser regression fails, stop and fix it before continuing.
- Before deployment, run:
  - `npm run test:parser`
  - `npm run lint`
  - `npm run build`
