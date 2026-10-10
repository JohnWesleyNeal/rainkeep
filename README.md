# Rainkeep

A cozy, skillful water-and-terrain puzzle for phones and desktop. Shape banks, catch water, and evaporate connected lakes for points and drain relief. Original name, artwork, sound, and implementation, inspired by the landscape puzzles of the 1990s.

## Play your way

- **Island journey:** all sixteen islands are available immediately. First Pond is the recommended beginning; Home teaches the rules, Meadow adds showers, and Practice Coves offer advanced challenges. The suggested route and medals guide exploration without locks.
- **Classic:** a dry board with falling pieces. Six opening Uppers introduce a long bank, corner, and ring, followed by two Water pieces and Fire. Later levels add ice and mines.
- **Daydream:** a starter lake and pieces that wait for Drop. The opening is Water, Fire, Upper, Downer, Water, Fire. Water still flows and mistakes still matter.
- **New free-play queues:** three actual upcoming pieces, independent piece/hazard randomness, no consecutive Bombs, and at most six consecutive non-Fire pieces after the scripted opening.
- **Every drop is committed:** no undo or snapping. Restart from the result controls or choose a fresh landscape from Pause. Selecting a mode or island does not replace the active run until Play is pressed.

## Read the island

The phone layout gives priority to the goal, drain, land pressure, island, current piece, and upcoming queue. Short screens hide secondary score information during campaign play. Instructions remain 14 px and primary touch targets are at least 44 px.

A bright landing ghost shows affected ground and projected terrain height. Fire highlights its connected lake and distinguishes evaporation, thawing, mine detonation, and dry ground. The caption explains immediate consequences and earthquake risk. Previews use the actual landing rules on an isolated state copy; they do not forecast future flowing water. Lake depth colors, physical waterlines, warm weak-bank warnings, and cascades reveal water behavior.

First Pond shows actual build → fill → evaporate progress. Other islands show goal counters and their special constraints. Stages with a lower drain limit mark that threshold. Contextual notes are available throughout the journey; the optional rule demonstration appears where screen space allows. Help provides the complete field guide.

Success and failure keep the island visible. Results explain the outcome, show medal requirements, and offer Replay/Retry, Next, and island browsing. Evaporation feedback includes the actual score, relevant multipliers, and actual drain reduction.

## Controls

- **Touch:** slide anywhere on the board to steer relatively. Lift and re-touch without losing the aim. A second thumb can Rotate or Drop. Fine adjust opens four small-step controls.
- **Mouse:** point at the board to aim.
- **Keyboard:** arrows move by 0.2 samples; Shift + arrows move by one sample. R rotates; Space drops; Escape pauses or resumes. Buttons also work through normal keyboard focus.
- **View:** cycles four camera angles. Touch uses the renderer's camera transform, including the steeper portrait view. Resizing during a drag preserves the grip.

## Rules

**Upper** raises land or repairs an entire connected opening. **Downer** lowers covered land toward the lowest point it touches; it removes covered water without scoring and widens holes. Partial overlaps can leave weak seams.

**Water** flows downhill across a 32 × 32 field. Its bubble formation and visible fill levels determine the released amount. Edges and holes fill the drain; a full drain ends the run. **Fire** evaporates a connected liquid lake for points and drain relief, thaws ice first, detonates an active mine, or flattens dry ground. **Bombs** punch holes; hitting an existing hole produces a bounded cascade.

Separate lakes, deep-water ducks, level, and a rainbow multiply scores. Excess land and isolated tall peaks create earthquake pressure. Downers can reduce it. After a quake, rebuild damaged ground and hold a contained liquid lake for two seconds within 45 seconds to earn a recovery bonus. Five lakes at a Classic level-up earn a Smart bomb.

Meadow weather normally cycles through clear preparation, eight seconds of gathering clouds, a twelve-second shower, clearing skies, and sunshine. Keep a contained liquid lake until the shower ends, then use Fire for post-shower goals. **Bring rain** skips dry waiting time in untimed Meadow stages while retaining the warning and complete shower. It cannot skip active rain, create a kept shower, advance hazards, or change the piece queue. Falling stages and Classic retain automatic weather.

## Saves and compatibility

Runs, medals, best scores, sound, and guide preferences save in this browser. No accounts, analytics, or remote saves. Leaving the tab pauses; graphics loss pauses and saves. The offline service worker and home-screen manifest support installed/offline play.

Fresh free-play runs use version 4 saves with a persisted upcoming queue and its own generator state. Earlier runs continue with their original rules and one truthful upcoming piece. Version 1/2 terrain migration remains supported. Historical best scores stay in their existing key and are displayed in Pause alongside new-rule records. Campaign stage identities and all existing medals are preserved.

WebGL renders the miniature island, terrain, water, ducks, weather and feedback. `?graphics=canvas` selects the simpler Canvas fallback. Reduced motion removes extra animation. All imagery and sound are local; procedural audio respects pause and mute. [Art notes](ART.md) and [validation history](VALIDATION.md) describe the implementation.

## Develop and validate

Node.js 24 recommended.

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

The browser suite uses an isolated Chrome profile and starts its own Vite server on port 5175:

```sh
npm run test:browser
npm run test:browser -- --production
```

Build first for the production suite. If Chrome is unavailable, install Chromium with `npx playwright install chromium` and set `RAINKEEP_BROWSER_CHANNEL=chromium`. Screenshots and JSON reports are written to ignored `output/playwright/rework/`. Browser checks cover real controls, all island layouts, saves, fallback, graphics recovery, and production offline reload. Physical-phone frame rate, thumb comfort, and subjective audio/placement feel still require hands-on acceptance.

GitHub Actions tests, builds, checks the compiled browser game, and publishes `dist` to GitHub Pages on pushes to `main`. Relative asset paths support repository subpaths.
