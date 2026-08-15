# The effects engine, from the inside

Distilled reference for `src/effects/` internals — the facts you need before driving the
engine from a page or writing a new preset. Function and variable names are stable
anchors; line numbers are deliberately omitted (they rot). CLAUDE.md holds the short
"will bite" list; this file is the why behind it.

Everything below describes `effect.ts` (WebGPU). `effect-gl.ts` (WebGL2) implements the
same handle, state machine, timeline and choreography — see **Second backend** at the
end for what it shares, what it duplicates and what it leaves out.

## Handle and lifecycle

`createMinaEffect(canvas, presetName = 'default', withGui = true, withKeys = true)`
resolves to a `MinaEffect`:

- `params: LiveParams` — the live parameter object the render loop re-reads **every
  frame**. Mutating or GSAP-tweening it is the entire animation API. Exception:
  geometry params (`logoScale/X/Y`, `density`, `stagger`, `maxRays`) only apply via a
  layout rebuild (`cellsDirty`, module-private — the GUI sets it; direct mutation
  doesn't).
- `play()` / `move()` — restart the reveal / start the dock. `firstFrame` — resolves
  once the shard layer has painted two frames (needs a texture + layout; a 6 s safety
  timer backstops failures). `destroy()` — mandatory (StrictMode double-mounts);
  removes listeners, destroys GUI/choreo/device, and settles `firstFrame`.
- `onPlay`/`onMove` are **claimed by preset tweens** (choreo rebinding overwrites
  them); pages listen on `onPhase('play' | 'move' | 'docked' | 'lost')`.
- `'lost'` is the GPU going away underneath a running engine (`device.lost` /
  `webglcontextlost`). The engine has already stopped its own rAF and settled
  `firstFrame` by the time it fires — it is a **handoff, not a warning**. Because
  `firstFrame` resolves two frames in, the preroll cover is long gone, so a page that
  ignores `'lost'` shows a permanently frozen intro. `/effects` answers by running its
  static fallback; a page with nothing to fall back to should at least stop waiting.
- `withKeys` gates the global R/M/H keydown listener (R → `play()`, M → `doMove()`,
  H → GUI toggle). Pass `false` on any page where a stray keystroke must not restart
  or dock the mark (`/loop` does).

## State machine

State lives in module locals: `playing` (progress clock on), `started` (autoplay
latched), `mode: 'main' | 'move'`, `curPos` (0 = primary placement, 1 = docked),
`bare` (post-dock: logo only, no extensions), `autoMoved`, `energySmooth`.

- **play**: `play()` resets to `mode 'main'`, `progress 0`, `playing true`, fires
  `onPlay` + `onPhase('play')`.
- **move**: `doMove()` builds a `MovePlan`, enters `mode 'move'`; the reveal clock
  keeps running underneath. Auto-entry (`autoMove`) requires `started`, which only the
  autoplay branch sets — so `autoplay: false` alone already blocks auto-docking.
- **docked**: `commitMove()` flips `curPos`, sets `bare = true` (extensions gone for
  good, palette colour-flow on), rebuilds layout, fires `onPhase('docked')`.

## Derived timeline

One master scalar, `params.progress` (0..1 across the whole `duration` seconds):

```
texUnits  = whiteDur + colorDur + texDur          // in "growth units", growth = 1
nrm       = 1 / (1 + texUnits + hold)
growSpan  = nrm                                    // line draw occupies p ∈ [0, growSpan]
handoffAt = (1 + texUnits) * nrm                   // last shard fully textured
mosaicA   = 1 - clamp01((p - handoffAt) / holdSpan) // shard-layer fade
```

"Fast draw, slow reveal" is tuned by weighting the reveal stages, not by `duration`.
Zeroed reveal durations are tolerated (every divisor is `max(x, 1e-4)` in WGSL and
JS): all four at 0 gives `growSpan = 1` — progress 0↔1 **is** the draw — but then
`mosaicA` pins at 1, so the shard layer never fades. Keep `duration > 0` (unguarded
divisor in the progress clock).

## Progress is pure — and reversible

Every visual is a stateless clamp of `p`: segment heads (`u = (q - startT)/dur`,
head = lerp), the trail `motion` term, dot radii, the mosaic resolve. Driving `p`
**backwards** retracts everything cleanly; the trail re-lights during retraction. To
own the clock from a page: `autoplay: false`, never call `play()`, tween
`effect.params.progress` yourself (layout normalises segments so the draw completes
exactly at `p = growSpan`). The only stateful term is `energySmooth` (bloom), a
harmless low-pass.

## Bloom and glow

`glow*` params are stacked line-pass halos; `bloom*` is the post-chain (scene →
half-res separable gaussian → additive composite; no bright-pass threshold).
Per-frame strength:

```
energy   = low-passed mean line motion (tau BLOOM_ENERGY_TAU = 0.95 s)
strength = bloom * (bloomIdle + (1 - bloomIdle) * energy)
```

`bloomIdle > 1` **inverts** the relationship — brightest when the mark settles
(ephemeral's 2.49 makes a hold at full draw swell on its own). `bloom ≤ 0.01` skips
the blur passes; `glow ≤ 0.01` skips the glow draws. All bloom/glow/width/trail/dot
params re-upload every frame — freely tweenable.

## Shards can be forced black

There is **no flag to skip the mosaic pass** (and `firstFrame` depends on its
geometry existing), but `whiteLevel: 0` (flash → black) + `colorBoost: 0` (solid →
black) + `veil: 1` (texture never unveiled) render every shard pure black at every
stage — an invisible backdrop over a black page. This is how a no-reveal page works.

## Choreo (preset tweens)

`bindPresetTweens` installs `onPlay`/`onMove` handlers that fire one-shot `gsap.to`
calls (no repeat/yoyo in `TweenSpec` — looping choreography must be page-owned).
Both handlers and `dispose()` call `gsap.killTweensOf(params)` on the **whole**
params object — any page-owned tween dies on replay. A preset with **no tweens**
disposes at bind time: `onPlay`/`onMove` stay unbound and nothing kills page tweens
mid-flight (only `destroy()` does, as a correct backstop). Default play-tween window
is the resolve sweep (growEnd → handoff, in seconds); move-tween window is `moveDur`.

## Texture is structurally required

No `TextureSource` → no layout → nothing draws and `firstFrame` waits for the safety
timer. Segment/shard colours are sampled from it at build time (`accentColor`: hue
kept, brightness lifted; near-black falls back to the configured line colour /
white). Load failures self-heal to `fallbackTexture` (dark gradient + wordmark).
`artSide()` in `texture.ts` and `--art-side` in `Effects.module.css` are the same
formula and MUST stay in sync (the /effects handoff contract).

## Loop recipe (what /loop does)

Preset: spread `ephemeral.config` + `autoplay/autoMove: false`, reveal durations 0,
`whiteLevel/colorBoost: 0`, `veil: 1`, dots retimed for `growSpan = 1`, **no
tweens**. Page: `createMinaEffect(canvas, 'loop', SHOW_GUI, false)` (keys off — R
would hand the clock back to the engine, M would dock permanently), then a GSAP
timeline yoyos `params.progress` 0↔1 with a peak hold (bloom swells via
`bloomIdle > 1`) and repeats forever.

## Determinism

`buildLayout` is fully deterministic (`hash(n) = fract(sin(n) * 43758.5453)` over
fixed indices, no seed input) — every run and every loop cycle is pixel-identical.
Varying cycles would need an engine change (seed or a public rebuild trigger).

## Second backend (`effect-gl.ts`)

`createMinaEffectGL(canvas, preset?, withGui?, withKeys?)` returns the same `MinaEffect`.
`effects.tsx` picks it when `requestAdapter()` comes back empty — probing **before**
importing either module, since a canvas holds exactly one context type.

**Shared**: `layout.ts`, `texture.ts`, `presets/`, `choreo.ts`, `config.ts`, `gui.ts`,
`mark.ts` — geometry, colour sampling, the growth graph, the move plan, the declarative
tweens — plus `frame.ts`, which owns the per-frame math that decides what the frame
looks like: `deriveTimeline`, the `SegWriter` and the two segment builders, the line and
glow uniform blocks, the bloom energy low-pass. That is the layer to retune; both
backends follow it for free, and `choreo.ts` reads the same `deriveTimeline` for its
default tween window rather than restating the formula.

**Still written twice, on purpose**: the state machine (play / move / dock), the mosaic
and dot uniform values, and every line of pass encoding and resource lifetime. This is a
second backend, not an abstraction, because `record:loop` pins the WebGPU path to
byte-identical output and folding the GPU plumbing together would put that guarantee at
the mercy of GL-driven refactors. The standing obligation is narrower than it was but
still real: **change the state machine or the dot clocks in one and change them in the
other**. The same holds for `shaders/*.ts` ↔ `shaders/gl.ts`. Stripping comments and
diffing the two `frame()` bodies should reduce to API calls plus the WebGPU-only
shader-mode blocks — anything else in that diff is drift.

**Not implemented**: the /loop shader modes (`liquid`/`ripples`/`neon`/`shatter`/
`glass`/`particles`/`swarm`/`ink`). They need storage buffers, which WebGL2 has no
equivalent for, and nothing outside `/loop` uses them — `params.shaderMode` is pinned to
`'lines'` and `clearInk()` is a no-op. Bloom runs in `RGBA16F` when
`EXT_color_buffer_float` (or `_half_float`) is present and `RGBA8` otherwise, where it
clips instead of blooming past white.
