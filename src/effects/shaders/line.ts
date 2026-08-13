// Instanced line ribbons: one pipeline draws both the crisp core stroke and
// the stacked glow passes (soft/falloff), with motion-keyed trail + taper.
export const LINE_SHADER = /* wgsl */ `
struct U {
  viewport  : vec2<f32>,
  thickness : f32,   // css px
  soft      : f32,   // 0 = crisp core stroke, 1 = soft falloff (glow passes)
  color     : vec3<f32>,   // head colour
  capScale  : f32,   // end-cap length as a fraction of half-thickness
  colorTail : vec3<f32>,   // colour at the trailing end
  alpha     : f32,   // base alpha; the per-instance aMul scales it
  falloff   : f32,   // across-ribbon falloff exponent (glow shape)
  trail     : f32,   // 0 = solid colour, 1 = full tail->head ramp
  trailBias : f32,   // gamma on the ramp: <1 keeps it lit further back
  taper     : f32,   // tent profile along the line: peak centre, 0 at the ends
  segTint   : f32,   // 0 = uniform line colour, 1 = each segment's own texture colour
  tailDim   : f32,   // tail brightness on the tinted path
};
@group(0) @binding(0) var<uniform> u : U;

struct VSOut {
  @builtin(position) pos    : vec4<f32>,
  @location(0)       a      : f32,
  @location(1)       vv     : f32,   // across-ribbon coordinate, -1..1
  @location(2)       along  : f32,   // 0 at the tail, 1 at the head
  @location(3)       motion : f32,   // per-segment: 1 moving -> 0 settled
  @location(4)       col    : vec3<f32>,   // per-segment texture colour
  @location(5)       ext    : f32,   // per-segment: 1 = extension line
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
  let p = mix(pa, pb, c.x)
        + n * (u.thickness * 0.5) * c.y
        + d * (u.thickness * 0.5 * u.capScale) * (c.x * 2.0 - 1.0); // end caps
  var o: VSOut;
  o.pos = vec4<f32>(p.x / u.viewport.x * 2.0 - 1.0, 1.0 - p.y / u.viewport.y * 2.0, 0.0, 1.0);
  o.a = u.alpha * aMul;
  o.vv = c.y;
  o.along = c.x;   // pa is always the tail, pb the head (pushSeg keeps order)
  o.motion = motion;
  o.col = col;
  o.ext = ext;
  return o;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let mo = clamp(in.motion, 0.0, 1.0);
  // across the ribbon: crisp core, or a soft shoulder for the glow passes.
  // Extension lines are always feathered, even on the crisp core pass.
  let softF = max(u.soft, in.ext);
  let fall = mix(1.0, pow(max(0.0, 1.0 - abs(in.vv)), max(u.falloff, 0.05)), softF);
  // along the ribbon: shade tail -> head — but only while the line is actually
  // moving; parked lines return to a solid colour as motion settles to 0
  let ramp = pow(clamp(in.along, 0.0, 1.0), max(u.trailBias, 0.05));
  let g = mix(1.0, ramp, u.trail * mo);
  // head/tail colours: the uniform pair, or the segment's own texture colour
  let head = mix(u.color, in.col, u.segTint);
  let tail = mix(u.colorTail, in.col * u.tailDim, u.segTint);
  let col = mix(tail, head, g);
  // motion taper: a tent along the length — brightest mid-segment, fading to
  // nothing at both ends. Also motion-keyed, so the settled mark stays solid
  // and its corners don't hollow out.
  let tent = pow(clamp(4.0 * in.along * (1.0 - in.along), 0.0, 1.0), 0.8);
  let shape = mix(1.0, tent, u.taper * mo);
  // extension lines never hold a hard full-brightness stroke: dimmed overall
  // and dissolving toward the screen edge (the head end), so what leaves the
  // artwork reads as a soft ray, not a beam
  let edge = mix(1.0, 0.9 * pow(clamp(1.0 - in.along, 0.0, 1.0), 1.2), in.ext);
  let a = in.a * fall * g * shape * edge;
  return vec4<f32>(col * a, a); // premultiplied
}
`;
