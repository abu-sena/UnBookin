---
title: 'Apply the UnBookin logo'
type: 'feature'
created: '2026-10-27'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The approved UnBookin logo exists as a transparent PNG but the platform still uses plain text and a placeholder application icon.

**Approach:** Apply the approved logo consistently to the marketing header/footer, sign-in page, desktop sidebar, and default app header. Use its symbol for browser and Apple icons, and the full logo for shared-link previews. Keep page titles intact, make branding accessible, and preserve legibility in light and dark themes at 375px and desktop sizes. Reuse the original artwork without redesigning it. Preserve unrelated work in docs/PRD.md. This follows the user's explicit instruction to apply the logo, including the prior authorized logo asset.

</frozen-after-approval>

## Implementation Notes

- One-shot route: a shared presentation component, mechanical replacements of existing brand labels, metadata artwork integration, and derived icon assets. No business logic, dependency, database, or service changes.
- Next.js image and icon/OG metadata documentation read from the installed package before coding.
- Existing untracked docs/PRD.md is unrelated and will be left untouched.
- Added shared artwork rendering, responsive sizes, accessible localized names, white dark-theme treatment, and lazy footer loading. Updated all existing brand placements and the UI showcase.
- Extracted the approved symbol into 512px and 180px application icons with fully opaque white backgrounds. ICO includes 16/32/48px RGBA PNG frames; RGB-only frames were rejected by Turbopack and corrected before the successful production build.
- Automatic approval review rejected cleanup of the temporary BMad runtime with "blocked by policy". The generated _bmad directory remains local and untracked; it is excluded from the branding commit.

## Spec Change Log

## Review Triage Log

- One independent Blind Hunter review completed; no configured review layer was skipped. All findings were checked against the approved artwork and actual callers.
- Medium, patched: mixed alpha backgrounds in browser/Apple icons; flattened white backgrounds are now opaque.
- Low, rejected: slight color variation differs from the generation prompt. This is the artwork the user approved; recoloring would redesign the approved image.
- Low, rejected: editable vector master. The approved deliverable is raster; introducing a new vector reconstruction exceeds this integration and optimized browser images already avoid serving the full master.
- Low, patched: image size hints now match 128/144/160/176px placements, including responsive variants.
- Low, patched: footer logo uses lazy loading while headers load eagerly.
- Low, rejected: publicly accessible original image/prompt. These were intentionally delivered at these download paths in the previous turn, contain no secrets, and preserving them avoids breaking those links.
- Low, patched: added a 16px ICO frame alongside 32px and 48px frames.
- Medium, patched: narrow top bar with populated streaks; compact 112px mobile branding and a shrinkable link preserve space for controls.
- Low, rejected: showcase matrix for every size/export. The existing theme toggle plus actual browser checks across production pages validates the variants without introducing a separate showcase feature.
- Low, rejected: additional persistent regression suite for mechanical image placements. Browser assertions verified accessible names, image loading, navigation/icon metadata, alpha, ICO decoding, and OG generation; the complete existing unit suite also passes.

## Verification

- pnpm lint and pnpm typecheck passed. The first unconstrained test run hit an unrelated 5-second database-import timeout under parallel load; pnpm test --maxWorkers=2 passed all 150 tests in 35 files.
- pnpm build passed, including TypeScript and all static page generation.
- Production server on port 3001: homepage and sign-in returned 200 at 375px and 1280px in both themes. Assertions confirmed images loaded, accessible names were present, no page errors occurred, and no horizontal overflow occurred. Earlier development checks also covered /dev/ui in both themes.
- Favicon, 512px app icon, and 180px Apple icon returned 200; verified the ICO's three RGBA frames. Shared-link preview returned 200 and decoded to 1200x630. Screenshots of both themes, favicon, and Open Graph output were visually inspected.
