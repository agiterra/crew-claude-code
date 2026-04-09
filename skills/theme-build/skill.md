---
description: Build or complete a pane theme — generate pool names, fetch background images, write theme.json. Run with a background Sonnet agent for best results.
allowed-tools: Agent, Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch
---

# Theme Builder

Build or complete a Crew pane theme. Themes define a name pool and background
images for iTerm2 panes.

## Usage

- `/crew:theme-build trees` — fill missing images for the "trees" theme
- `/crew:theme-build "classic cars"` — create a new theme from scratch

## Modes

### Fill gaps (theme already exists)

1. Load `theme.json` from `~/.wire/themes/<name>/` or `~/.crew/themes/<name>/`
2. List pool names that have no matching image file
3. For each missing name, search Pexels for a suitable image:
   - Query: `"<name> <theme-context> texture background"`
   - Target: warm, medium-dark tones that look good at 50% blend on a dark terminal
   - Resolution: 1920x1080 crop
4. Download via Pexels API: `https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg?auto=compress&cs=tinysrgb&w=1920&h=1080&fit=crop`
5. Save as `<name>.jpg` in the theme directory
6. Update `theme.json` images map with new entries
7. Report what was added

### New theme (no existing theme.json)

1. Parse the topic from `<args>`
2. Generate a pool of 20 names related to the topic
3. Create the theme directory at `~/.wire/themes/<theme-name>/`
4. Write `theme.json` with the pool, default blend (0.5), mode (2)
5. For each name, search Pexels and download a background image
6. Update images map in theme.json
7. Report the complete theme

## Image Selection Guidelines

- **Texture/close-up shots work best** — wood grain, stone surfaces, fabric weaves
- **Avoid images with text, people, or busy scenes** — they distract from terminal content
- **Medium brightness preferred** — not pitch black (invisible at 50% blend), not white (washes out text)
- **Warm tones** — browns, ambers, warm grays look best on dark terminals
- **Consistent style within a theme** — all images should feel like they belong together

## Pexels Download

Pexels allows direct curl downloads with this URL pattern:
```
https://images.pexels.com/photos/{PHOTO_ID}/pexels-photo-{PHOTO_ID}.jpeg?auto=compress&cs=tinysrgb&w=1920&h=1080&fit=crop&q=80
```

To find photo IDs, search Pexels and extract IDs from the page. The WebFetch
tool can parse Pexels search result pages to find photo IDs.

## Important

- Always verify downloaded files are valid JPEGs (`file <path>` should say "JPEG image data")
- Delete and retry if a download produces HTML instead of an image
- After completing, show a summary of pool coverage: N/M names have images
