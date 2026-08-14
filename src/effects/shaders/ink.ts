// Gray-Scott reaction–diffusion fed by the line geometry: the mark bleeds
// outward as living ink. The ONE stateful renderer in the effect — the engine
// ping-pongs an rg16float state texture (R = chemical U, G = chemical V)
// through splat -> sim steps -> display, so the frame depends on frame
// history; determinism under progress-scrubbing is deliberately waived here.

// Splat: instanced ribbon quads (a stripped-down line.ts — no caps) injecting
// chemical V along the live segments; the engine renders this into the state
// texture with additive blending.
export const INK_SPLAT_SHADER = /* wgsl */ `
struct SplatU {
  viewport : vec2<f32>,   // css px
  width    : f32,   // injection ribbon width, css px
  gain     : f32,   // injection strength
};
@group(0) @binding(0) var<uniform> u : SplatU;

struct VSOut {
  @builtin(position) pos    : vec4<f32>,
  @location(0)       vv     : f32,   // across-ribbon coordinate, -1..1
  @location(1)       motion : f32,   // per-segment: 1 moving -> 0 settled
};

@vertex
fn vs(@builtin(vertex_index) vi: u32,
      @location(0) pa: vec2<f32>, @location(1) pb: vec2<f32>,
      @location(2) aMul: f32, @location(3) motion: f32,
      @location(4) col: vec3<f32>, @location(5) ext: f32) -> VSOut {
  var CORNER = array<vec2<f32>, 6>(
    vec2<f32>(0.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, -1.0), vec2<f32>(1.0, 1.0),  vec2<f32>(0.0, 1.0),
  );
  let c = CORNER[vi];
  var d = pb - pa;
  d = d / max(length(d), 1e-4);
  let n = vec2<f32>(-d.y, d.x);
  let p = mix(pa, pb, c.x) + n * (u.width * 0.5) * c.y;
  var o: VSOut;
  // css-px NDC mapping, so the half-res target needs no special handling
  o.pos = vec4<f32>(p.x / u.viewport.x * 2.0 - 1.0, 1.0 - p.y / u.viewport.y * 2.0, 0.0, 1.0);
  o.vv = c.y;
  o.motion = motion;
  return o;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // feed chemical V only; moving heads inject harder than settled ink
  let amount = pow(max(0.0, 1.0 - abs(in.vv)), 2.0) * (0.15 + 0.85 * in.motion) * u.gain;
  return vec4<f32>(0.0, amount, 0.0, 0.0);
}
`;

// Sim: one Gray-Scott step per pass — textureLoad with edge-clamped coords
// (no sampler), 5-point laplacian, fixed dt (the engine passes 1.0: the sim
// advances in steps, never wall time).
export const INK_SIM_SHADER = /* wgsl */ `
struct SimU {
  du  : f32,   // diffusion rate, chemical U
  dv  : f32,   // diffusion rate, chemical V
  f   : f32,   // feed rate
  k   : f32,   // kill rate
  dt  : f32,   // fixed 1.0
  _p0 : f32,
  _p1 : f32,
  _p2 : f32,
};
@group(0) @binding(0) var prev : texture_2d<f32>;
@group(0) @binding(1) var<uniform> u : SimU;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4<f32> {
  var P = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  return vec4<f32>(P[vi], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
  let dims = vec2<i32>(textureDimensions(prev));
  let c0 = vec2<i32>(floor(pos.xy));
  let c = textureLoad(prev, c0, 0);
  let n = textureLoad(prev, vec2<i32>(c0.x, max(c0.y - 1, 0)), 0);
  let s = textureLoad(prev, vec2<i32>(c0.x, min(c0.y + 1, dims.y - 1)), 0);
  let w = textureLoad(prev, vec2<i32>(max(c0.x - 1, 0), c0.y), 0);
  let e = textureLoad(prev, vec2<i32>(min(c0.x + 1, dims.x - 1), c0.y), 0);
  let lap = n + s + e + w - 4.0 * c;
  let lapU = lap.r;
  let lapV = lap.g;
  let uv2 = c.r * c.g * c.g;
  let du = u.du * lapU - uv2 + u.f * (1.0 - c.r);
  let dv = u.dv * lapV + uv2 - (u.f + u.k) * c.g;
  return vec4<f32>(clamp(c.r + du * u.dt, 0.0, 1.0), clamp(c.g + dv * u.dt, 0.0, 1.0), 0.0, 1.0);
}
`;

// Display: colorize chemical V into the premultiplied scene.
export const INK_DISPLAY_SHADER = /* wgsl */ `
struct DispU {
  color : vec4<f32>,   // rgb + overall gain in .a
  lo    : f32,   // smoothstep window over chemical V
  hi    : f32,
  _p0   : f32,
  _p1   : f32,
};
@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var tex  : texture_2d<f32>;
@group(0) @binding(2) var<uniform> u : DispU;

struct VSOut {
  @builtin(position) pos : vec4<f32>,
  @location(0)       uv  : vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  var P = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  let p = P[vi];
  var o: VSOut;
  o.pos = vec4<f32>(p, 0.0, 1.0);
  o.uv = vec2<f32>(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  return o;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let v = textureSample(tex, samp, in.uv).g;
  let ink = smoothstep(u.lo, u.hi, v);
  let a = ink * u.color.a;
  return vec4<f32>(u.color.rgb * a, a); // premultiplied
}
`;

export const INK_STEPS = 3; // sim steps per frame
export const INK_SPLAT_WIDTH = 8; // injection ribbon width, css px
export const INK_SPLAT_GAIN = 0.35;
export const INK_DU = 0.21;
export const INK_DV = 0.105;
export const INK_F = 0.037;
export const INK_K = 0.06;
