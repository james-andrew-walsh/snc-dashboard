# CR-009: Magnet Board — Replace Script Font with Basic/Whiteboard Font

## Status
Draft — awaiting execution

## Requested By
James Andrew

## Date
2026-04-23

---

## Problem

The Magnet Board title ("Dispatch Board") and job names on cards are currently using a cursive/script font. This looks out of place on what should feel like a construction site whiteboard.

---

## Solution

Replace the script font with a basic, bold sans-serif font that looks like whiteboard marker text. If the project has a whiteboard-style font available, use that. Otherwise, use a clean bold sans-serif (e.g., `font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif` with `font-weight: 700`).

### Targets

1. **"Dispatch Board" header** at the top of the Magnet Board page
2. **Job name on each magnet board card** — the large job name/description text on each column header

### Font Style
- Bold, clean, all-caps or title-case
- Think: whiteboard marker, construction signage
- Avoid: cursive, script, thin/light weights

---

## Files to Modify
- `src/views/MagnetBoard.tsx`
- `src/index.css` (if custom font imports needed)

---

## Done When
- Title and job names use the new basic/whiteboard font
- `npm run build` passes with zero errors
- Committed to GitHub
- **PRD.md Change Log updated**
