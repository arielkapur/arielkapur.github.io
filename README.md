# ARIEL KAPUR — A PERSONAL INTERNET

The source for my personal GitHub Pages portfolio at **https://arielkapur.github.io/**.

A small digital archive for independent games, music, weather / mathematical software, and experiments. Its visual direction takes inspiration from the *spirit* of idiosyncratic artist websites such as Iglooghost's: dense archive thinking, peculiar objects, an expressive personal voice, and multimedia, with original design, text and illustrations.

## Archive contents

| Project | What it is | Where it lives |
|---|---|---|
| **OPUS** | Browser-based canvas roguelike prototype | [Play](https://arielkapur.github.io/opus/) · [Source](https://github.com/arielkapur/arielkapur.github.io) |
| **FUCK / WORLD 001** | Experimental multiplayer 3D environment | [Play](https://fuck-world.onrender.com/) · [Source](https://github.com/arielkapur/fuck) |
| **SkySynoptic** | NOAA GFS weather map / macOS app packaging in progress | [Source](https://github.com/arielkapur/skynapse) |
| **Ark Neural Net** | Mathematics/computation learning experiment | [Source](https://github.com/arielkapur/ark-neural-net) |
| **Music** | Independent music releases | [Bandcamp](https://arielkapur.bandcamp.com/) |

## How the site works

- The home page lives in **index.html**.
- **portfolio.css** contains the responsive design and all original illustrative card art (CSS / inline SVG in the page).
- **portfolio.js** provides filter tabs, the contrast-mode toggle, and an optional playful signal generator. No build step required.
- **portfolio-icon.svg** is the site favicon.
- **404.html** is the custom missing-page design; **sitemap.xml** works with the existing **robots.txt** to make both public routes discoverable.
- **opus/index.html** preserves the previous home page as a playable OPUS route. OPUS still loads its original **/game.js**, **/style.css** and **/resources/** from the root of the repository. Keep these files in place.
- The original **terraformer_guide.html**, transitions, and other existing resources remain untouched.
- External content is linked, not scraped, imported, or automatically played.

### Local preview

Run from the repository root:

~~~bash
python3 -m http.server 8000
~~~

Then visit http://localhost:8000/ and http://localhost:8000/opus/.

### Updating the portfolio

To change project descriptions, cards, or links, edit **index.html**. Cards use `data-category="games"` or `data-category="systems"` so the category filters work automatically. Update the displayed filter totals if you add cards. Edit the project status only when verified.

### Accessibility and performance

The site supports keyboards, sensible headings, responsive layouts, reduced-motion settings, meaningful controls, and no autoplay audio. The core content renders without JavaScript. Chomsky and the original DeiGrat wordmark use external webfont URLs with system fallbacks; Classique Script subheadings are outlined SVG lettering rather than redistributed font files.

## Deployment note

This repository is named as a GitHub Pages user site. GitHub Pages deploys from `main` / root. Commits to `main` are deployed live through GitHub Actions; inspect the latest **pages build and deployment** run to verify status.

## Current limitations

Project art is original **illustrative artwork**, not screenshots of gameplay. OPUS and F*CK-WORLD are prototypes, not finished releases. The Render-hosted world may sleep when idle. SkySynoptic's source-defined macOS build is not evidence of a successfully built, signed or notarised app. External links may change.

## Future enhancements

- Replace illustrative covers or supplement them with actual gameplay videos or screenshots.
- Add a project detail page with technical notes and a changelog for each game.
- Embed selected Bandcamp releases (user-selected, not autoplay).
- Add a lightweight changelog / lab notebook, updated by hand.
- Create an interactive collection of mini-experiments and physics visualisations.
- Add original typographic / audio-reactive art that respects reduced-motion and no-autoplay preferences.

No assets or code are copied from Iglooghost.net.

## Current design: a constellation (24 November 2026)

- The page has generous margins around a centred 1260px column.
- Neutral backgrounds and text range from #080808 to #efefef (RGB accent colours remain deliberately vivid).
- The main titles use **Chomsky**, by Fredrick Brennan (OFL-1.1), via the maintainer's public distribution.
- The centre-of-page `ariel kapur` wordmark references **DeiGrat**, found in this repository's *first July 2026 stylesheet*, through a historical repository asset. There is a fallback if historical font loading is blocked.
- Three handwritten subheadings use **Classique Script**, embedded as reusable outlined SVG glyphs in `art/classique-subheadings.svg`. No original font binaries were uploaded.
- The header places a small abstract icon between evenly balanced navigation links; there is no top-left name/logo.
- Text echoes the earliest website's “my digital home”, “a constellation”, and “actual wizard trying to talk to rocks”, plus the mathematical-learning note from Ark Neural Net.
- `robots.txt` preserves sitemap indexing and discourages crawler visits to obsolete source dumps.
- The public game label remains **F*CK-WORLD**; source and game URLs are unchanged.

The old site and earlier gothic treatments remain available through Git history. The site is updated directly on `main` for experimental iteration.


## Step 2 — ethereal grayscale
The homepage is grayscale, including inline illustration colors, cards, links, and the favicon. Chomsky is confined to the four top navigation labels. Classique Script is rendered as visible inline outlined headings (my digital home, works, music, about) with accessible text, not an externally loaded SVG fragment. The music area has a Bandcamp release-player slot and a direct artist link. A release-specific official EmbeddedPlayer URL is required to activate playback; no ID is guessed. No autoplay.


## Step 3 — small, centred, unframed
The homepage now has a single narrow column (560px maximum), small text, centred navigation and content, generous blank space, and no borders around cards, sections, or the outer canvas. The large decorative hero creature, project cover panels, ticker and duplicated noticeboard were removed. The four Classique Script headings, Chomsky navigation, grayscale palette, project links, filter controls and Bandcamp link are retained. The not-yet-configured player slot is hidden until a verified embed is provided. The 404 page follows the same visual direction. Game files are unchanged.
