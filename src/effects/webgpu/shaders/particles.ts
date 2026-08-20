// The mark as a constellation: soft-disc sprites scattered along the grown
// segments, heads spraying sparks while they move. Stateless on purpose —
// every particle's position, size and alpha is a pure function of the segment
// endpoints and an instance hash, no wall-time terms, so the breath scrubs
// backwards as cleanly as forwards.
export const PARTICLE_SHADER = /* wgsl */ `
struct PU {
  viewport : vec2<f32>,   // [0,1] CSS px
  pps      : f32,         // [2] particles per segment
  size     : f32,         // [3] base radius px
  progress : f32,         // [4]
  energy   : f32,         // [5] low-passed motion energy 0..1
  extDim   : f32,         // [6] extension brightness
  _pad     : f32,         // [7]
  _pad2    : vec4<f32>,   // [8..11]
};
@group(0) @binding(0) var<uniform> u : PU;
@group(0) @binding(1) var<storage, read> segs : array<f32>;   // stride 10: tail, head, aMul, motion, rgb, ext

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
  let a = vec2<f32>(segs[o], segs[o + 1u]);        // tail
  let b = vec2<f32>(segs[o + 2u], segs[o + 3u]);   // head
  let aMul = segs[o + 4u];
  let motion = segs[o + 5u];
  let col = vec3<f32>(segs[o + 6u], segs[o + 7u], segs[o + 8u]);
  let ext = segs[o + 9u];
  // per-particle hashes: keyed on the instance index alone, stable across frames
  let h1 = fract(sin(f32(ii) * 12.9898) * 43758.5453);
  let h2 = fract(sin(f32(ii) * 78.233) * 43758.5453);
  let h3 = fract(sin(f32(ii) * 39.425) * 43758.5453);
  let t = (f32(slot) + h1) / u.pps;   // 0 tail -> 1 head; order is meaningful
  let span = b - a;
  let len = length(span);
  let d = span / max(len, 1e-4);
  let n = vec2<f32>(-d.y, d.x);
  // heads spray sparks while the segment is still moving: scattered wider,
  // bigger, brighter — all of it collapsing back as motion settles to 0
  let spark = motion * smoothstep(0.7, 1.0, t);
  let centre = mix(a, b, t) + n * (h2 - 0.5) * (2.0 + 8.0 * spark);
  var rad = u.size * (0.6 + 0.8 * h3) * (1.0 + 2.0 * spark);
  if (len < 0.5) { rad = 0.0; }   // degenerate segment: collapse the quad
  let p = centre + c * rad;
  var vout: VSOut;
  vout.pos = vec4<f32>(p.x / u.viewport.x * 2.0 - 1.0, 1.0 - p.y / u.viewport.y * 2.0, 0.0, 1.0);
  vout.local = c;
  vout.a = aMul * (0.35 + 0.65 * h3) * (1.0 + 2.0 * spark) * mix(1.0, u.extDim, ext);
  vout.col = col;
  return vout;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let fall = pow(max(0.0, 1.0 - dot(in.local, in.local)), 2.0);   // soft disc
  let a = clamp(in.a * fall, 0.0, 1.0);
  return vec4<f32>(in.col * a, a); // premultiplied
}
`;

export const PARTICLES_PER_SEG = 24;
export const PARTICLE_SIZE = 2.6; // base sprite radius, px
