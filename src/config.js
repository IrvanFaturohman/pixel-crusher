// ============================================================================
//  config.js — EVERY tunable number in Pixel Crusher lives here.
//  World units: the board is ~10 units wide, centred on the origin, facing +Z.
// ============================================================================

export const CONFIG = {
  // ─── Simulation / rendering ──────────────────────────────────────────────
  maxDelta: 0.05, // s — frame delta is clamped to this (tabbing out can't break the sim)
  maxSubstep: 1 / 120, // s — sim runs in substeps no longer than this (stable physics, ×10 speed)
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
    floorY: -6.0, // height of the sloped floor at the inlet mouth (its lowest point)
    rampSlope: 0.17, // floor rises this much per unit to the right, so balls roll into the inlet
    rampDepth: 1.1, // how far the floor ramp sticks out towards the camera
    picCenterX: 0.62, // picture floats centred here, leaving open lanes on both sides…
    picCenterY: -0.2, // …and room underneath for balls to fall to the floor
    picMaxW: 5.2, // max picture width (world units)
    picMaxH: 5.2, // max picture height
    maxCell: 0.34, // largest cube size for small pictures
    cubeGap: 0.9, // cube size as a fraction of its cell (gaps make cubes read as 3D)
    patternTile: 1.3, // size of one tile of the background pattern
    cameraFov: 30, // vertical FOV (deg) — low = nearly orthographic
    cameraTilt: 0.08, // rad — camera looks slightly down so cube tops show
    fitMargin: 0.3, // extra world units kept around the board when fitting the camera
  },

  // ─── Pipe ────────────────────────────────────────────────────────────────
  pipe: {
    radius: 0.42, // tube radius (the biggest ball must fit: see ballSizeCap)
    inletX: -3.38, // x of the inlet mouth (bottom-left); mouth faces +X, the floor ends here
    leftX: -4.2, // x of the vertical left run (its inner edge is the left wall)
    topY: 5.85, // y of the horizontal top run (dropper rides on it)
    rightX: 0.62, // x where the top run ends — the fixed launcher sits here (above the picture centre)
    inletBend: 0.62, // radius of the bend from the inlet into the left run
    cornerRadius: 0.95, // radius of the top-left corner
  },
  pipeSpeed: 10, // world units / s a ball travels along the pipe
  ballSpacing: 0.03, // extra gap kept between neighbouring balls in the pipe (0 = touching)
  pipeCapacity: 16, // max balls in play (falling/returning ones count too)

  // ─── Launcher (fixed; manual: hold to shoot, drag to tilt the aim) ───────
  dropInterval: 0.28, // s between two shots while holding
  launchSpeed: 9, // world units / s a ball leaves the barrel with
  maxAimAngle: 1.36, // rad — barrel tilts at most this far from straight down (~78°)
  aimSmoothing: 26, // how fast the barrel turns towards the finger (1/s)
  barrelLength: 0.62, // barrel length below the ring
  releaseCatchUp: 0.05, // world units — head ball must be this close to the launcher to shoot
  hintIdle: 6, // s without input before the "hold to shoot" hint shows again

  // ─── Ball physics (2D, no engine) ───────────────────────────────────────
  physics: {
    gravity: 24, // world units / s²
    maxSpeed: 14, // speed cap (keeps substeps tunnel-free)
    cubeRestitution: 0.6, // bounciness off cubes
    cubeRound: 0.22, // cube corner rounding (fraction of a cell) — seams deflect balls
    breakRestitution: 0.4, // bounciness when the hit breaks the cube
    wallRestitution: 0.6, // bounciness off the side walls / ceiling
    floorRestitution: 0.25, // bounciness off the floor ramp (low = rolls)
    ballRestitution: 0.7, // bounciness between balls
    friction: 0.08, // tangential speed lost per hard impact (scaled by impact speed)
    bounceJitter: 1.3, // random sideways kick on cube bounces (natural scatter)
    minImpactSpeed: 1.0, // slower touches deal no damage (resting contact)
    hitCooldown: 0.05, // s between two damaging hits of the same ball
    stuckRadius: 0.5, // a ball that stays within this distance off the floor…
    slowSpeed: 1.3, // …or dawdles slower than this on average (smoothed)…
    stuckTime: 0.8, // …for this long gets kicked towards a lane
    nudgeSpeed: 2.2, // sideways speed of that kick (it also hops the ball upwards)
    maxAirTime: 12, // failsafe: a ball in play longer than this falls through the cubes
    squashTime: 0.28, // s of the squash wobble after a bounce
    maxSquash: 0.3, // max squash amount on a hard bounce
  },
  inletSquish: 0.72, // scale a ball shrinks to as it enters the inlet

  // ─── Balls ──────────────────────────────────────────────────────────────
  ballBaseRadius: 0.24, // radius of a "2" ball
  ballSizeGrowth: 0.06, // +6% radius per level (4 = level 2, 8 = level 3 …)
  ballSizeCap: 1.55, // max radius multiplier (0.24 × 1.55 = 0.37 < pipe radius)
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
  cubeBaseHP: 4, // HP of every cube in the first picture (a "2" ball needs 2 bounces)
  cubeHPGrowth: 1.7, // HP multiplier per picture index (HP = base · growth^index)
  // Splash rules by ball value, applied on EVERY damaging bounce. The last row
  // whose minValue ≤ ball value wins. Directions follow the hit: a hit on a top
  // face spreads sideways, a hit on a side face spreads up/down.
  //   width   — extra cubes hit on EACH side of the hit cube (across the hit face)
  //   splash  — damage fraction dealt to those cubes
  //   below   — damage fraction dealt to the cube behind the hit cube
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

  // ─── Aim line ───────────────────────────────────────────────────────────
  aimDotSpacing: 0.3, // world units between dots of the aim arc
  aimDotSpeed: 1.4, // world units / s the aim-arc dots flow along the path
  aimDotSize: 0.075, // radius of an aim dot
  aimMaxTime: 1.8, // s of flight the aim arc predicts (stops at the first hit)

  // ─── Economy ────────────────────────────────────────────────────────────
  startMoney: 0, // money on a fresh save
  startBalls: [2], // balls on a fresh save
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
