# Build Prompt: "Pixel Crusher" — Idle Ball-Merge Web Prototype

You are building a playable **web prototype** of a mobile idle game. Read this whole document before writing any code. Build it in the phases listed at the end, and make sure the game runs without errors after each phase.

---

## 1. Game Summary (read this first)

A portrait-screen idle game. In the middle of the board sits a **pixel-art picture made of plain 3D cubes** (one pixel = one cube). Numbered balls (2, 4, 8, 16, 32 … like 2048) travel through a **pipe that loops around the board**, reach a **dropper ring** at the top, and are **dropped straight down** onto the picture. Each ball hits the **topmost cube** in its column, deals damage equal to its number, earns money, **bounces once, and flies straight back into the pipe inlet** at the bottom-left. From there it rides the pipe up and around to the dropper again. **Balls are never destroyed — they loop forever.**

The picture erodes from the top down. When every cube is destroyed, the picture is complete, there is a celebration, and the next (tougher) picture builds in.

The player spends money on 3 upgrades:
1. **Add Ball** — adds a new "2" ball to the pipe.
2. **Merge** — merges the two lowest equal balls into one ball of double value (2+2 → 4).
3. **Income ×** — increases the money multiplier.

The game is **fully idle** (it plays itself), with an **optional manual aim**: the player can drag to move the dropper and choose where balls fall.

**The #1 priority is game feel.** Every hit, break, purchase and merge must feel punchy and satisfying. A 5-second screen recording of this game should make someone want to play it.

---

## 2. Tech Stack & Project Setup

- **Vite + vanilla JavaScript (ES modules) + Three.js** (install via npm).
- Font: **Fredoka** via `@fontsource/fredoka` (bold, rounded). No CDN links; everything bundled locally.
- **No external image or audio files.** All sound effects are synthesized with the **Web Audio API**. Pixel pictures are defined in code (and optionally loaded from PNG, see §6).
- Target: mobile browsers + desktop. Portrait layout, aspect ratio ~9:16, letterboxed/centered on wide screens. Must run at 60 fps on a mid-range phone.
- Run with `npm install` then `npm run dev`.

### Folder structure
```
/index.html
/src/main.js            – bootstrap, game loop
/src/config.js          – ALL tunable numbers live here (see §10)
/src/state.js           – game state, save/load (localStorage)
/src/scene.js           – Three.js renderer, camera, lights
/src/board.js           – board frame, background, pipe mesh
/src/pipe.js            – pipe path + ball queue movement
/src/balls.js           – ball entities, state machine, visuals
/src/dropper.js         – dropper ring, aim line, auto-aim, manual aim
/src/grid.js            – pixel picture → cube grid, HP, heightmap, damage
/src/images.js          – pixel-art picture definitions
/src/economy.js         – costs, upgrades, money
/src/fx.js              – particles, debris, popups, screen shake, tweens
/src/audio.js           – Web Audio synth SFX + voice limiting
/src/ui.js              – HTML overlay: money, progress bar, buttons
/src/debug.js           – debug panel
/src/style.css
```

---

## 3. Art Style

Reference look: bright, clean, glossy hyper-casual 3D (think modern ball-merge games).

- **Camera:** front-facing, slight perspective (or orthographic with a tiny tilt) so cubes and balls read as 3D but the layout reads as 2D.
- **Board:** a rounded rectangle panel filling most of the screen. Soft background with a subtle repeating pattern (can be a generated canvas texture). **Background color changes per picture** (defined per image) so the picture always contrasts with it.
- **Pipe:** a thick, rounded tube (TubeGeometry along a CatmullRom path), slightly darker than the board, semi-glossy. Path: starts at an **inlet opening at the bottom-left**, runs **up the left side**, turns at the top-left corner, and runs **right along the top** to the dropper ring near the top center/right.
- **Dropper ring:** an orange/gold torus hanging from the top pipe, with a small funnel. It slides horizontally along the top pipe to aim.
- **Aim line:** a dotted white line from the dropper straight down to the landing point on the picture. Dots animate downward (scrolling).
- **Balls:** glossy spheres (MeshStandardMaterial, low roughness, a bit of emissive). Each value has its own color:
  - 2 blue, 4 red-pink, 8 green, 16 orange, 32 brown, 64 purple, 128 teal, 256 yellow, 512 magenta, 1024 black-gold, 2048+ rainbow/animated hue.
  - White bold number (Fredoka) with a dark outline, rendered as a camera-facing sprite from a cached canvas texture (one texture per value).
  - **Ball size grows slightly with level** (e.g. +6% radius per level, capped).
