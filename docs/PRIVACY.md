# Public-release privacy preparation

The repository is private while this audit is in progress. A clean latest commit is insufficient: Git history, author metadata, issue bodies/comments, attachments, releases, and workflow artifacts can retain earlier information.

## Observed audit

- Gitleaks 8.30.1 scanned the original three commits with default credential rules and reported no detected secrets. This is a scanner result, not proof that no possible secret exists.
- Direct value comparison against configured local speech credentials found no committed credential values during the implementation push.
- Personalized sample/test wording and a product-plan name were found and replaced with generic text. No user conversation is needed in fixtures.
- Earlier commit metadata contains a personal email and real author name. Future commits use a public project identity and GitHub no-reply email. Existing history still requires rewriting before public visibility is enabled.
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

1. Confirm the intended open-source license; none has been selected yet.
2. Scrub identifying file content and author/committer metadata from all published refs, with a private recovery backup.
3. Validate the rewritten history and current tree; inspect GitHub issues, comments, releases, and artifacts.
4. Replace published history only with explicit approval because commit IDs change and existing clones must be reconciled. GitHub-retained old objects may require separate removal; rewriting a branch alone is not an absolute erasure guarantee.
5. Verify the sanitized remote, then change visibility only when publication is authorized.

No history rewrite or public-visibility switch is implied by a passing scan.
