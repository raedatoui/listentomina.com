// Bloom post chain: fullscreen-triangle vertex stage shared by a separable
// gaussian blur (fsBlur, run H then V at half res) and a strength-scaled
// composite (fsComp, used for both the crisp layer and the additive bloom).
export const POST_SHADER = /* wgsl */ `
struct PU { a : vec2<f32> };   // blur: texel-scaled direction · composite: (strength, 0)
@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var tex  : texture_2d<f32>;
@group(0) @binding(2) var<uniform> u : PU;

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
fn fsBlur(in: VSOut) -> @location(0) vec4<f32> {
  var c = textureSample(tex, samp, in.uv) * 0.227027;
  c += (textureSample(tex, samp, in.uv + u.a * 1.0) + textureSample(tex, samp, in.uv - u.a * 1.0)) * 0.1945946;
  c += (textureSample(tex, samp, in.uv + u.a * 2.0) + textureSample(tex, samp, in.uv - u.a * 2.0)) * 0.1216216;
  c += (textureSample(tex, samp, in.uv + u.a * 3.0) + textureSample(tex, samp, in.uv - u.a * 3.0)) * 0.054054;
  c += (textureSample(tex, samp, in.uv + u.a * 4.0) + textureSample(tex, samp, in.uv - u.a * 4.0)) * 0.0162162;
  return c;
}

@fragment
fn fsComp(in: VSOut) -> @location(0) vec4<f32> {
  return textureSample(tex, samp, in.uv) * u.a.x;
}
`;
