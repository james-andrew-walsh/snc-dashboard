# CHANGE REQUEST: Mobile Responsive Layout for Overview Page

## Overview
The Overview page's map + locations panel layout breaks on mobile devices. The locations panel is positioned to the right of the map, causing horizontal overflow on narrow screens. This change request implements a responsive layout that maintains the current desktop design while stacking the locations panel below the map on mobile.

## Problem Statement
- **Current Layout:** Map and locations panel are side-by-side using `flex` with `flex-1` and fixed-width panel
- **Mobile Issue:** Combined width exceeds viewport, causing horizontal scroll or clipped content
- **Impact:** Dashboard is unusable on mobile devices

## Proposed Solution
Implement responsive breakpoints using Tailwind CSS:
- **Desktop (≥1024px):** Current side-by-side layout preserved
- **Tablet (768px-1023px):** Locations panel collapses to a narrower width or moves below
- **Mobile (<768px):** Locations panel stacks vertically below the map, full width

## Technical Implementation

### File: `src/views/Overview.tsx`

Current structure (simplified):
```tsx
<div className="flex gap-4">
  {/* Map */}
  <div className="flex-1 h-[500px]">
    <MapboxMap ... />
  </div>
  {/* Locations Panel */}
  <div className="w-[300px]">
    <LocationsPanel ... />
  </div>
</div>
```

Proposed responsive structure:
```tsx
<div className="flex flex-col lg:flex-row gap-4">
  {/* Map */}
  <div className="flex-1 h-[400px] lg:h-[500px]">
    <MapboxMap ... />
  </div>
  {/* Locations Panel */}
  <div className="w-full lg:w-[300px]">
    <LocationsPanel ... />
  </div>
</div>
```

### Responsive Breakpoints
- `lg:` (≥1024px): Side-by-side layout (current behavior)
- Default (<1024px): Stacked vertical layout

### Map Height Adjustments
- Mobile: `h-[400px]` (reduced from 500px to fit better on screen)
- Desktop: `h-[500px]` (unchanged)

### Locations Panel Adjustments
- Mobile: Full width (`w-full`), stacks below map
- Desktop: Fixed width (`w-[300px]`), side-by-side

## Acceptance Criteria
- [ ] Desktop layout (≥1024px) remains unchanged from current
- [ ] Mobile layout (<768px) shows map stacked above locations panel
- [ ] No horizontal scroll on mobile devices (iPhone SE, iPhone 14, Pixel 7)
- [ ] Locations panel is scrollable if content exceeds viewport height
- [ ] Map interactions (zoom, pan, click) work correctly on mobile touch

## Testing Notes
Test on actual devices or browser dev tools:
- iPhone SE (375×667)
- iPhone 14 (390×844)
- iPad Mini (768×1024)
- Desktop (1920×1080)

## Definition of Done
- [ ] Change request approved
- [ ] Implementation complete in `src/views/Overview.tsx`
- [ ] Tested on mobile and desktop viewports
- [ ] No visual regressions on desktop
- [ ] Changes committed and pushed to GitHub
