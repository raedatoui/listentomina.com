// Shard layer: each convex cell starts black, flashes white once the growing
// rays enclose it, fades to a flat colour sampled from the texture, then
// crossfades to the texture itself while a centroid-anchored zoom settles to 1.
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
  whiteLevel : f32,   // how bright/white the flash is
  colorSat   : f32,   // saturation of the solid-colour stage
  colorBoost : f32,   // brightness of the solid-colour stage
};
@group(0) @binding(0) var<uniform> u   : U;
@group(0) @binding(1) var          samp: sampler;
@group(0) @binding(2) var          tex : texture_2d<f32>;

struct VSOut {
  @builtin(position) pos : vec4<f32>,
  @location(0)       uv  : vec2<f32>,
  @location(1)       col : vec3<f32>,
  @location(2)       t   : f32,
};

@vertex
fn vs(@location(0) p: vec2<f32>, @location(1) uv: vec2<f32>,
      @location(2) col: vec3<f32>, @location(3) closeF: f32,
      @location(4) center: vec2<f32>) -> VSOut {
  var o: VSOut;
  o.pos = vec4<f32>(p.x / u.viewport.x * 2.0 - 1.0, 1.0 - p.y / u.viewport.y * 2.0, 0.0, 1.0);
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
  var c = mix(vec3<f32>(0.0), vec3<f32>(u.whiteLevel), tw); // black -> white
  c = mix(c, solid, tc);                                    // white -> colour
  o.col = c;
  o.t = tt;                                                 // colour -> texture
  return o;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let c = mix(in.col, textureSample(tex, samp, in.uv).rgb, in.t);
  return vec4<f32>(c * u.alpha, u.alpha); // premultiplied, opaque layer
}
`;
