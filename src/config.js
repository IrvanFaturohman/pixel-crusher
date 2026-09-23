// ============================================================================
//  config.js — EVERY tunable number in Pixel Crusher lives here.
//  World units: the board is ~10 units wide, centred on the origin, facing +Z.
// ============================================================================

export const CONFIG = {
  // ─── Simulation / rendering ──────────────────────────────────────────────
  maxDelta: 0.05, // s — frame delta is clamped to this (tabbing out can't break the sim)
  maxSubstep: 1 / 60, // s — sim runs in substeps no longer than this (keeps ×10 speed stable)
  maxPixelRatio: 2, // cap on devicePixelRatio
  shadows: true, // soft real-time shadows from the key light
  shadowMapSize: 1024, // shadow map resolution (px)
  shadowRadius: 3, // PCF blur radius of the shadow edge
  saveInterval: 5, // s — autosave period (also saves on page hide)

  // ─── Camera & board layout (world units) ────────────────────────────────
  layout: {
    boardWidth: 10, // panel width
    boardHeight: 13.6, // panel height
    boardRadius: 0.8, // rounded-corner radius of the panel
    frameWidth: 0.3, // width of the raised white frame around the panel
    frameDepth: 0.34, // how far the frame sticks out towards the camera
    floorY: -6.0, // top of the floor ledge — pictures stand on it
    ledgeDepth: 1.3, // how far the floor ledge sticks out towards the camera
    picLeft: -2.75, // picture area: left edge (right of the pipe inlet)
    picRight: 4.35, // picture area: right edge (dropper must reach every column)
    picTop: 2.5, // picture area: highest allowed top edge (leaves room to fall)
    maxCell: 0.46, // largest cube size for small pictures
    cubeGap: 0.9, // cube size as a fraction of its cell (gaps make cubes read as 3D)
    patternTile: 1.3, // size of one tile of the background pattern
    cameraFov: 30, // vertical FOV (deg) — low = nearly orthographic
    cameraTilt: 0.08, // rad — camera looks slightly down so cube tops show
    fitMargin: 0.3, // extra world units kept around the board when fitting the camera
  },

  // ─── Pipe ────────────────────────────────────────────────────────────────
  pipe: {
    radius: 0.52, // tube radius (the biggest ball must fit: see ballSizeCap)
    inletX: -3.25, // x of the inlet mouth (bottom-left); mouth faces +X
    leftX: -4.2, // x of the vertical left run
    topY: 5.85, // y of the horizontal top run (dropper rides on it)
    rightX: 4.2, // x where the top run ends (closed cap)
    inletBend: 0.72, // radius of the bend from the inlet into the left run
    cornerRadius: 0.95, // radius of the top-left corner
  },
  pipeSpeed: 10, // world units / s a ball travels along the pipe
  ballSpacing: 0.03, // extra gap kept between neighbouring balls in the pipe (0 = touching)
  pipeCapacity: 16, // max balls in play (falling/returning ones count too)

  // ─── Dropper ────────────────────────────────────────────────────────────
  dropInterval: 0.3, // s between two releases
  dropperStiffness: 300, // spring constant pulling the dropper to its aim X
  dropperDamping: 32, // spring damping (≈ 2·√stiffness = critically damped)
  releaseTolerance: 0.08, // world units — dropper must be this close to its target to release
  releaseMaxSpeed: 3, // world units / s — ...and moving slower than this

  // ─── Falling / returning ────────────────────────────────────────────────
  fallGravity: 42, // world units / s² — falling acceleration
  fallStartSpeed: 1.5, // initial downward speed when released
  maxFallStretch: 0.32, // max vertical stretch while falling (0.32 = 132%)
  fallStretchPerSpeed: 0.022, // stretch added per unit of fall speed
  impactSquash: { x: 1.3, y: 0.7, time: 0.08 }, // squash shape + hold time on impact
  returnMode: 'arc', // 'arc' = fly in an arc into the inlet, 'roll' = drop to floor & roll in
  returnDuration: 0.45, // s — arc flight time back to the inlet
  bounceHeight: 1.3, // extra apex height of the return arc
  arcHeightPerDistance: 0.22, // extra apex height per unit of horizontal distance
  rollAccel: 16, // 'roll' mode: acceleration along the floor towards the inlet
  rollMaxSpeed: 12, // 'roll' mode: top rolling speed
  inletSquish: 0.72, // scale a ball shrinks to as it enters the inlet

  // ─── Balls ──────────────────────────────────────────────────────────────
  ballBaseRadius: 0.3, // radius of a "2" ball
  ballSizeGrowth: 0.06, // +6% radius per level (4 = level 2, 8 = level 3 …)
  ballSizeCap: 1.6, // max radius multiplier (0.3 × 1.6 = 0.48 < pipe radius)
  ballColors: {
    2: '#2f7dff', // blue
    4: '#ff3d6e', // red-pink
    8: '#2fc350', // green
    16: '#ff9412', // orange
    32: '#8f5530', // brown
    64: '#9447ff', // purple
    128: '#0fb5a4', // teal
    256: '#ffc800', // yellow
    512: '#ff2bcc', // magenta
    1024: '#17151a', // black (with a gold number)
  },
  rainbowFrom: 2048, // values ≥ this are rainbow with an animated hue
  rainbowSpeed: 0.35, // hue cycles per second
  trailMinValue: 16, // balls ≥ this leave a glowing trail
  sparkleMinValue: 128, // balls ≥ this leave a stronger trail + sparkles
  trailInterval: 0.018, // s between trail stamps
  labelScale: 1.55, // number sprite size relative to the ball radius

  // ─── Pictures / cubes ───────────────────────────────────────────────────
  cubeBaseHP: 2, // HP of every cube in the first picture
  cubeHPGrowth: 1.7, // HP multiplier per picture index (HP = base · growth^index)
  // Splash rules by ball value. The last row whose minValue ≤ ball value wins.
  //   width   — extra columns hit on EACH side of the target column
  //   splash  — damage fraction dealt to those side columns' top cubes
  //   below   — damage fraction dealt to the cube right under the target cube
  //   falloff — side damage fades linearly with distance (1 → splash, width → splash/width)
  splashTable: [
    { minValue: 2, width: 0, splash: 0, below: 0, falloff: false },
    { minValue: 8, width: 1, splash: 0.5, below: 0, falloff: false },
    { minValue: 32, width: 1, splash: 0.5, below: 0.5, falloff: false },
    { minValue: 128, width: 2, splash: 0.5, below: 0.5, falloff: true },
  ],
  damageDarken: 0.55, // brightness a cube fades to at 1 HP
  jitterBelow: 0.3, // below this HP fraction a cube gets knocked slightly loose
  buildDuration: 1.2, // s — new picture build-in wave (bottom row first)
  buildDropHeight: 2.6, // world units cubes drop from during build-in

  // ─── Aim ────────────────────────────────────────────────────────────────
  aimBonus: 1.5, // damage multiplier for balls dropped while manually aiming
  autoResumeDelay: 2, // s after release before auto-aim takes over again
  aimDotSpacing: 0.3, // world units between dots of the aim line
  aimDotSpeed: 2.2, // world units / s the aim-line dots scroll downwards

  // ─── Economy ────────────────────────────────────────────────────────────
  startMoney: 0, // money on a fresh save
  startBalls: [2, 2, 2], // balls on a fresh save
  upgrades: {
    add: { baseCost: 10, growth: 1.28 }, // Add Ball
    merge: { baseCost: 25, growth: 1.35 }, // Merge
    income: { baseCost: 60, growth: 1.6 }, // Income ×
  },
  incomeStep: 0.25, // income multiplier gained per Income purchase
  completeBonus: 12, // picture bonus = completeBonus × current income per second
  completeBonusMin: 25, // ...but never less than this × income multiplier
  incomeWindow: 8, // s — window used to measure "current income per second"

  // ─── Juice ──────────────────────────────────────────────────────────────
  comboWindow: 0.3, // s — breaks closer than this chain into a combo
  comboShowFrom: 3, // combo text appears from this count
  comboMilestones: [10, 25, 50, 100], // counts that trigger the sparkly arpeggio
  maxPopups: 25, // max floating "+$X" texts at once
  popupBatchTime: 0.1, // s — hits within this time and distance merge into one popup
  popupBatchDist: 55, // px
  coinEveryBreaks: 4, // every Nth cube break sends a coin to the money counter
  coinBigBreakValue: 64, // balls ≥ this send a coin on every break
  maxCoins: 40, // flying coin pool size
  completeCoins: 18, // coins in the picture-complete shower
  maxDebris: 800, // lit debris / chips / confetti instances
  maxGlow: 900, // additive-ish glow sprites (trails, sparkles, rings)
  hitFlashTime: 0.06, // s a hit cube flashes white
  punchTime: 0.12, // s of the cube scale punch
  punchMain: 0.15, // scale punch of the hit cube (1.15)
  punchSplash: 0.07, // scale punch of splash-hit cubes
  debrisLife: 0.6, // s debris lives
  shake: {
    maxOffset: 0.55, // world units at trauma = 1
    maxRoll: 0.018, // rad at trauma = 1
    decay: 1.7, // trauma lost per second
    frequency: 26, // shake noise speed
    impact64: 0.2, // trauma per ≥64 ball impact (very small)
    impactPerLevel: 0.02, // extra trauma per level above 64
    merge128: 0.38, // trauma for a merge producing ≥128 (small)
    complete: 0.72, // trauma on picture complete (medium)
  },
  hitStop: 0.08, // s — freeze on picture complete only

  // ─── Audio ──────────────────────────────────────────────────────────────
  sfx: {
    master: 0.8, // master volume
    maxVoices: 12, // simultaneous voices
    duckPerHit: 0.12, // volume drop per recent hit (stops floods from clipping)
    release: 0.05, // dropper pop
    hit: 0.22, // cube "tok"
    break: 0.2, // cube "crack"
    coin: 0.08, // coin ding
    inlet: 0.08, // ball entering the inlet
    add: 0.16, // add-ball bloop
    merge: 0.15, // merge whoosh + chime
    purchase: 0.09, // cha-ching
    denied: 0.13, // nope buzz
    combo: 0.07, // combo milestone arpeggio
    complete: 0.13, // picture fanfare
    build: 0.045, // build-in ticks
  },
  vibrateDefault: true, // vibration on cube break / picture complete (setting)
};
