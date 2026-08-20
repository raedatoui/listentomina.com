// GLSL ES 3.00 ports of the WGSL shaders, for the WebGL2 fallback backend
// (src/effects/webgl2/effect.ts). Each stage mirrors its WGSL twin line for line —
// when you change one, change the other.
//
// Deliberate differences, all forced by the API rather than by taste:
//   · uniform blocks become loose uniforms (std140 padding rules don't line up
//     with WGSL's, and these structs are small enough not to care)
//   · quad corners are computed arithmetically instead of indexed out of a
//     const array — dynamic indexing is legal in ES 3.00 but flaky on exactly
//     the old mobile drivers this backend exists to serve
//   · the post chain samples UNFLIPPED (v = y*0.5+0.5) where the WGSL flips.
//     Rendering into an FBO, WebGL writes NDC +1 to v=1 and WebGPU writes it to
//     v=0; each convention is self-consistent within its own API. The artwork
//     texture needs no such adjustment — both APIs put an uploaded image's top
//     row at v=0, so layout.ts's top-left-origin uvs sample the same either way.
//   · mosaic implements mode 0 only — shatter/glass are /loop-only treatments
//     and the fallback only ever runs the `ephemeral` preset.

const HEAD = `#version 300 es
precision highp float;
`;

// six vertices -> two triangles of a quad, without an array lookup:
// index 0..5 folds to corner 0,1,2,0,2,3
const QUAD_CORNER = `
  int vid = gl_VertexID;
  int k = vid < 3 ? vid : (vid == 3 ? 0 : (vid == 4 ? 2 : 3));
`;

// ---------- line ribbons ----------

export const GL_LINE_VS = `${HEAD}
layout(location = 0) in vec2  pa;
layout(location = 1) in vec2  pb;
layout(location = 2) in float aMul;
layout(location = 3) in float motion;
layout(location = 4) in vec3  col;
layout(location = 5) in float ext;

uniform vec2  uViewport;
uniform float uThickness;
uniform float uCapScale;
uniform float uAlpha;

out float vA;
out float vV;
out float vAlong;
out float vMotion;
out vec3  vCol;
out float vExt;

void main() {
${QUAD_CORNER}
  float cx = (k == 1 || k == 2) ? 1.0 : 0.0;
  float cy = k >= 2 ? 1.0 : -1.0;
  vec2 d = pb - pa;
  d = d / max(length(d), 1e-4);
  vec2 n = vec2(-d.y, d.x);
  vec2 p = mix(pa, pb, cx)
         + n * (uThickness * 0.5) * cy
         + d * (uThickness * 0.5 * uCapScale) * (cx * 2.0 - 1.0);
  gl_Position = vec4(p.x / uViewport.x * 2.0 - 1.0, 1.0 - p.y / uViewport.y * 2.0, 0.0, 1.0);
  vA = uAlpha * aMul;
  vV = cy;
  vAlong = cx;
  vMotion = motion;
  vCol = col;
  vExt = ext;
}
`;

export const GL_LINE_FS = `${HEAD}
uniform vec3  uColor;
uniform vec3  uColorTail;
uniform float uSoft;
uniform float uFalloff;
uniform float uTrail;
uniform float uTrailBias;
uniform float uTaper;
uniform float uSegTint;
uniform float uTailDim;

in float vA;
in float vV;
in float vAlong;
in float vMotion;
in vec3  vCol;
in float vExt;
out vec4 fragColor;

void main() {
  float mo = clamp(vMotion, 0.0, 1.0);
  float softF = max(uSoft, vExt);
  float fall = mix(1.0, pow(max(0.0, 1.0 - abs(vV)), max(uFalloff, 0.05)), softF);
  float ramp = pow(clamp(vAlong, 0.0, 1.0), max(uTrailBias, 0.05));
  float g = mix(1.0, ramp, uTrail * mo);
  vec3 head = mix(uColor, vCol, uSegTint);
  vec3 tail = mix(uColorTail, vCol * uTailDim, uSegTint);
  vec3 col = mix(tail, head, g);
  float tent = pow(clamp(4.0 * vAlong * (1.0 - vAlong), 0.0, 1.0), 0.8);
  float shape = mix(1.0, tent, uTaper * mo);
  float edge = mix(1.0, 0.9 * pow(clamp(1.0 - vAlong, 0.0, 1.0), 1.2), vExt);
  float a = vA * fall * g * shape * edge;
  fragColor = vec4(col * a, a);
}
`;

// ---------- brand dots ----------

