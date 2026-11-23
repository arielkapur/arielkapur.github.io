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

The site supports keyboards, sensible headings, responsive layouts, reduced-motion settings, meaningful controls, and no autoplay audio. The core content renders without JavaScript. Typography has local fallbacks; fonts are optional Google Fonts requests.

## Deployment note

This repository is named as a GitHub Pages user site. If Pages is configured to deploy from the `main` branch root, **merging the portfolio PR** makes the home page live. A feature branch alone does not publish it. Verify GitHub **Settings → Pages** if deployment does not occur.

## Current limitations

Project art is original **illustrative artwork**, not screenshots of gameplay. OPUS and FUCK / WORLD are prototypes, not finished releases. The Render-hosted world may sleep when idle. SkySynoptic's source-defined macOS build is not evidence of a successfully built, signed or notarised app. External links may change.

## Future enhancements

- Replace illustrative covers or supplement them with actual gameplay videos or screenshots.
- Add a project detail page with technical notes and a changelog for each game.
- Embed selected Bandcamp releases (user-selected, not autoplay).
- Add a lightweight changelog / lab notebook, updated by hand.
- Create an interactive collection of mini-experiments and physics visualisations.
- Add original typographic / audio-reactive art that respects reduced-motion and no-autoplay preferences.

No assets or code are copied from Iglooghost.net.
