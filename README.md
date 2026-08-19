# August roadmap for site development

## Changes to implement to Solar System project version 190826

### Menus (on planet selection)
- Troubleshoot menus not showing up sometimes
- Fix pronunciations in menus - 'MAHRZ' to  (/mɑːrz/) *or* (/mɑːz/)
- Info box redesign - discrete boxes with padding on all sides filling 50% of screen

### WebGL camera movement & controls changes
- Hit spacebar to play / pause orbit animation

- Focusing on planet causes:
1. info box to pop up on right side of screen, and bottom side for mobile
2. camera to center on planet
3. planet to center on 1/4 from left of screen, 1/4 from top for mobile
4. planet to center on 1/2 from top of screen, 1/2 from left for mobile

### Mobile compatability changes
- Enable zoom controls for mobile - two fingers for camera zoom, one finger for camera pan

#### And add small UI changes, font customisaitons, redesign

## New project: Projector

Concept: AI-based project planner. Initial UI like ChatGPT - rounded text box centered on screen, small logo on top
background color #f9f9f9, greytext in text box has variable text e.g. "I want to build a time machine...*

#### Example prompt: 
##### I want to build a space probe.

After the user enters this prompt, a few components should show up.

First, a budget variable should be preset based on context memory & scale of project.

Changing the budget slider should alter the following components.

Resource list - list of raw materials and raw material prices for the project. Each resource should be confined to a small rectangular text box with a small image representing it, a header in the middle, a price, then a brief info or description detailing a) use within project context and b) acquisition hurdles.

Legislative hurdles - to launch a space probe, there are probably some conflicts with aerospace restrictions. There may also be components that are impossible, difficult or illegal to obtain given the user's location. The A.I. needs to be compliant to legal restrictions and designed to account for the legal ramificaitons of the project.