- **Cubes:** **plain boxes** (no bevel needed), colored by the pixel color, MeshStandardMaterial with slight gloss so lighting gives them depth. Render ALL cubes with a single **InstancedMesh** (per-instance color and matrix). Do **not** put a HP number on each cube.
- **Lighting:** one soft directional key light from top-left + ambient/hemisphere light. Optional soft contact shadow under the picture.
- **UI:** big rounded buttons, chunky Fredoka numbers, drop shadows, bright colors. Matches the toy-like 3D style.

---

## 4. Screen Layout (portrait)

```
┌───────────────────────────────┐
│  💰 12.4K        [Image 3/∞]   │  ← top HUD: money (animated counter), picture name
│  [██████████░░░░░] 64%        │  ← picture progress bar
│ ╭───────────────●─────╮        │  ← top pipe with balls queued, dropper ring (●)
│ │               ┆     │        │
│ │               ┆     │        │  ← dotted aim line
│ │            ▓▓▓▓▓▓   │        │
│ │          ▓▓▓▓▓▓▓▓▓▓ │        │  ← pixel picture (cubes), lower-middle of board
│ │          ▓▓▓▓▓▓▓▓▓▓ │        │
│ ●                     │        │  ← left pipe with balls climbing
│ ◖inlet                │        │
│ ╰─────────────────────╯        │
│ [ ADD BALL ] [ MERGE ] [ INCOME×]│ ← 3 upgrade buttons: icon, name, cost, level
└───────────────────────────────┘
```

Top-right small buttons: mute toggle, settings (reset save).

---

## 5. Core Loop & Ball State Machine

Each ball has a `value` (2, 4, 8…) and a `state`:

1. **IN_PIPE** — travels along the pipe path at `pipeSpeed`. Balls queue physically: a ball can never get closer than `ballSpacing` to the ball ahead (they bunch up and touch, like beads). Track each ball by `distanceAlongPath`.
2. **AT_DROPPER** — the front ball waits inside the dropper ring. The dropper releases one ball every `dropInterval` seconds (only if the dropper has arrived at its current aim X; it may release while moving slowly — tune for feel).
3. **FALLING** — falls straight down from the dropper X with accelerating speed (gravity-like easing, `fallGravity`). Stretch the ball vertically while falling (squash & stretch).
4. **HIT** — on reaching the top cube of the column under it (use the **heightmap**, no physics engine): apply damage, spawn hit FX, earn money.
   - If the column is empty, the ball falls to the board floor instead, does a small bounce, deals no damage.
5. **RETURNING** — the ball pops up in a short bounce (squash on impact, then stretch), then flies in a **fast arc (tween, ~0.45s, configurable)** directly into the pipe **inlet** at the bottom-left. Scale-down squish as it enters the inlet.
   - Add a config option `returnMode: 'arc' | 'roll'`. `'roll'` = ball drops to the floor and rolls quickly along a sloped floor into the inlet. Default `'arc'`.
6. Back to **IN_PIPE**, appended to the back of the queue.

**No physics engine.** Everything is deterministic: paths, tweens, and the heightmap.

### Pipe capacity
- The pipe has a max number of balls: `pipeCapacity` (start 16). When the pipe is full, **Add Ball is disabled** and the button shows "FULL — MERGE!". This is what makes merging necessary.
- Balls currently falling/returning count toward capacity.

---

## 6. The Pixel Picture (Grid)

