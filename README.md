# Cache Meter – brand assets

Images for the README, the GitHub social preview and the plugin icon, with their sources. They live on this branch so that `main` – the plugin the directory scans – holds no image files. The README on `main` links them with absolute URLs to this branch.

## Files

| Path | What it is | Where it is used |
|---|---|---|
| `brand/header.svg` | Animated README header (SMIL, 9-second loop): the cup in the countdown ring drains, turns orange, pings at the marker and refills; the claim fades in | Top of the README |
| `brand/feature-keepwarm.svg`, `feature-cost.svg`, `feature-warn.svg`, `feature-tokens.svg`, `feature-report.svg` | Animated feature banners (SMIL, 9-second loop, 1280×240) used as section dividers: the ring drains and pings (*Keep it*), an answer line types in and a budget bar fills (*See it*), a model switch raises a warning card and a bell (*Before it breaks*), request columns grow and a warm miss shows its cause (*Understand it*), a Markdown report lands on the clipboard (*Share it*) | README sections |
| `brand/header-still.png` | Still of the header (1280×400) | Fallback, slides |
| `brand/icon.svg`, `brand/icon.png` | Plugin icon: coffee cup in the countdown ring (1024×1024, static) | `.claude-plugin/icon.png` on `main` (directory listing) |
| `brand/icon-60.svg`, `brand/icon-60.png` | Alternative icon: "60 MIN" in the ring | Not used |
| `brand/social-preview.svg`, `brand/social-preview.png` | GitHub social preview (1280×640) | Repository settings → Social preview |
| `screenshots/*.png` | Band, overview, Context and Health tabs from a real session, cropped to the mod's own drawing | README |

## Regenerate

```bash
python3 brand/gen-icon.py brand && rsvg-convert -w 1024 -h 1024 brand/icon.svg -o brand/icon.png
python3 brand/gen-header.py brand && rsvg-convert -w 1280 brand/frame-00.svg -o brand/header-still.png && rm brand/frame-*.svg
python3 brand/gen-features.py brand            # --stills also writes still frames to check with rsvg-convert
```

The scripts reproduce the committed SVGs byte for byte. `rsvg-convert` (librsvg) does not run animations and ignores `pathLength`, so lengths in the header are in user units. In an SVG shown as an image on GitHub, web fonts don't load: text uses the viewer's system font (stack: Helvetica Neue, Segoe UI, Roboto, Arial; mono: SF Mono, Menlo, Consolas).

## Look

| Role | Colour |
|---|---|
| Background | radial `#2a2540` → `#17151f` → `#0b0a10` |
| Accent (Claude orange), marker, steam | `#d97757`, light `#ff9a6b` / `#ffb38a`, marker `#ff8a5c` |
| Warm cache (ring) | `#2fbf71` → `#9af2b8`, mod fill `#40c070` |
| Low TTL | `#f0a050` |
| Text | `#f5f5f7`, secondary `#cdd6f4`, muted `#7f849c` |
| Track, ticks | `#2c2b3c`, `#585b70` |

Claim: **Never lose your prompt cache to a coffee break again.** Icons: single-width shapes, no emoji in the drawings. The listing icon stays a static PNG (the directory takes PNG or JPEG only).
