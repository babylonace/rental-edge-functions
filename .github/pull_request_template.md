## What and why

<!-- One or two sentences: what changes, and the reason. Link the issue if there is one. -->

## How it was checked

<!-- Commands run and what they printed, or what you tried in the browser. "CI is green" counts only if the checks below ran on this branch. -->

## Risk

- [ ] Low: copy, docs, styling, tests only
- [ ] Medium: behaviour change in code that has tests
- [ ] High: touches sign-in, secrets, permissions, deploy or CI configuration (needs a slower, line-by-line read)

## Author checklist

- [ ] I read the diff to understand what was done, and correct it where needed.
- [ ] Tests were added or updated for any behaviour that changed.
- [ ] Every new dependency exists on its registry, is maintained, and was added on purpose (no invented or look-alike package names).
- [ ] No secrets, tokens, personal data or private paths in code, comments, logs or test data.
- [ ] README and docs match what the code now does.
