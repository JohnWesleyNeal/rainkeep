# Rainkeep

A small browser landscape puzzle inspired by the water-and-terrain puzzle games of the 1990s. Original name, art, sound, and implementation; no original game assets.

Build banks and enclose lakes, then evaporate connected water for points and drain relief. Water flows across a 32 × 32 terrain grid. Edges and bomb holes fill the drain; at 100%, the run ends.

- **Classic (default):** a flat, dry board and twelve opening Uppers let you build your own enclosures before Water arrives. Pieces visibly descend while you steer and rotate. Ten levels increase the speed every two minutes; ambient rain begins after the opening.
- **Daydream:** practice with a demonstration lake and pieces that wait for Drop. Water still flows and can overflow.
- **Placement:** continuously align pieces without snapping or an exact landing grid. Terrain edits integrate partial overlaps: a poorly aligned seam can leave a lower bank that leaks sooner. Long banks, corners, rings, and smaller shapes share this placement system. The fluid simulation still uses 32 × 32 samples beneath the continuous controls.
- **Touch:** slide anywhere on the board to steer relatively. Lifting and re-touching preserves your aim, including fractional offsets. Rotation and the next piece arriving retain the target center, subject to the board boundary. Arrow buttons trim by 0.2 of a terrain sample; holding repeats. A second thumb can Rotate or Drop while the first keeps steering.
- **Art and view:** a lit 3D floating island with an irregular rock underside, hanging roots, quiet sage ground, earth-colored bank slopes, and painted distant sky. Upper/Downer pieces use clean solid silhouettes. Bombs have metal shells, brass fittings, curved fuses, and sparks; fireballs have a round glowing core and asymmetric trailing flames. Water arrives in formations of transparent bubbles with visible fill levels and internal sloshing. Reflective water, modeled ducks, ice, mines, rainbow, falling leaks, and landing effects share the scene. Turns animate around the piece center; terrain grows after contact. Previews show the same models. A soft footprint follows ground and water while clipping out over holes. Turn view cycles through four camera angles; steering follows the visible board. The [art notes and generated-image prompts](ART.md) document the assets.
- **Feedback and sound:** water wobbles and splashes; fire sheds embers and turns an evaporated lake into steam; bombs tumble and burst into debris and smoke. Landings have distinct original sounds, with repair notes and a scored-evaporation flourish. The music-note button enables sound and retains your preference. Muting and pausing cut active cues. Reduced-motion mode skips the additional movement and bursts.
- **Drop:** accelerates the current piece to its landing point, with a short visible descent. The committed landing position locks until impact.
- **Desktop:** point to steer, R to rotate, Space to drop faster; arrows move a fine step, Shift + arrows a larger step. Escape pauses/resumes.
- Runs, personal bests per mode, and sound preference save on this browser. Leaving the tab pauses. Start Fresh requires a separate screen before replacing a run.
- Offline service worker and home-screen manifest. No accounts, analytics, or remote saves.

## Develop

Node.js 24 recommended.

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

## Publish

The GitHub Actions workflow tests, builds, and publishes `dist` to GitHub Pages on pushes to `main`. Configure the repository's Pages source as GitHub Actions. Vite uses relative asset paths, so the project works beneath a repository URL.

## Rules and strategy

- **Upper:** raises each sample, or repairs a whole connected puncture when it touches a hole. Excess land increases earthquake pressure.
- **Downer:** lowers covered land toward the lowest ground it touches, in proportion to coverage. Flat land stays flat. Covered water disappears without points or drain relief; partial coverage retains some water. Touching a hole expands it.
- **Water:** one-, three-, or five-bubble formations release different amounts of flowing water at their displayed locations. Visible fill levels determine how much each bubble releases; deeper lake water appears darker blue. Old saved Water pieces retain their original single-bubble amount. Closed banks hold it; gaps, edges, and holes leak. The small map shows current escape points in red and holes in dark ink.
- **Fireball:** evaporates the connected lake it lands in, awards points, and lowers the drain. Dry fire flattens land without punching through the board. Fire thaws frozen lakes without evaporating them; a lake containing a mine detonates instead.
- **Bomb:** punches a leaking hole regardless of terrain height. The opening cuts through the island with a broken warm rim, lit inner walls, and sky visible beneath; an Upper closes it again. Landing in an existing hole triggers three falling re-bombs. Active cascades are capped for playability.
- **Bonuses:** separate lakes multiply scores, deep lakes gain ducks, and enough liquid water produces a ×10 rainbow. The visible combined multiplier also includes the level. Frozen water does not count toward ducks or rainbows.
- **Events:** too much land triggers an earthquake. Ice begins at level 2 and freezes a lake temporarily; catching it on dry land earns a bonus. Mines begin at level 4 and expire unless frozen. Five lakes at level-up earn a Smart bomb, which clears the board and drain while retaining the score.

The simulation uses conservative water flux and piece descent at 30 Hz. Rendering uses Three.js WebGL 2, a 1.65× pixel-ratio cap, shared/instanced geometry, and a compressed local sky image. Ground coloring is procedural to keep heights readable. Reduced-motion mode removes the turning and terrain-growth transitions and token flicker. A simpler Canvas 2D fallback retains the same continuous gameplay on devices without WebGL; `?graphics=canvas` selects it explicitly. Losing the graphics context pauses and saves a run. There are no remote fonts, external asset requests, or analytics.

Runs preserve altitude, holes, frozen water, hazards, and mines. Original prototype saves expand geometrically to the finer simulation grid; edition 03 saves retain their existing arrays. Both migrate to version 3 while retaining score, aim, queue, water, and drain. New saves retain fractional aim. Continuing an older run retains its original board; choose a fresh Classic run to experience the dry opening.

The [Wetrix N64 manual](https://nintendo64.pl/wp-content/uploads/Wetrix-EU-uncomplet.pdf), printed pages 9–11 and 18–23, informed the opening, terrain rules, fire/drain relationship, hazards, and multipliers. Continuous alignment is an adaptation; the original analog placement resolution and terrain-edit math have not been measured. Piece proportions, scoring values, event timing, water physics, and quake damage are independently tuned. Pro/mystery pieces, lessons, challenge/handicap modes, camera zoom, and multiplayer are not implemented.

Phone-sized browser checks verify layout and emulated touch; physical phone performance and subjective control feel require a hands-on check.
