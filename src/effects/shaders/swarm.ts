// The mark condensed out of a drifting swarm. Unlike every other mode, this
// one ignores the line-drawing sequence entirely: it reads a static buffer of
// the COMPLETE segment geometry (packed once at layout rebuild, not the
// per-frame grown heads), and particles are pulled from hashed wander orbits
// onto the mark in pure hash order — chaos condensing, no growth graph.
// Wall-clock drift keeps every particle slightly alive even when settled, so
// progress-scrubbing is deliberately inexact here (like glass's light).
export const SWARM_SHADER = /* wgsl */ `
struct SwU {
  viewport : vec2<f32>,   // [0,1] css px
  count    : f32,         // [2] segments in the static buffer
  pps      : f32,         // [3] particles per segment
  progress : f32,         // [4]
  time     : f32,         // [5] seconds
  size     : f32,         // [6] base radius px
  drift    : f32,         // [7] wander orbit radius px
  jitter   : f32,         // [8] settled ambient jitter px
  extDim   : f32,         // [9] extension brightness
  stagger  : f32,         // [10] arrival spread over the hash ordering
  _pad     : f32,         // [11]
  _pad2    : vec4<f32>,   // [12..15]
};
@group(0) @binding(0) var<uniform> u : SwU;
// stride 10 per FULL segment, css px: from.xy, to.xy, ext, r, g, b, startT, dur
// (startT/dur ride along for future choreography; unused here)
@group(0) @binding(1) var<storage, read> segs : array<f32>;

struct VSOut {
  @builtin(position) pos   : vec4<f32>,
  @location(0)       local : vec2<f32>,   // -1..1 across the disc
  @location(1)       a     : f32,
  @location(2)       col   : vec3<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VSOut {
  var CORNER = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, 1.0),  vec2<f32>(-1.0, 1.0),
  );
  let c = CORNER[vi];
  let seg = ii / u32(u.pps);
  let slot = ii % u32(u.pps);
  let o = seg * 10u;
  let a0 = vec2<f32>(segs[o], segs[o + 1u]);        // full-extent tail
  let b0 = vec2<f32>(segs[o + 2u], segs[o + 3u]);   // full-extent head
  let ext = segs[o + 4u];
  let col = vec3<f32>(segs[o + 5u], segs[o + 6u], segs[o + 7u]);
  // per-particle hashes: keyed on the instance index alone, stable across frames
  let fi = f32(ii);
  let h1 = fract(sin(fi * 12.9898) * 43758.5453);
  let h2 = fract(sin(fi * 78.233) * 43758.5453);
  let h3 = fract(sin(fi * 39.425) * 43758.5453);
  let h4 = fract(sin(fi * 63.726) * 43758.5453);
  let h5 = fract(sin(fi * 9.151) * 43758.5453);
  let t = (f32(slot) + h1) / u.pps;                 // home slot along the segment
  let home = mix(a0, b0, t);
  // wander: hashed anchor + a slow per-particle orbit — never still
  let ph = h1 * 6.28318;
  let anchor = vec2<f32>(h2, h3) * u.viewport;
  let wander = anchor + vec2<f32>(sin(u.time * (0.25 + 0.55 * h4) + ph), cos(u.time * (0.2 + 0.5 * h5) + ph * 1.7)) * u.drift;
  // arrival order is pure hash — unrelated to the draw sequence the other
  // modes follow; driving progress back down releases the swarm again
  let arr = smoothstep(0.0, 1.0, clamp(u.progress * (1.0 + u.stagger) - h4 * u.stagger, 0.0, 1.0));
  // settled particles keep a faint breath of motion
  let micro = vec2<f32>(sin(u.time * (0.9 + h5) + ph), cos(u.time * (0.8 + h2) + ph)) * u.jitter;
  let centre = mix(wander, home + micro, arr);
  let rad = u.size * (0.5 + 0.9 * h5) * mix(0.55, 1.0, arr);
  let p = centre + c * rad;
  var vout: VSOut;
  vout.pos = vec4<f32>(p.x / u.viewport.x * 2.0 - 1.0, 1.0 - p.y / u.viewport.y * 2.0, 0.0, 1.0);
  vout.local = c;
  vout.a = mix(0.18, 1.0, arr) * mix(1.0, u.extDim, ext);
  vout.col = mix(vec3<f32>(0.55), col, arr);        // dim drifter -> the segment's own colour
  return vout;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let fall = pow(max(0.0, 1.0 - dot(in.local, in.local)), 2.0);   // soft disc
  let a = clamp(in.a * fall, 0.0, 1.0);
  return vec4<f32>(in.col * a, a); // premultiplied
}
`;

export const SWARM_PER_SEG = 30;
export const SWARM_SIZE = 2.4; // base sprite radius, px
export const SWARM_DRIFT = 46; // wander orbit radius, px
export const SWARM_JITTER = 2.5; // settled ambient jitter, px
export const SWARM_STAGGER = 0.7; // arrival spread over the hash ordering
