# How this repository is developed

One maintainer works on this repository. This page says what happens to a change before it reaches `main`, what machines check, what a person checks, and what is not checked at all. Some changes are AI-assisted; nothing here depends on who or what wrote a change, because every change meets the same checks.

Everything below was read from the repository settings and workflow files on 2026-11-06. If a setting changes, this page changes in the same pull request. Sections marked _(this repository)_ are specific to this repo; the rest is the same across my public project repositories and can be copied.

## What happens to a change

1. The work happens on a branch. A ruleset on `main` requires a pull request and the status checks listed below, blocks force-pushes and deletion, and has an empty bypass list, so it applies to the maintainer too.
2. The pull request follows [the template](../.github/pull_request_template.md): what and why, how it was checked, a risk level (low, medium, high) and a checklist.
3. CI runs on the branch and on the pull request.
4. The maintainer reads the diff and merges once the required checks are green.

## What machines check

_(this repository)_ Required for `main`: `test (22)`, `test (24)` and `secrets`.

| Job | What it runs | Blocks the merge |
| --- | --- | --- |
| `test (22)`, `test (24)` | `npm test` with Node's built-in runner, on Node 22 and on Node 24. The tests use a fake `fetch` that fails on any unexpected URL, a frozen clock and a throwaway key pair, so none touches the network. | Yes |
| `secrets` | gitleaks 8.30.1 over the whole git history (`fetch-depth: 0`), not only the last commit. | Yes |

Workflows declare `permissions: contents: read`, and the repository default token is read-only too. A job that needs more asks for it explicitly (none does here). Every action is pinned to a full commit hash with the version in a comment.

## What a person checks

The pull request template asks the author to confirm, before asking for a merge:

- I read the whole diff and can explain every change.
- Tests were added or updated for any behaviour that changed.
- Every new dependency exists on its registry, is maintained and was added on purpose (no invented or look-alike package names).
- No secrets, tokens, personal data or private paths in code, comments, logs or test data.
- README and docs match what the code now does.

A change that touches sign-in, secrets, permissions, deploys or CI configuration is marked high risk and gets a slower, line-by-line read.

This human step is a practice, not a setting. The ruleset requires zero approvals, because a single maintainer cannot approve their own pull request on GitHub. `CODEOWNERS` names the maintainer as owner of every file and requests the review, but "require review from code owners" is off.

## New dependencies

_(this repository)_

- Runtime: none. `package.json` lists no dependencies. The functions use only web-standard APIs (`fetch`, `Request`, `Response`, `crypto.subtle`) and CI installs nothing.
- Dependabot opens a weekly pull request for GitHub Actions. There are no npm packages to update.

GitHub Dependabot alerts and Dependabot security updates are on.

## Secrets and vulnerabilities

- GitHub secret scanning and push protection are on: a push containing a recognised secret is blocked unless the pusher explicitly overrides it.
- The repository stores no secrets. There are zero repository secrets. The runtime secrets live in Cloudflare, outside GitHub.
- Private vulnerability reporting is on, and [SECURITY.md](../SECURITY.md) says how to use it and what is in scope.

## Evidence _(this repository)_

Numbers below were printed by the linked run on 2026-11-05. They change as tests are added.

- Pull request that added these controls: [#1](https://github.com/babylonace/rental-edge-functions/pull/1).
- [Pull request run](https://github.com/babylonace/rental-edge-functions/actions/runs/42132058186), all required checks green: `test (22)` 7 s and `test (24)` 7 s, 41 of 41 tests on each; `secrets` 5 s, 7 commits scanned, no leaks found.

## What is not covered

- The human review above is not enforced (see "What a person checks").
- "Require branches to be up to date before merging" is off, so a pull request is checked on its own branch, not against the latest `main`.
- No code scanning (CodeQL or similar) is configured. Commit signing is not required.
- The Actions setting that forces every action to be pinned to a hash is off. Pinning is done in the workflow files and holds today because every `uses:` line is pinned, but GitHub would not refuse an unpinned one.
- The gitleaks binary is downloaded from its release page at run time and its checksum is not verified.

## Copy this setup

1. Ruleset on the default branch: require a pull request, require status checks, block deletion and force-pushes, leave the bypass list empty. Use the exact job names as they appear on a pull request (for a matrix job that includes the version, for example `test (22)`); a required check that never reports blocks the merge forever.
2. Settings, Code security: secret scanning, push protection, Dependabot alerts and security updates, private vulnerability reporting.
3. `.github/dependabot.yml` with a weekly schedule for each ecosystem in use, including `github-actions`.
4. In each workflow: `permissions: contents: read`, and every action pinned to a full commit hash with the version as a comment.
5. `.github/CODEOWNERS`, `.github/pull_request_template.md` and `SECURITY.md`.
6. After the first pull request goes through, link its CI run in the evidence section and write down only numbers a run printed.

## Background reading

- NIST, [SP 800-218, Secure Software Development Framework](https://csrc.nist.gov/pubs/sp/800/218/final)
- OpenSSF [Scorecard](https://scorecard.dev), a checklist of repository security practices

These are where the ideas come from. This repository does not claim to comply with any of them.