- A picture is a 2D grid of pixels (e.g. 16×16 up to 24×24). Each non-transparent pixel becomes one cube.
- **Gameplay is a 2D grid (columns × rows)** rendered with 3D cubes. Depth = 1 cube.
- **Heightmap:** for each column, store the row index of its topmost remaining cube. Update it whenever a cube breaks (if a column has gaps, the next top is the next cube below).
- **Cube HP:** every cube in a picture has the same max HP: `cubeBaseHP * cubeHPGrowth^(pictureIndex)`.
- **Damage:** a ball deals damage = its value.
- **Splash by ball level** (makes merging visible and satisfying):
  - value 2–4: hits 1 cube.
  - value 8–16: hits the top cube + the top cubes of the left and right neighbor columns (splash damage 50%).
  - value 32–64: 3 columns wide + also damages the cube directly below the top cube (50%).
  - value 128+: 5 columns wide splash (50%, falloff by distance).
  - Put these rules in config as a table so they are easy to tune.
- Overkill damage does NOT carry over (keep it simple).

### Picture definitions (`images.js`)
- Define pictures as string arrays + a palette map, e.g.
  ```js
  { name: "Apple", bg: "#8fd3ff", palette: { r:"#e8373e", d:"#a51f2a", g:"#3fbf4a", b:"#6b3b1f", w:"#ffffff" },
    rows: [ "......bg......", "....rrrrrr....", ... ] }
  ```
- Author **6 original pictures** of generic, universally recognizable subjects, 16×16 to 20×20: Apple, Fish, Heart, Cupcake, Cat face, Rocket. **Do not use any copyrighted or branded characters.**
- Also support loading a PNG from `/public/images/*.png` (read pixels via canvas, alpha < 128 = empty) so more pictures can be added just by dropping in files.
- After the list runs out, loop the pictures with higher HP.

### Picture complete
- Last cube destroyed → short **hit-stop (80ms)** → big shatter of the last cubes → confetti burst → "COMPLETE!" banner with bounce-in → bonus money (`completeBonus × current income`) with a big coin shower flying to the money counter → background color crossfades → next picture **builds in**: cubes drop in from above row by row (bottom row first), each landing with a tiny bounce and a soft tick sound, staggered for a wave effect (~1.2s total).

---

## 7. Aim: Auto + Manual

