# Local Secret Access Note

No secrets are stored in this repository.

For approved Supabase production database maintenance, the database password is stored in macOS Keychain:

- Keychain service: `prestige-limo-ops-supabase-db-password`
- Keychain account: `prestige-limo-ops`

Retrieve it without printing the value:

```sh
PASS="$(security find-generic-password -a prestige-limo-ops -s prestige-limo-ops-supabase-db-password -w)"
```

Do not echo, log, commit, paste, or expose the password value.
