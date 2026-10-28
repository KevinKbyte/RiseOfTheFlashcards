# Credits

Every non-code asset shipped in the game is listed here with its author and license. The sponsor may ask for proof of license for any
asset (rules.md:179), so a row lands in the same commit as the asset.

## Convention (enforced by `node scripts/credits-audit.mjs`, spec CRED-001)

- The audit scans the engine asset root (the Assets or Content folder at the repo root, whichever exists; engine per ADR 0001, pending)
  and skips code/metadata files (.cs .meta .asmdef .asmref .cpp .h .hpp .c).
- Every other file there must be covered: its repo-relative, forward-slash path appears in backticks in this file, or it sits under a
  backticked directory prefix ending in "/" (one row can credit a whole pack folder).
- Exit 0 = all covered; exit 1 = lists each uncovered path; exit 2 = this file is missing (CRED-002).
- Backticks in this file are coverage claims. Only backtick real asset paths in the Path column; never backtick a bare asset-root folder,
  which would mark every asset as credited.
- Starter decks: Kev-authored, public domain, or CC only.

## Assets

| Path | Author | License | Source URL | Notes |
|---|---|---|---|---|

No assets yet.

## Dependencies

| Dependency | License | Notes |
|---|---|---|
| Meta XR SDKs | Meta's own SDK license | Installed via the engine's package manager, never vendored into this repo |
| `@upstash/redis`, `@upstash/ratelimit` (npm) | MIT | Pairing relay store and POST rate limit |
| Vercel | Hosting service (Vercel terms) | Hosts the relay function, companion paste page and privacy policy |

## Rights granted to Meta

The game stays MIT-licensed and owned by Kev. Meta receives only the judging and promotion license the competition grants
(guidelines.md:44). The Official Rules word that grant more broadly (rules.md:342: irrevocable, perpetual, incl. marketing use).

## Author

Kev ([KevinKbyte](https://github.com/KevinKbyte)).
