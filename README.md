# Fadhil Yassar — portfolio (v2)

A horizontal walkthrough of a small museum: a hallway with a light switch,
a navy gallery room of physically framed project work, then a maroon "about"
room. Plain HTML/CSS/JS, no build step. Design source: Figma `489:7505`.

## Editing content

All copy, images, and the timeline live in **`data/content.json`**. You never
need to touch `index.html`, `styles.css`, or `script.js` to update text, swap
photos, or edit the timeline.

- **Project copy**: edit `main.projects[]` — `title`, `meta`, `description`,
  `proof`, `proofWeight` (`"medium"`, `"semibold"`, or `"bold"`).
- **Project images**: each project's `images` array must keep the same number
  of entries as it has frames on the wall (Wave 3, CyberKongz 4, Touchbiz 5,
  Ballogy 3, Mantis 2) — positions come from `styles.css`, matched by order.
- **Frame type**: every image has a `"frame"` — one of `rectangle`, `square`,
  `renaissance`, `renaissance-portrait`, or `circle`. Changing it swaps the
  physical frame; the slot's size/position stays the same, so pick a frame
  whose shape suits that slot.
- **Reordering projects**: reorder `main.projects` — layout follows each
  project's `id`, not its array position.
- **Bio, tools, timeline, CTA, resume/contact links**: all under `about`. The
  timeline's 6 entries render as two columns (first 3, then the rest) beside
  the `about.timeline.photo` frame.
- **Hallway switch labels**: `hallway.switchLabelOff` / `switchLabelOn`
  (read by screen readers).

Images are lazy-loaded automatically.

## Running locally

The page loads `data/content.json` with `fetch()`, so serve the folder rather
than double-clicking `index.html`:

```
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## How navigation works

- **The hallway** starts with the lights off. Scrolling/swiping does nothing
  (the switch wiggles) until the visitor taps the switch; then scrolling walks
  through the doorway into the gallery — a camera push through the door, no
  fade. Tapping the switch again turns the lights off and returns to the
  hallway.
- **Sizing** — every screen shows the same 1440×800 Figma canvas at 1:1. It
  scales *down* to fit a shorter screen but never up; on larger screens it
  stays 1:1, centred, with walls, ceiling and floor continuing into the extra
  space (Figma `511:385`).
  - **Phones (<768px)**: reference frame 390×844 (Figma `511:163`); the
    hallway is framed on the light switch. Larger phones keep that size.
  - **Tablet / desktop (≥768px)**: reference height 800; the hallway is framed
    on the door. Desktop uses wheel/trackpad; tablets are touch-driven.
- **Touch** follows the finger 1:1, with momentum, then settles on the same
  positions the arrows step to; any deliberate swipe advances at least one
  step. The arrows/keys step one piece at a time, or — when a piece is wider
  than the screen — one screen-sized chunk at a time, left-aligned, placard
  first.
- **Foldables**: an unfolded inner screen (touch, ≥768px wide, ≤700px tall,
  near-square) is treated as a two-pane wall: snapping and stepping never
  leave an artwork or placard across the centre hinge, and the arrow buttons
  sit one per pane. Folding/unfolding re-lays out instantly (ResizeObserver)
  and keeps the visitor on the same piece.
- **Safe areas**: content and controls stay clear of notches and the home
  indicator (`viewport-fit=cover` + `env(safe-area-inset-*)`).
- **Reduced motion**: a plain stacked, natively scrolling layout instead.

## Assets

- `hallway-walls.png`, `hallway-edge-*.png` — the entrance walls (the edge
  strips continue them on very wide/tall screens), `switch-off.png` /
  `switch-on.png` — the light switch, `floor.png` — the gallery floor.
- `Rectangle-frame.png`, `Square-frame.png`, `Renaisans-frame.png`,
  `Renaisans-frame-portrait.png`, `Circle-frame.png` — the physical frames.
- Wall colours are CSS (`--wall-main: #041e3a`, `--wall-about: #320b09`),
  with the Figma light-beam and vignette layered on top.
- `wordmark-fadhil-yassar-light.svg` — the signature on the portrait piece.
- `nav-arrow-*-light.svg` — the nav buttons' icons on the dark walls.
- Everything else is a project screenshot or personal photo referenced by
  `data/content.json`. Filenames are descriptive (e.g. `wave-web homepage.jpg`)
  because the lightbox caption is generated from the filename.
- For sharp frames on 3× displays, keep source images at least 3× their
  largest on-screen size (most are already well above that).
