# Public-release privacy preparation

This repository is ready for public visibility. A clean latest commit alone is insufficient: Git history, author metadata, issue bodies/comments, attachments, releases, and workflow artifacts can retain earlier information.

## Observed audit

- Gitleaks 8.30.1 scanned the original three commits with default credential rules and reported no detected secrets. This is a scanner result, not proof that no possible secret exists.
- Direct value comparison against configured local speech credentials found no committed credential values during the implementation push.
- Personalized sample/test wording and a product-plan name were found and replaced with generic text. No user conversation is needed in fixtures.
- Earlier commit metadata contains a personal email and real author name. Future commits use a public project identity and GitHub no-reply email. The owner explicitly accepts existing personal email/author metadata; no history rewrite is planned. This exception does not authorize adding private personal data in future changes.
- GitHub issue bodies/comments were checked for known personal identifiers, machine addresses, and personal paths. Repository/account links intentionally identify the public GitHub project; these are not private infrastructure addresses.
- Audio auditions, runtime tokens, keys, personal native histories, local settings, and test screenshots are excluded from source control. The application's runtime data remains on the user's own machine.

## Repeatable checks

Install Gitleaks, then run:

```sh
gitleaks git --redact --no-banner .
git ls-files
```

The committed configuration extends the default secret detectors with personal mailbox, personal home-path, and Tailscale-address checks. Only explicit example home-path placeholders are allowed. These checks do not identify every form of personal data; review fixtures, docs, screenshots, and Git author metadata as well.

Do not publish raw scanner reports that might contain matched secrets. Do not commit a denylist containing real personal identifiers. Keep audit exports and pre-cleanup backups outside the repository with restricted filesystem access.

## Publication gate

1. The project uses the MIT License.
2. Scan the current tree and all published history for credentials. Keep the owner-accepted historical author identity and earlier personalized sample wording; do not force-push a rewrite.
3. Review new file content, issues, comments, releases, and artifacts for private paths, infrastructure addresses, keys, and real transcripts.
4. The owner authorized public visibility on 2026-09-19 after this review.

Future publication requires a fresh privacy review; no history rewrite is implied by a passing scan.
