// Fullscreen SDF field: draws the mark as a distance field instead of instanced
// ribbons — mode 0 melts it together with a smooth-min union (liquid), mode 1
// runs contour rings out of it (ripples), mode 2 warps the sample point with FBM
// noise before the distance loop (neon). It consumes the SAME per-frame instance
// data as the ribbon pipeline via a storage buffer, so it stays in sync with the
// growth clock for free. Output is premultiplied into the bloom chain's input.
export const SDF_SHADER = /* wgsl */ `
struct SdfU {
  viewport : vec2<f32>,   // [0,1] css px
  count    : f32,         // [2] live instance count
  mode     : f32,         // [3] 0 liquid · 1 ripples · 2 neon
  progress : f32,         // [4]
  k        : f32,         // [5] smin radius px (engine animates it)
  time     : f32,         // [6] seconds
  width    : f32,         // [7] core half-width px
  colA     : vec4<f32>,   // [8..11] core colour rgb + intensity
  colB     : vec4<f32>,   // [12..15] accent/glow colour rgb + gain
  p0       : vec4<f32>,   // [16..19] contourFreq, contourSpeed, warpAmp(px), warpFreq
  p1       : vec4<f32>,   // [20..23] energy, extDim, glowGain, spare
};
@group(0) @binding(0) var<uniform> u : SdfU;
// stride-10 per segment, css px: tail.xy, head.xy, alphaMul, motion, r, g, b, ext
@group(0) @binding(1) var<storage, read> segs : array<f32>;

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
  o.uv = vec2<f32>(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);   // y-down, matches the px coordinate system
  return o;
}

fn sdSeg(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

fn smin(a: f32, b: f32, k: f32) -> f32 {
  let kk = max(k, 1e-4);
  let h = clamp(0.5 + 0.5 * (b - a) / kk, 0.0, 1.0);
  return mix(b, a, h) - kk * h * (1.0 - h);
}

fn vhash(p: vec2<f32>) -> f32 { return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453); }

fn vnoise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let a = vhash(i);
  let b = vhash(i + vec2<f32>(1.0, 0.0));
  let c = vhash(i + vec2<f32>(0.0, 1.0));
  let d = vhash(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

fn fbm2(p: vec2<f32>) -> f32 { return (vnoise(p) + 0.5 * vnoise(p * 2.03 + vec2<f32>(17.1, 9.2))) / 1.5; }

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  if (u.count < 0.5) { return vec4<f32>(0.0); }
  var p = in.uv * u.viewport;   // css px
  // neon: warp the sample point before the distance loop — electric wobble
  if (u.mode > 1.5) {
    let w = vec2<f32>(fbm2(p * u.p0.w + vec2<f32>(u.time, 0.0)), fbm2(p * u.p0.w + vec2<f32>(31.4 - u.time, 7.7))) - 0.5;
    p += w * u.p0.z;
  }
  // fold every live segment into the field; keep the plain nearest segment's
  // attributes (compared before the smooth fold, which distorts distances)
  var d = 1e6;
  var dNearest = 1e6;
  var nearestCol = vec3<f32>(1.0);
  var nearestMotion = 0.0;
  var nearestExt = 0.0;
  var nearestAlphaMul = 1.0;
  for (var i = 0u; i < u32(u.count); i++) {
    let o = i * 10u;
    let di = sdSeg(p, vec2<f32>(segs[o], segs[o + 1u]), vec2<f32>(segs[o + 2u], segs[o + 3u]));
    if (di < dNearest) {
      dNearest = di;
      nearestAlphaMul = segs[o + 4u];
      nearestMotion = segs[o + 5u];
      nearestCol = vec3<f32>(segs[o + 6u], segs[o + 7u], segs[o + 8u]);
      nearestExt = segs[o + 9u];
    }
    d = smin(d, di, u.k);
  }
  // crisp core stroke over the field
  let aa = max(fwidth(d), 0.75);
  var a = (1.0 - smoothstep(u.width - aa, u.width + aa, d)) * u.colA.a * nearestAlphaMul;
  // near-field glow: widens with k, so the molten phase stays luminous
  a += exp(-max(d - u.width, 0.0) / (u.width * 4.0 + u.k)) * u.p1.z;
  // ripples: contour rings running outward, phased by time and progress
  if (u.mode > 0.5 && u.mode < 1.5) {
    let ring = pow(0.5 + 0.5 * cos(d * u.p0.x - u.time * u.p0.y - u.progress * 6.28318), 3.0);
    a += ring * exp(-d / 140.0) * u.colB.a * u.p1.x;
  }
  // extension rays sit dimmer than the mark itself
  a *= mix(1.0, u.p1.y, nearestExt);
  // near the core the segment's own sampled colour dominates (tinted by colA);
  // the faint field carries the accent colour
  let rgb = mix(u.colB.rgb, nearestCol * u.colA.rgb, clamp(a, 0.0, 1.0));
  a = clamp(a, 0.0, 1.5);
  return vec4<f32>(rgb * a, min(a, 1.0));   // premultiplied; rgb may exceed 1 (bloom input)
}
`;

export const SDF_K_MAX = 90;       // liquid: smin radius at progress 0 (molten)
export const SDF_K_MIN = 1.5;      // liquid: smin radius at progress 1 (crisp)
export const SDF_RIPPLE_FREQ = 0.1;   // contour ring frequency, rad/px
export const SDF_RIPPLE_SPEED = 4;    // ring phase speed, rad/s
export const SDF_NEON_WARP = 26;      // warp amplitude, px (engine scales by motion energy)
export const SDF_NEON_FREQ = 0.015;   // warp noise frequency, 1/px
export const SDF_EXT_DIM = 0.35;      // brightness of extension segments vs mark segments
