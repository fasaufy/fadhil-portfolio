# Fadhil Yassar — portfolio

A horizontal-scrolling "gallery" walkthrough: two intro beats, a continuous
filmstrip of project rooms, a continuous "about" section (different palette),
and a closing beat. Plain HTML/CSS/JS, no build step.

## Editing content

All copy, images, and the timeline live in **`data/content.json`**. You never
need to touch `index.html`, `styles.css`, or `script.js` to update text, swap
photos, or edit the timeline.

- **Project copy**: edit `main.projects[]` — `title`, `meta`, `description`,
  `proof`, `proofWeight` (`"medium"`, `"semibold"`, or `"bold"`).
- **Project images**: each project's `images` array must keep the same number
  of entries as it has picture frames (Wave 3, CyberKongz 4, Touchbiz 5,
  Ballogy 4, Mantis 2) — the layout positions are matched to that array by
  order, in `styles.css`. Swap `"src"` paths or leave `"src": null` for a
  blank placeholder frame. Don't add/remove entries without also adjusting
  the matching `[data-project="..."]` rules in `styles.css`.
- **Reordering projects**: reorder the `main.projects` array — layout follows
  by project `id`, not array position, so this is safe.
- **Bio, tools, timeline, CTA, resume/contact links**: all under `about` in
  the same file — plain text and arrays, safe to edit freely. The timeline's
  6 entries render as a horizontal row of cards on desktop (first 3 → group 1,
  remaining 3 → group 2) — reorder within those groups, but don't add/remove
  entries without touching `styles.css`'s `.timeline-entries`/`.timeline-entry`
  rules (which size each card to match Figma).
- **Bio photos**: `about.bio.photos[]` needs exactly 5 entries (5 picture
  frames on the wall), same rule as project images.

Images are lazy-loaded automatically — nothing extra to do.

## Running locally

Because the page loads `data/content.json` with `fetch()`, you can't just
double-click `index.html` (browsers block that for local files). Run a tiny
local server from this folder instead, then open the printed URL:

```
python3 -m http.server 8080
# or: npx serve
```

Then visit `http://localhost:8080`.

## Deploying to Vercel

This is a static site — no build command needed.

```
npx vercel
```

Follow the prompts (Framework Preset: **Other**, no build command, output
directory: `.`). Every push to your connected Git repo will auto-deploy if you
link one, or you can just re-run `npx vercel --prod` whenever you update content.

## How navigation works

- **intro-1, intro-2, and the closing resume/contact piece** are "beats" —
  scrolling into them always settles fully centered before you can move on.
- **The main gallery and the about section** are continuous filmstrips —
  scroll (or touch-drag) moves smoothly through every piece without snapping
  to each one.
- Desktop (≥1024px) and tablet (768–1023px, no dedicated design — reuses the
  desktop canvas) both run the same continuous engine, scaled to fit the
  viewport's actual height. Screens narrower than 768px switch to a
  dedicated mobile canvas (its own Figma frame, smaller reference pieces),
  scaled to fit the viewport's actual width, still touch-driven with the same
  continuous physics — not a separate stacked/paged layout.
- Whenever the OS's reduced-motion setting is on, this collapses to a plain
  stacked, natively-scrolling layout instead, at any screen size.

## Notes on fonts

Body text, titles, and captions all use **Geist** (Google Fonts) at several
weights. The "Fadhil Yassar" signature is a vector graphic
(`assets/wordmark-fadhil-yassar.svg`), not text — swap that file to change it.

## Assets

- `assets/bg-light-off.png` — dim wall, used for intro-1 and intro-2.
- `assets/bg-light-on.png` — warm off-white wall, used for the whole main gallery.
- `assets/bg-maroon.png` — the maroon "about" room wall.
- `assets/self-portrait.jpg` — the small framed photo on the name-reveal piece.
- `assets/nav-arrow-prev.svg` / `nav-arrow-next.svg` — the bottom-center nav
  pill's icons.
- Everything else in `assets/` is a project screenshot or personal photo
  referenced by `data/content.json` — filenames are deliberately descriptive
  (e.g. `wave-web homepage.jpg`) since the lightbox caption is generated
  directly from the filename.

All background/photo assets were resized and compressed for the web already;
if you replace one, keep it under ~2500px on the long edge and export as a
reasonably compressed JPEG to keep the page fast.