export const GL_DOT_VS = `${HEAD}
layout(location = 0) in vec2  centre;
layout(location = 1) in float r;
layout(location = 2) in float startP;
layout(location = 3) in vec3  col;

uniform vec2  uViewport;
uniform float uProgress;
uniform float uDotGrow;
uniform vec3  uColor;
uniform float uRadiusMul;
uniform float uRStart;
uniform float uREnd;
uniform float uRPow;
uniform float uAStart;
uniform float uAEnd;
uniform float uColFrom;

out vec2  vLocal;
out float vA;
out vec3  vCol;

void main() {
${QUAD_CORNER}
  vec2 c = vec2((k == 1 || k == 2) ? 1.0 : -1.0, k >= 2 ? 1.0 : -1.0);
  float t = clamp((uProgress - startP) / max(uDotGrow, 1e-5), 0.0, 1.0);
  float f = pow(t, max(uRPow, 1e-3));
  float rad = r * uRadiusMul * mix(uRStart, uREnd, f);
  vec2 p = centre + c * rad;
  gl_Position = vec4(p.x / uViewport.x * 2.0 - 1.0, 1.0 - p.y / uViewport.y * 2.0, 0.0, 1.0);
  vLocal = c;
  vA = mix(uAStart, uAEnd, t);
  vCol = mix(uColor, col, max(t, uColFrom));
}
`;

export const GL_DOT_FS = `${HEAD}
uniform float uSoft;

in vec2  vLocal;
in float vA;
in vec3  vCol;
out vec4 fragColor;

void main() {
  float d = length(vLocal);
  float aa = max(fwidth(d) * 1.2, 1e-4);
  float disc = 1.0 - smoothstep(1.0 - aa, 1.0, d);
  float fall = mix(disc, pow(max(0.0, 1.0 - d), 2.0), uSoft);
  float a = vA * fall;
  fragColor = vec4(vCol * a, a);
}
`;

// ---------- shard mosaic (mode 0) ----------

export const GL_MOSAIC_VS = `${HEAD}
layout(location = 0) in vec2  p;
layout(location = 1) in vec2  uv;
layout(location = 2) in vec3  col;
layout(location = 3) in float closeF;
layout(location = 4) in vec2  center;

uniform vec2  uViewport;
uniform float uResolve;
uniform float uTexScale;
uniform float uGrowSpan;
uniform float uWhiteDur;
uniform float uColorDur;
uniform float uTexDur;
uniform float uWhiteLevel;
uniform float uColorSat;
uniform float uColorBoost;
uniform float uFlashTint;
uniform float uVeil;

out vec2  vUv;
out vec3  vCol;
out float vT;

void main() {
  gl_Position = vec4(p.x / uViewport.x * 2.0 - 1.0, 1.0 - p.y / uViewport.y * 2.0, 0.0, 1.0);
  float close = closeF * uGrowSpan;
  float a = uResolve - close;
  float tw = clamp(a / max(uWhiteDur, 1e-4), 0.0, 1.0);
  float tc = clamp((a - uWhiteDur) / max(uColorDur, 1e-4), 0.0, 1.0);
  float tt = smoothstep(0.0, 1.0,
    clamp((a - uWhiteDur - uColorDur) / max(uTexDur, 1e-4), 0.0, 1.0));
  float s = mix(uTexScale, 1.0, tt);
  vUv = center + (uv - center) / max(s, 0.01);
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  vec3 solid = clamp(mix(vec3(luma), col, uColorSat) * uColorBoost, vec3(0.0), vec3(1.0));
  float mx = max(col.r, max(col.g, col.b));
  vec3 hue = vec3(1.0);
  if (mx > 0.03) { hue = col / mx; }
  vec3 flash = mix(vec3(1.0), hue, uFlashTint) * uWhiteLevel;
  vec3 c = mix(vec3(0.0), flash, tw);
  c = mix(c, solid, tc);
  vCol = c;
  vT = tt * (1.0 - uVeil);
}
`;

export const GL_MOSAIC_FS = `${HEAD}
uniform sampler2D uTex;
uniform float uAlpha;

in vec2  vUv;
in vec3  vCol;
in float vT;
out vec4 fragColor;

void main() {
  vec3 texc = texture(uTex, vUv).rgb;
  vec3 c = mix(vCol, texc, vT);
  fragColor = vec4(c * uAlpha, uAlpha);
}
`;

// ---------- bloom post chain ----------

export const GL_POST_VS = `${HEAD}
out vec2 vUv;
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
  vUv = p * 0.5 + 0.5;   // unflipped: see the header note on texture origins
}
`;

export const GL_POST_BLUR_FS = `${HEAD}
uniform sampler2D uTex;
uniform vec2 uStep;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec4 c = texture(uTex, vUv) * 0.227027;
  c += (texture(uTex, vUv + uStep * 1.0) + texture(uTex, vUv - uStep * 1.0)) * 0.1945946;
  c += (texture(uTex, vUv + uStep * 2.0) + texture(uTex, vUv - uStep * 2.0)) * 0.1216216;
  c += (texture(uTex, vUv + uStep * 3.0) + texture(uTex, vUv - uStep * 3.0)) * 0.054054;
  c += (texture(uTex, vUv + uStep * 4.0) + texture(uTex, vUv - uStep * 4.0)) * 0.0162162;
  fragColor = c;
}
`;

export const GL_POST_COMP_FS = `${HEAD}
uniform sampler2D uTex;
uniform float uStrength;

in vec2 vUv;
out vec4 fragColor;

void main() {
  fragColor = texture(uTex, vUv) * uStrength;
}
`;
