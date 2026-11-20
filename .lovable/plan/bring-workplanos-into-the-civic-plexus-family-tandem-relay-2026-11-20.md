# Bring WorkPlanOS into the Civic Plexus family (Tandem, Relay)

## What Tandem and Relay share
- Light, clean background with deep teal-navy text and buttons
- Teal-to-green accent color
- Bold Montserrat headings, Inter body text
- A simple teal-to-green gradient icon (Tandem: a rising swirl arrow, Relay: three chevrons)
- MIT License, "Copyright (c) 2026 Spencer Smith"

## Changes

1. **New WorkPlanOS icon and favicon**
   - Generate a matching teal-to-green gradient icon in the same style — a stacked "board / checklist" shape that reads as planning, kept simple enough for a browser tab.
   - Use it as the browser tab icon, Apple home-screen icon, and in place of the purple "W" square in the landing page header, footer, and the signed-in sidebar.
   - Remove the old default Lovable icon.

2. **MIT License**
   - Add a `LICENSE` file with the same MIT text and copyright line as Tandem and Relay.
   - Mark the project as MIT in `package.json` and add a short License note to the README and the landing page footer ("Open source · MIT").

3. **Restyle to match the family**
   - Swap the purple/indigo color scheme for the family's teal-navy main color and teal-green accent, in both light and dark mode.
   - Switch headings to Montserrat (bold), keep Inter for body text.
   - Keep the board status colors (working/stuck/done) as they are so boards still read clearly.
   - Because the whole app already pulls colors from one shared style sheet, the change spreads to every page automatically — boards, calendar, dashboards, admin, sign-in.

4. **Landing page touch-ups**
   - Use the new icon and Montserrat headline, add a small "Part of the Civic Plexus suite" line linking Tandem and Relay.

## Technical details
- `src/styles.css`: replace `:root` and `.dark` primary/ring/sidebar/chart tokens with Tandem's oklch values (`--primary: oklch(0.38 0.07 222)`, `--foreground: oklch(0.33 0.06 225)`, `--accent` teal-green), add `--font-display: "Montserrat"` and apply it to h1–h3.
- `src/routes/__root.tsx`: Google Fonts link adds Montserrat 500–800; icon links to `/favicon.png` + `/apple-touch-icon.png`; delete `public/favicon.ico`.
- Icon generated via image tool, resized with magick to 64px favicon / 180px apple icon; full-size mark imported as a bundled asset for in-app use.
- New `LICENSE`, `"license": "MIT"` in package.json, README section.
- Verify with a screenshot of the landing page and a board.
