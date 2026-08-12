// The three brand dots: instanced quads carrying a circular SDF, each scaling
// up from its own exact centre. One pipeline drives all three passes per dot —
// the solid core, its standing halo, and the one-shot pulse — by ramping
// radius and alpha over the same grow window.
export const DOT_SHADER = /* wgsl */ `
struct DU {
  viewport  : vec2<f32>,
  progress  : f32,
  dotGrow   : f32,   // grow duration, in progress units
  color     : vec3<f32>,
  radiusMul : f32,   // base radius multiplier
  rStart    : f32,   // radius factor at t=0 (always 0 — nothing exists yet)
  rEnd      : f32,   // radius factor at t=1
  rPow      : f32,   // radius curve: 1 = linear, <1 = fast bloom outward
  soft      : f32,   // 0 = crisp disc, 1 = soft glow falloff
  aStart    : f32,
  aEnd      : f32,
};
@group(0) @binding(0) var<uniform> u : DU;

struct VSOut {
  @builtin(position) pos   : vec4<f32>,
  @location(0)       local : vec2<f32>,   // -1..1 across the disc
  @location(1)       a     : f32,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32,
      @location(0) centre: vec2<f32>, @location(1) r: f32,
      @location(2) startP: f32) -> VSOut {
  var CORNER = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, 1.0),  vec2<f32>(-1.0, 1.0),
  );
  let c = CORNER[vi];
  let t = clamp((u.progress - startP) / max(u.dotGrow, 1e-5), 0.0, 1.0);
  // radius always starts at 0, so nothing exists before this dot's turn
  let f = pow(t, max(u.rPow, 1e-3));
  let rad = r * u.radiusMul * mix(u.rStart, u.rEnd, f); // scales from its centre
  let p = centre + c * rad;
  var o: VSOut;
  o.pos = vec4<f32>(p.x / u.viewport.x * 2.0 - 1.0, 1.0 - p.y / u.viewport.y * 2.0, 0.0, 1.0);
  o.local = c;
  o.a = mix(u.aStart, u.aEnd, t);
  return o;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let d = length(in.local);
  let aa = max(fwidth(d) * 1.2, 1e-4);
  let disc = 1.0 - smoothstep(1.0 - aa, 1.0, d);
  let fall = mix(disc, pow(max(0.0, 1.0 - d), 2.0), u.soft);
  let a = in.a * fall;
  return vec4<f32>(u.color * a, a); // premultiplied
}
`;
