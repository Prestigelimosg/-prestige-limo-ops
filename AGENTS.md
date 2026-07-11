<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Mandatory startup and no-duplicate workflow

Before proposing, testing, or editing a feature:

1. Read `docs/current-implementation-ledger.md` as the current implementation source of truth.
2. Run `git status --short --branch` and `git log --oneline -10` to identify the branch, uncommitted work, and recently completed fixes.
3. Search the existing app, routes, docs, and focused guard scripts for the requested workflow before proposing a new implementation.
4. Run the existing focused guard before changing the workflow. Treat documented behavior with a passing guard as already implemented unless the exact workflow is reproduced as broken in the approved runtime surface.
5. Do not add a second lane, panel, route, helper, button, or write path for an existing workflow. Repair the established lane in place and preserve its wired consumers.
6. Record every approved fix in the implementation ledger and protect it with a focused regression guard so later agents can distinguish completed work from a newly reproduced failure.

Follow TEST → FIX → REVIEW → COMMIT in one bounded pass. Do not claim runtime behavior works from source inspection or a passing guard alone.