- **Auto-aim (default, always on when the player isn't touching):** the dropper targets the column whose top cube is highest (ties broken by remaining HP, then random). Re-evaluate after each drop. The dropper **slides smoothly** (spring/lerp) to the target X — never teleports.
- **Manual aim:** when the player presses and drags anywhere on the board, the dropper follows the finger's X (clamped to the picture width, snapped to column centers). While manually aiming, dropped balls get an **aim bonus: ×`aimBonus` damage (default 1.5)** — show a small "×1.5" tag on those balls and make the aim line brighter/golder.
- After the player releases, wait `autoResumeDelay` (2s) and return to auto-aim.
- The aim line always shows exactly where the ball will land (top of the target column). Show a small **landing marker** (glowing circle/crosshair) on that cube.

---

## 8. Economy & Upgrades

**Money earned per hit** = damage actually applied × `incomeMultiplier`.
Show floating "+$X" text from each hit (see juice rules for batching).

Start state: 3 balls of value 2, money 0, picture 1.

| Upgrade | Effect | Starting cost | Cost growth |
|---|---|---|---|
| **Add Ball** | Adds one value-2 ball entering from the pipe inlet | 10 | ×1.28 per purchase |
| **Merge** | Finds the lowest value that has ≥2 balls, merges two of them into one ball of double value | 25 | ×1.35 per purchase |
| **Income ×** | `incomeMultiplier += 0.25` (display as ×1.25, ×1.50…) | 60 | ×1.6 per purchase |

- Merge button is disabled (greyed, shows "NO PAIR") if no two balls share a value.
- Button states: **affordable** (bright, gentle idle pulse/glow), **not affordable** (desaturated, cost in red), **disabled** (grey + reason text).
- Money display uses short format: 999, 1.2K, 45.6K, 3.4M, 1.2B …
- All numbers above live in `config.js`.

### Merge animation (important — it's the key moment)
Merge happens **inside the pipe**: the two chosen balls light up, the rear one slides/zips forward along the pipe into the front one, both squash together, **POP** — a flash ring + small particle burst — and the new ball appears with an overshoot scale (0 → 1.3 → 1.0) and its new color/number. The gap in the queue closes smoothly. If one of the chosen balls is currently falling or returning, prefer balls that are in the pipe; if none are available, queue the merge until they are.

### Add Ball animation
The new "2" ball pops out of the inlet with an overshoot scale and a small "+1" text, then joins the queue.

---

## 9. JUICE, GAME FEEL & SFX (the most important section)

Implement a small tween/easing helper (easeOutBack, easeOutElastic, easeInQuad, easeOutCubic) and a pooled particle system. **Pool everything** (balls' FX, debris, popups) — no allocations in the hot loop.

### 9.1 Ball feel
- Squash & stretch: stretch vertically while falling (by speed), squash on impact (1.3 wide, 0.7 tall for ~80ms), then recover with easeOutElastic.
- Balls in the pipe have a subtle roll (rotate the number sprite slightly / wobble) and bump into each other with a tiny squash when the queue compresses.
- Value ≥ 16: short glowing **trail** while falling and returning (color = ball color). Value ≥ 128: stronger trail + faint sparkle particles.
- Dropper ring: squash down and spring back on each release; a tiny puff at the ring.

### 9.2 Cube hit feel
- **Hit flash:** the hit cube flashes white for ~60ms (instance color lerp).
- **Scale punch:** cube scales to 1.15 then back (easeOutBack, ~120ms). Splash-hit cubes get a smaller punch.
- **Damage state:** the cube darkens progressively as HP drops (lerp toward 55% brightness at 1 HP) and gets a slight random jitter offset when below 30% HP. (Optional: a crack overlay texture drawn via canvas.)
- **Impact particles:** 4–6 tiny cube-colored chips spray upward in a cone at every hit.

### 9.3 Cube break feel
- Cube bursts into **6–10 small debris cubes** (instanced) of the cube's color: random outward velocity + upward kick, gravity, spin, shrink and fade over ~0.6s. Debris can bounce once off the board floor.
- A quick white **shockwave ring** (expanding, fading circle) at the break point.
- Neighbor cubes do a tiny wobble.
- **Combo system:** breaks within `comboWindow` (300ms) of each other increase a combo counter. Show "x5", "x10"… combo text near the picture that pops and shakes; resets after the window.

### 9.4 Money feel
- Floating "+$X" text: pops up with scale overshoot, drifts up, fades. **Batch** hits: if many hits happen in the same area within 100ms, merge them into one bigger popup instead of spawning dozens. Max ~25 popups on screen.
- Every Nth break (or on bigger breaks), a small **coin sprite flies** from the break point to the money counter along a curved path; the counter **bumps** (scale 1.15) when coins arrive.
- The money counter **rolls up** (animated number, not instant jumps).

### 9.5 Screen feel
- **Screen shake:** tiny, only for significant moments: value ≥ 64 ball impacts (very small), merge of ≥ 128 (small), picture complete (medium). Use trauma-based shake with decay. Must never be annoying during normal idle play.
- **Hit-stop:** only on picture complete (80ms). NOT on regular hits.
- Progress bar fills with easing and pulses when crossing 25/50/75%.

### 9.6 UI feel
- Buttons: press → squish down (scale 0.92) + darken; release → overshoot to 1.05 → 1.0.
- On successful purchase: button flashes, cost text pops, a small burst of sparkles from the button.
- On denied purchase: button shakes horizontally + low "nope" sound.
- Affordable buttons have a slow breathing glow so the player's eye is drawn to them.

### 9.7 SFX (Web Audio API, all synthesized)
Build `audio.js` with a small synth: oscillators (sine/triangle/square), filtered noise bursts, ADSR envelopes, and a master gain + compressor. Unlock the AudioContext on the first user tap.

| Event | Sound design |
|---|---|
| Ball release (dropper) | Short soft "pop" — sine blip with fast pitch drop, very quiet |
| Ball hit cube | Short woody "tok" — triangle + tiny noise click. **Pitch depends on ball value** (higher value = lower, heavier thump) with ±5% random pitch |
| Cube break | Crunchy "crack" — filtered noise burst + short triangle blip. **Pitch rises one semitone per combo step** (reset when combo ends), capped at +12 |
| Coin / money | Bright "ding" (two sine partials), rate-limited to max ~8/second |
| Ball enters inlet | Very soft low "thunk" (rate-limited) |
| Add Ball | Bubbly "bloop" rising pitch |
| Merge | Rising whoosh (filtered noise sweep) then a bright two-note chime; chime pitch depends on the new value |
| Purchase success | "Cha-ching" — quick upward arpeggio (3 notes) |
| Purchase denied | Low short buzz (square, low-pass) |
| Combo milestone (x10, x25, x50) | Short sparkly arpeggio |
| Picture complete | Short fanfare arpeggio (major chord up) + sparkle noise |
| Cube build-in (new picture) | Soft ticks, pitch rising row by row |

- **Voice limiting:** max ~12 simultaneous voices; per-sound cooldowns so a flood of hits never becomes noise or clipping. Slightly lower volume when many hits happen at once.
- Mute toggle (saved in localStorage).
- Optional: `navigator.vibrate(10)` on cube break (rate-limited) and a longer pattern on picture complete, behind a setting.

---

## 10. config.js (all tunables in one place)

Include at least: `pipeSpeed, ballSpacing, pipeCapacity, dropInterval, fallGravity, returnDuration, returnMode, bounceHeight, cubeBaseHP, cubeHPGrowth, splashTable, aimBonus, autoResumeDelay, comboWindow, completeBonus, upgrade costs & growth, incomeStep, ballColors, ballSizeGrowth, shake settings, sfx volumes, maxPopups, maxDebris`. Comment every value.

---

## 11. Save / Load

Save to localStorage every 5 seconds and on page hide: money, ball values list, upgrade purchase counts, income multiplier, picture index, the current grid's remaining HP, mute setting. Load on start. Settings button → "Reset progress" with confirm.

(Offline earnings are NOT required for this prototype.)

---

## 12. Debug Panel

Toggle with the `D` key (and a hidden 3-finger tap on mobile):
- +1K / +1M money
- Game speed ×1 / ×3 / ×10
- Skip picture
- Add ball of value X
- Show FPS, ball count, active particles
- Reset save

---

## 13. Performance Rules

- Cubes and debris: `InstancedMesh`. Balls: one shared sphere geometry, materials cached per value.
- Number textures cached per value.
- Object pools for particles, popups, coins, debris.
- No per-frame allocations in the main loop; fixed-size arrays where possible.
- Clamp delta time (max 50ms) so tabbing out doesn't break the simulation.
- Device pixel ratio capped at 2.

---

## 14. Build Order (do these in phases, verify each one runs)

1. **Phase 1 – Scene & loop:** Vite + Three.js setup, board, pipe path + mesh, balls moving through the pipe with queueing, dropper releasing, falling, heightmap hit on a test grid, returning to the inlet. No UI yet. Verify the infinite loop works with 3 balls.
2. **Phase 2 – Grid & pictures:** images.js with the 6 pictures, InstancedMesh cubes, HP, damage, splash table, cube break, heightmap updates, picture complete → next picture.
3. **Phase 3 – Economy & UI:** HUD, money, progress bar, the 3 upgrade buttons with costs/states, merge logic, pipe capacity, save/load.
4. **Phase 4 – Aim:** auto-aim, manual drag aim, aim line, landing marker, aim bonus.
5. **Phase 5 – Juice:** everything in §9.1–9.6.
6. **Phase 6 – SFX:** everything in §9.7.
7. **Phase 7 – Debug panel & polish:** debug panel, tuning pass, check mobile layout (portrait, touch), check performance with 16+ balls of mixed values.

After each phase: run `npm run build` to catch errors, and give me a short list of what to test in the browser.

## 15. Acceptance Checklist

- [ ] Balls loop forever: pipe → dropper → fall → hit → bounce → inlet → pipe.
- [ ] Picture erodes from the top; empty columns are never targeted by auto-aim.
- [ ] Add Ball / Merge / Income× work, costs scale, buttons show correct states, pipe capacity blocks Add.
- [ ] Merge animation happens in the pipe and feels great.
- [ ] Higher balls are bigger, have trails, and hit wider areas.
- [ ] Manual drag aim works on touch and mouse; auto-aim resumes after 2s.
- [ ] Picture complete celebration + build-in of the next picture.
- [ ] All SFX play, never clip or spam, mute works.
- [ ] Progress persists after reload.
- [ ] Smooth 60 fps with a full pipe on a phone browser.
