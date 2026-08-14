// Shard layer: each convex cell starts black, flashes white once the growing
// rays enclose it, fades to a flat colour sampled from the texture, then
// crossfades to the texture itself while a centroid-anchored zoom settles to 1.
// Two extra modes ride on u.mode — 1 'shatter': shards fly in from hashed
// scatter positions, spinning about their centroids, assembling as effectAmt
// drives 0 -> 1; 2 'glass': stained-glass fragment pass — per-shard chromatic
// aberration plus a facet specular band. Mode 0 stays bit-identical to the
// original path (the deterministic video export depends on it).
export const MOSAIC_SHADER = /* wgsl */ `
struct U {
  viewport   : vec2<f32>,
  resolve    : f32,   // sequence progress p (0..1)
  alpha      : f32,   // whole-layer opacity (end-of-sequence handoff fade)
  texScale   : f32,   // START texture zoom; settles to exactly 1 per shard
  growSpan   : f32,   // normalised length of the ray-growth phase
  whiteDur   : f32,   // stage 1: black -> white flash (fastest)
  colorDur   : f32,   // stage 2: white -> sampled solid colour
  texDur     : f32,   // stage 3: solid colour -> site texture (zoom settles here)
  whiteLevel : f32,   // how bright the flash is
  colorSat   : f32,   // saturation of the solid-colour stage
  colorBoost : f32,   // brightness of the solid-colour stage
  flashTint  : f32,   // 0 = white flash, 1 = flash in the shard's own hue
  veil       : f32,   // holds back the colour->texture crossfade: 1 = the
                      // shards stay flat colour and never unveil the texture
  mode       : f32,   // 0 = normal · 1 = shatter · 2 = glass
  effectAmt  : f32,   // shatter assembly drive (the engine passes progress p)
  scatterMag : f32,   // shatter fling distance, fraction of the viewport diagonal
  rotMag     : f32,   // shatter max rotation, radians
  aberration : f32,   // glass chromatic-aberration offset, px
  facetStr   : f32,   // glass facet specular strength
  lightAng   : f32,   // glass light angle, radians (engine animates it)
  time       : f32,   // seconds
};
@group(0) @binding(0) var<uniform> u   : U;
@group(0) @binding(1) var          samp: sampler;
@group(0) @binding(2) var          tex : texture_2d<f32>;

struct VSOut {
  @builtin(position) pos : vec4<f32>,
  @location(0)       uv  : vec2<f32>,
  @location(1)       col : vec3<f32>,
  @location(2)       t   : f32,
  @location(3)       center : vec2<f32>,
};

@vertex
fn vs(@location(0) p: vec2<f32>, @location(1) uv: vec2<f32>,
      @location(2) col: vec3<f32>, @location(3) closeF: f32,
      @location(4) center: vec2<f32>) -> VSOut {
  var o: VSOut;
  // Shatter: fling the shard along a hashed direction, spun about its
  // centroid, easing home as effectAmt drives 0 -> 1 (staggered over the same
  // closeF ordering the resolve uses). Positions only — uv stays untouched so
  // the texture patch rides rigidly with the displaced shard.
  var pp = p;
  if (u.mode == 1.0) {
    let c  = center * u.viewport;                 // centroid uv -> px (layout bakes uv = px/viewport)
    let h1 = fract(sin(dot(center, vec2<f32>(127.1, 311.7))) * 43758.5453);
    let h2 = fract(sin(dot(center, vec2<f32>(269.5, 183.3))) * 43758.5453);
    let S  = 0.6;                                 // stagger spread over the closeF ordering
    let ti = smoothstep(0.0, 1.0, clamp(u.effectAmt * (1.0 + S) - closeF * S, 0.0, 1.0));
    let sc = 1.0 - ti;                            // 1 = fully scattered, 0 = assembled
    let ang = u.rotMag * (h2 * 2.0 - 1.0) * sc;
    let ca = cos(ang); let sa = sin(ang);
    var q = pp - c;
    q = vec2<f32>(q.x * ca - q.y * sa, q.x * sa + q.y * ca);
    let dir = vec2<f32>(cos(h1 * 6.28318), sin(h1 * 6.28318));
    pp = c + q + dir * (u.scatterMag * length(u.viewport)) * sc * sc;   // eased arrival
  }
  o.pos = vec4<f32>(pp.x / u.viewport.x * 2.0 - 1.0, 1.0 - pp.y / u.viewport.y * 2.0, 0.0, 1.0);
  o.center = center;
  // Shard timeline, decoupled from the growth phase: BLACK until the rays
  // enclose it (closeF, baked per shard as a fraction of the growth phase),
  // then a fast white flash, then a slower fade to the sampled solid colour,
  // then a crossfade to the site texture while the centroid-anchored zoom
  // settles from texScale to exactly 1 (seamless live-page handoff).
  let close = closeF * u.growSpan;
  let a = u.resolve - close;
  let tw = clamp(a / max(u.whiteDur, 1e-4), 0.0, 1.0);
  let tc = clamp((a - u.whiteDur) / max(u.colorDur, 1e-4), 0.0, 1.0);
  let tt = smoothstep(0.0, 1.0,
    clamp((a - u.whiteDur - u.colorDur) / max(u.texDur, 1e-4), 0.0, 1.0));
  let s = mix(u.texScale, 1.0, tt);
  o.uv = center + (uv - center) / max(s, 0.01);
  let luma = dot(col, vec3<f32>(0.2126, 0.7152, 0.0722));
  let solid = clamp(mix(vec3<f32>(luma), col, u.colorSat) * u.colorBoost,
                    vec3<f32>(0.0), vec3<f32>(1.0));
  // flash colour: white, or the shard's hue lifted to full luminance
  let mx = max(col.r, max(col.g, col.b));
  var hue = vec3<f32>(1.0);
  if (mx > 0.03) { hue = col / mx; }
  let flash = mix(vec3<f32>(1.0), hue, u.flashTint) * u.whiteLevel;
  var c = mix(vec3<f32>(0.0), flash, tw);                   // black -> flash
  c = mix(c, solid, tc);                                    // flash -> colour
  o.col = c;
  o.t = tt * (1.0 - u.veil);                                // colour -> texture
  return o;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  var texc = textureSample(tex, samp, in.uv).rgb;
  // Glass: split the sample along the centroid ray (per-shard chromatic
  // aberration) and add a facet specular band from a hashed per-shard normal.
  // Branch on a uniform = uniform control flow, so the samples are legal.
  if (u.mode == 2.0) {
    let dpx = (in.uv - in.center) * u.viewport;                     // px-space offset from centroid
    let dir = dpx / max(length(dpx), 1e-3);                         // px-space direction
    let off = dir * u.aberration / u.viewport;                      // back to a uv step
    texc = vec3<f32>(textureSample(tex, samp, in.uv + off).r, texc.g, textureSample(tex, samp, in.uv - off).b);
    let h  = fract(sin(dot(in.center, vec2<f32>(419.2, 371.9))) * 43758.5453);
    let n2 = vec2<f32>(cos(h * 6.28318), sin(h * 6.28318));         // per-shard facet normal
    let l  = vec2<f32>(cos(u.lightAng), sin(u.lightAng));
    texc += pow(max(dot(n2, l), 0.0), 6.0) * u.facetStr * in.t;     // specular band, only once textured
  }
  let c = mix(in.col, texc, in.t);
  return vec4<f32>(c * u.alpha, u.alpha); // premultiplied, opaque layer
}
`;

export const MOSAIC_MODE_SHATTER = 1;
export const MOSAIC_MODE_GLASS = 2;
export const SHATTER_SCATTER = 0.35; // fling, fraction of the viewport diagonal
export const SHATTER_ROT = 2.2; // max shard rotation, radians
export const GLASS_ABERRATION = 3; // chromatic offset, px
export const GLASS_FACET = 0.4; // facet specular strength
