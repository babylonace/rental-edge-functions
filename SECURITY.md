# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Use GitHub's private reporting instead: open the **Security** tab of this repository and choose **Report a vulnerability**. Include what you found, the steps to reproduce it and, if you can, what an attacker could do with it.

This is a one-person project, so replies are best effort. You will get an answer in the same private thread, and a fix is published before the details are.

## What is in scope

This code decides who can see what, so these matter most:

- Token-to-cookie guest access (expiry, rotation, overlap, time zone handling).
- Cloudflare Access JWT verification.
- CORS handling and the public availability API.
- Anything that could leak a calendar link or another secret.

## What is not

- Problems in Cloudflare, GitHub or a browser themselves. Report those to their owners.
- Findings that need access to a maintainer's own account or device.

## How changes are checked

Every change goes through a pull request. Tests on Node 22 and 24 and a full-history secret scan (gitleaks) must pass before it reaches `main`. The functions have no runtime dependencies. CI actions are pinned to commit hashes and Dependabot proposes updates weekly. Secret scanning and push protection are on.
