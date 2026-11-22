# Debug: find the cause before the next fix

`run-verify.mjs` prints "failed again" when a check fails two runs in a row. Another change made to
see if it helps is guessing. Stop and diagnose; the same goes for a bug the developer reports.

Use `superpowers:systematic-debugging` or `mattpocock-skills:diagnosing-bugs` when installed.
Otherwise: reproduce it with one command that fails every time; read the whole error and the diff
since it last passed; test the cheapest hypothesis first, one change at a time; bisect when stuck;
fix the cause once and keep the reproduction as a test.

Write the result in `.verify/debug.md` (the evidence pack shows it):

```markdown
- check: backend/integration · failed 3 runs in a row
- cause: the unique index is on (key) but the lookup filters by (key, user_id)
- proof: "same key twice returns the first order" failed before, passes after
```

Never rerun until green, add a sleep or a retry, loosen an assertion or a threshold, or skip the
test. A cause a check could have caught goes through `shared/ratchet.md`.
