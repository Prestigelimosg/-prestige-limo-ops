# Pre-Edit Source Of Truth Contract

This contract locks the required task-start and pre-edit inspection order for Codex work on Prestige Limo Ops.

It is docs/test-only. It does not approve runtime implementation, UI/API behavior change, new UI sectors, new buttons, endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, or new shims.

## Required At Every Task Start

Before choosing the next task, moving forward, or editing any repo file, read:

- recent git history, using `git log --oneline -12` or a wider equivalent when needed;
- current worktree state, using `git status --short`;
- the current implementation ledger at `docs/current-implementation-ledger.md`.

This applies to every task, including docs-only, test-only, read-only, review, smoke, bug-fix, and commit work. The source-of-truth read must happen before selecting the forward lane, before deciding that work is already done, before adding docs, before adding tests, before changing UI/API/helper behavior, and before committing.

The ledger must be read as the repo source of truth before choosing a task, adding docs, adding tests, changing UI/API/helper behavior, or committing. Git history must be read first so the task is anchored to commit hashes and task names, not memory or checkpoint counters.

## Why This Exists

The required read order prevents:

- repeating completed work;
- moving backward to old staging checkpoints;
- treating vague forward-motion wording as approval for a new feature;
- missing a parked risky lane;
- moving to a next task without first checking the source-of-truth files;
- editing over an unclean worktree without noticing;
- using inconsistent checkpoint counters instead of commit hashes and task names.

## Allowed Next Work

After the pre-edit read, the next task must stay within the current approved boundary.

Allowed without explicit new-feature approval:

- read-only verification;
- local test, lint, smoke, or guard execution;
- docs clarification;
- docs/test-only guard hardening;
- bug fixes for already-approved behavior;
- review and commit of bounded verification/fix work.

Not allowed without explicit owner approval:

- new product features;
- runtime implementation or activation;
- UI sectors, buttons, cards, or customer/driver-visible surfaces;
- endpoint migration;
- env changes or deployment;
- live reads, DB writes, migrations, provider sends, payment/PDF/pricing/payout/auth/location/photo/calendar activation;
- parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, or new shims.

## Reporting Rule

Final task summaries must name the commit hash and task name when a commit is made, list the checks that passed, and report final `git status --short`.

Do not report inconsistent checkpoint counters. Use commit hashes and task names as the source of truth.
