/**
 * Presents the stage through WebGL so a pixel-art filter can upscale the
 * game's 1× pixels on the GPU, the way RetroArch shaders do.
 *
 * The stage keeps composing on its 2D canvas; this presenter redraws the
 * same layers (level, panel, menu picture) from their source pixels onto a
 * second canvas that sits on top, with the chosen filter. Single-pass
 * filters sample the source directly; ScaleFX runs four analysis passes
 * into off-screen textures first.
 */

export type FilterName = 'sharp' | 'smooth' | 'scalefx' | 'crt' | 'scanlines';
export const FILTERS: readonly FilterName[] = ['sharp', 'smooth', 'scalefx', 'crt', 'scanlines'];
export const FILTER_LABELS: Readonly<Record<FilterName, string>> = { sharp: 'SHARP', smooth: 'SMOOTH', scalefx: 'SCALEFX', crt: 'CRT', scanlines: 'SCANLINES' };

export interface PresentPixels { data: Uint8ClampedArray; width: number; height: number }
export interface PresentRect { x: number; y: number; width: number; height: number }
export interface PresentLayer { pixels: PresentPixels; source: PresentRect; dest: PresentRect }
/** Everything the stage drew, in the stage canvas's own pixel coordinates. */
export interface PresentFrame { width: number; height: number; layers: PresentLayer[] }

/** Vertex stage shared by the single-pass filters: xBR's neighbourhood taps are harmless for the others. */
const VERTEX = `
attribute vec2 aPosition;
attribute vec2 aTexCoord;
uniform vec2 uTextureSize;
varying vec2 vTexCoord;
varying vec4 t1; varying vec4 t2; varying vec4 t3; varying vec4 t4; varying vec4 t5; varying vec4 t6; varying vec4 t7;
void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
    vTexCoord = aTexCoord * vec2(1.00000001, 1.0);
    float dx = 1.0 / uTextureSize.x;
    float dy = 1.0 / uTextureSize.y;
    t1 = aTexCoord.xxxy + vec4(-dx, 0.0, dx, -2.0 * dy);
    t2 = aTexCoord.xxxy + vec4(-dx, 0.0, dx, -dy);
    t3 = aTexCoord.xxxy + vec4(-dx, 0.0, dx, 0.0);
    t4 = aTexCoord.xxxy + vec4(-dx, 0.0, dx, dy);
    t5 = aTexCoord.xxxy + vec4(-dx, 0.0, dx, 2.0 * dy);
    t6 = aTexCoord.xyyy + vec4(-2.0 * dx, -dy, 0.0, dy);
    t7 = aTexCoord.xyyy + vec4(2.0 * dx, -dy, 0.0, dy);
}`;

const PRECISION = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

const HEADER = PRECISION + `
uniform sampler2D uTexture;
uniform vec2 uTextureSize;
uniform vec2 uOutputSize;
varying vec2 vTexCoord;
varying vec4 t1; varying vec4 t2; varying vec4 t3; varying vec4 t4; varying vec4 t5; varying vec4 t6; varying vec4 t7;
`;

const SHARP = HEADER + `
void main() { gl_FragColor = vec4(texture2D(uTexture, vTexCoord).rgb, 1.0); }`;

/*
 * xBR level 2, after Hyllian's xBR-lv2 shader (Copyright (C) 2011-2016 Hyllian,
 * MIT licence; incorporates ideas from Joshua Street's SABR shader), reduced
 * to the "corner C" variant without the small-details option.
 */
const SMOOTH = HEADER + `
#define XBR_SCALE 3.0
#define XBR_EQ_THRESHOLD 15.0
#define XBR_LV2_COEFFICIENT 2.0
const vec3 rgbw = vec3(14.352, 28.176, 5.472);
const vec4 delta   = vec4(1.0 / XBR_SCALE);
const vec4 delta_l = vec4(0.5 / XBR_SCALE, 1.0 / XBR_SCALE, 0.5 / XBR_SCALE, 1.0 / XBR_SCALE);
const vec4 delta_u = vec4(1.0 / XBR_SCALE, 0.5 / XBR_SCALE, 1.0 / XBR_SCALE, 0.5 / XBR_SCALE);
const vec4 Ao = vec4( 1.0, -1.0, -1.0,  1.0);
const vec4 Bo = vec4( 1.0,  1.0, -1.0, -1.0);
const vec4 Co = vec4( 1.5,  0.5, -0.5,  0.5);
const vec4 Ax = vec4( 1.0, -1.0, -1.0,  1.0);
const vec4 Bx = vec4( 0.5,  2.0, -0.5, -2.0);
const vec4 Cx = vec4( 1.0,  1.0, -0.5,  0.0);
const vec4 Ay = vec4( 1.0, -1.0, -1.0,  1.0);
const vec4 By = vec4( 2.0,  0.5, -2.0, -0.5);
const vec4 Cy = vec4( 2.0,  0.0, -1.0,  0.5);
const vec4 Ci = vec4(0.25);
vec4 df(vec4 A, vec4 B) { return abs(A - B); }
vec4 diff(vec4 A, vec4 B) { return vec4(notEqual(A, B)); }
vec4 eq(vec4 A, vec4 B) { return step(df(A, B), vec4(XBR_EQ_THRESHOLD)); }
vec4 neq(vec4 A, vec4 B) { return vec4(1.0) - eq(A, B); }
vec4 wd(vec4 a, vec4 b, vec4 c, vec4 d, vec4 e, vec4 f, vec4 g, vec4 h) { return df(a, b) + df(a, c) + df(d, e) + df(d, f) + 4.0 * df(g, h); }
float c_df(vec3 c1, vec3 c2) { vec3 d = abs(c1 - c2); return d.r + d.g + d.b; }
void main() {
    vec2 fp = fract(vTexCoord * uTextureSize);
    vec3 A1 = texture2D(uTexture, t1.xw).xyz; vec3 B1 = texture2D(uTexture, t1.yw).xyz; vec3 C1 = texture2D(uTexture, t1.zw).xyz;
    vec3 A  = texture2D(uTexture, t2.xw).xyz; vec3 B  = texture2D(uTexture, t2.yw).xyz; vec3 C  = texture2D(uTexture, t2.zw).xyz;
    vec3 D  = texture2D(uTexture, t3.xw).xyz; vec3 E  = texture2D(uTexture, t3.yw).xyz; vec3 F  = texture2D(uTexture, t3.zw).xyz;
    vec3 G  = texture2D(uTexture, t4.xw).xyz; vec3 H  = texture2D(uTexture, t4.yw).xyz; vec3 I  = texture2D(uTexture, t4.zw).xyz;
    vec3 G5 = texture2D(uTexture, t5.xw).xyz; vec3 H5 = texture2D(uTexture, t5.yw).xyz; vec3 I5 = texture2D(uTexture, t5.zw).xyz;
    vec3 A0 = texture2D(uTexture, t6.xy).xyz; vec3 D0 = texture2D(uTexture, t6.xz).xyz; vec3 G0 = texture2D(uTexture, t6.xw).xyz;
    vec3 C4 = texture2D(uTexture, t7.xy).xyz; vec3 F4 = texture2D(uTexture, t7.xz).xyz; vec3 I4 = texture2D(uTexture, t7.xw).xyz;
    vec4 b = vec4(dot(B, rgbw), dot(D, rgbw), dot(H, rgbw), dot(F, rgbw));
    vec4 c = vec4(dot(C, rgbw), dot(A, rgbw), dot(G, rgbw), dot(I, rgbw));
    vec4 d = b.yzwx;
    vec4 e = vec4(dot(E, rgbw));
    vec4 f = b.wxyz;
    vec4 g = c.zwxy;
    vec4 h = b.zwxy;
    vec4 i = c.wxyz;
    vec4 i4 = vec4(dot(I4, rgbw), dot(C1, rgbw), dot(A0, rgbw), dot(G5, rgbw));
    vec4 i5 = vec4(dot(I5, rgbw), dot(C4, rgbw), dot(A1, rgbw), dot(G0, rgbw));
    vec4 h5 = vec4(dot(H5, rgbw), dot(F4, rgbw), dot(B1, rgbw), dot(D0, rgbw));
    vec4 f4 = h5.yzwx;
    vec4 fx   = Ao * fp.y + Bo * fp.x;
    vec4 fx_l = Ax * fp.y + Bx * fp.x;
    vec4 fx_u = Ay * fp.y + By * fp.x;
    vec4 irlv0 = diff(e, f) * diff(e, h);
    vec4 irlv1 = irlv0 * (neq(f, b) * neq(f, c) + neq(h, d) * neq(h, g) + eq(e, i) * (neq(f, f4) * neq(f, i4) + neq(h, h5) * neq(h, i5)) + eq(e, g) + eq(e, c));
    vec4 irlv2l = diff(e, g) * diff(d, g);
    vec4 irlv2u = diff(e, c) * diff(b, c);
    vec4 fx45i = clamp((fx   + delta   - Co - Ci) / (2.0 * delta  ), 0.0, 1.0);
    vec4 fx45  = clamp((fx   + delta   - Co     ) / (2.0 * delta  ), 0.0, 1.0);
    vec4 fx30  = clamp((fx_l + delta_l - Cx     ) / (2.0 * delta_l), 0.0, 1.0);
    vec4 fx60  = clamp((fx_u + delta_u - Cy     ) / (2.0 * delta_u), 0.0, 1.0);
    vec4 wd1 = wd(e, c, g, i, h5, f4, h, f);
    vec4 wd2 = wd(h, d, i5, f, i4, b, e, i);
    vec4 edri  = step(wd1, wd2) * irlv0;
    vec4 edr   = step(wd1 + vec4(0.1), wd2) * step(vec4(0.5), irlv1);
    vec4 edr_l = step(XBR_LV2_COEFFICIENT * df(f, g), df(h, c)) * irlv2l * edr;
    vec4 edr_u = step(XBR_LV2_COEFFICIENT * df(h, c), df(f, g)) * irlv2u * edr;
    fx45 = edr * fx45; fx30 = edr_l * fx30; fx60 = edr_u * fx60; fx45i = edri * fx45i;
    vec4 px = step(df(e, f), df(e, h));
    vec4 maximos = max(max(fx30, fx60), max(fx45, fx45i));
    vec3 res1 = E;
    res1 = mix(res1, mix(H, F, px.x), maximos.x);
    res1 = mix(res1, mix(B, D, px.z), maximos.z);
    vec3 res2 = E;
    res2 = mix(res2, mix(F, B, px.y), maximos.y);
    res2 = mix(res2, mix(D, H, px.w), maximos.w);
    vec3 res = mix(res1, res2, step(c_df(E, res1), c_df(E, res2)));
    gl_FragColor = vec4(res, 1.0);
}`;

/** A soft tube look: slight horizontal bleed, a scanline per source row and a faint aperture mask. */
const CRT = HEADER + `
void main() {
    vec2 texel = 1.0 / uTextureSize;
    vec2 pos = vTexCoord * uTextureSize;
    vec2 centre = (floor(pos) + 0.5) * texel;
    vec3 left = texture2D(uTexture, centre - vec2(texel.x, 0.0)).rgb;
    vec3 mid = texture2D(uTexture, centre).rgb;
    vec3 right = texture2D(uTexture, centre + vec2(texel.x, 0.0)).rgb;
    float fx = fract(pos.x);
    vec3 colour = mix(mix(left, mid, smoothstep(0.0, 0.5, fx)), mix(mid, right, smoothstep(0.5, 1.0, fx)), step(0.5, fx));
    colour = mix(mid, colour, 0.45);
    float line = fract(pos.y);
    float beam = 0.55 + 0.45 * sin(3.14159 * line);
    float column = mod(gl_FragCoord.x, 3.0);
    vec3 mask = vec3(column < 1.0 ? 1.0 : 0.9, column >= 1.0 && column < 2.0 ? 1.0 : 0.9, column >= 2.0 ? 1.0 : 0.9);
    gl_FragColor = vec4(min(colour * beam * mask * 1.25, 1.0), 1.0);
}`;

/** Crisp pixels with a dark line between source rows. */
const SCANLINES = HEADER + `
void main() {
    vec3 colour = texture2D(uTexture, vTexCoord).rgb;
    float line = fract(vTexCoord.y * uTextureSize.y);
    float shade = line > 0.7 ? 0.55 : 1.0;
    gl_FragColor = vec4(colour * shade, 1.0);
}`;

/*
 * ScaleFX, after Sp00kyFox's ScaleFX passes 0 to 4 (Copyright (c) 2016
 * Sp00kyFox, MIT licence): an edge interpolation specialised in pixel art
 * that only ever outputs colours present in the source. The four analysis
 * passes run at source size into textures; the last pass reads the tags and
 * the source and writes straight to the screen.
 */
const SCALEFX_NEIGHBOUR_VERTEX = `
attribute vec2 aPosition;
attribute vec2 aTexCoord;
uniform vec2 uTextureSize;
varying vec2 vTexCoord;
varying vec4 t1; varying vec4 t2; varying vec4 t3; varying vec4 t4;
void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
    vTexCoord = aTexCoord;
    float dx = 1.0 / uTextureSize.x, dy = 1.0 / uTextureSize.y;
    t1 = aTexCoord.xxxy + vec4(-dx, 0.0, dx, -dy);
    t2 = aTexCoord.xxxy + vec4(-dx, 0.0, dx, 0.0);
    t3 = aTexCoord.xxxy + vec4(-dx, 0.0, dx, dy);
    t4 = vec4(0.0);
}`;

const SCALEFX_REACH_VERTEX = `
attribute vec2 aPosition;
attribute vec2 aTexCoord;
uniform vec2 uTextureSize;
varying vec2 vTexCoord;
varying vec4 t1; varying vec4 t2; varying vec4 t3; varying vec4 t4;
void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
    vTexCoord = aTexCoord;
    float dx = 1.0 / uTextureSize.x, dy = 1.0 / uTextureSize.y;
    t1 = aTexCoord.xxxy + vec4(-dx, -2.0 * dx, -3.0 * dx, 0.0);
    t2 = aTexCoord.xxxy + vec4( dx,  2.0 * dx,  3.0 * dx, 0.0);
    t3 = aTexCoord.xyyy + vec4(0.0, -dy, -2.0 * dy, -3.0 * dy);
    t4 = aTexCoord.xyyy + vec4(0.0,  dy,  2.0 * dy,  3.0 * dy);
}`;

const SCALEFX_HEADER = PRECISION + `
uniform sampler2D uTexture;
uniform sampler2D uPrev;
uniform vec2 uTextureSize;
varying vec2 vTexCoord;
varying vec4 t1; varying vec4 t2; varying vec4 t3; varying vec4 t4;
`;

const SCALEFX_PASS0 = SCALEFX_HEADER + `
float dist(vec3 A, vec3 B) {
    float r = 0.5 * (A.r + B.r);
    vec3 d = A - B;
    vec3 c = vec3(2.0 + r, 4.0, 3.0 - r);
    return sqrt(dot(c * d, d)) / 3.0;
}
void main() {
    vec3 A = texture2D(uTexture, t1.xw).rgb, B = texture2D(uTexture, t1.yw).rgb, C = texture2D(uTexture, t1.zw).rgb;
    vec3 E = texture2D(uTexture, t2.yw).rgb, F = texture2D(uTexture, t2.zw).rgb;
    gl_FragColor = vec4(dist(E, A), dist(E, B), dist(E, C), dist(E, F));
}`;

const SCALEFX_PASS1 = SCALEFX_HEADER + `
#define SFX_CLR 0.5
#define SFX_SAA 1.0
float str(float d, vec2 a, vec2 b) {
    float diff = a.x - a.y;
    float wght1 = max(SFX_CLR - d, 0.0) / SFX_CLR;
    float wght2 = clamp((1.0 - d) + (min(a.x, b.x) + a.x > min(a.y, b.y) + a.y ? diff : -diff), 0.0, 1.0);
    return (SFX_SAA == 1.0 || 2.0 * d < a.x + a.y) ? (wght1 * wght2) * (a.x * a.y) : 0.0;
}
void main() {
    vec4 A = texture2D(uTexture, t1.xw), B = texture2D(uTexture, t1.yw);
    vec4 D = texture2D(uTexture, t2.xw), E = texture2D(uTexture, t2.yw), F = texture2D(uTexture, t2.zw);
    vec4 G = texture2D(uTexture, t3.xw), H = texture2D(uTexture, t3.yw), I = texture2D(uTexture, t3.zw);
    vec4 res;
    res.x = str(D.z, vec2(D.w, E.y), vec2(A.w, D.y));
    res.y = str(F.x, vec2(E.w, E.y), vec2(B.w, F.y));
    res.z = str(H.z, vec2(E.w, H.y), vec2(H.w, I.y));
    res.w = str(H.x, vec2(D.w, H.y), vec2(G.w, G.y));
    gl_FragColor = res;
}`;

const SCALEFX_PASS2 = SCALEFX_HEADER + `
#define LE(x, y) (1.0 - step(y, x))
#define GE(x, y) (1.0 - step(x, y))
#define LEQ(x, y) step(x, y)
#define NOT(x) (1.0 - (x))
vec4 dom(vec3 x, vec3 y, vec3 z, vec3 w) {
    return 2.0 * vec4(x.y, y.y, z.y, w.y) - (vec4(x.x, y.x, z.x, w.x) + vec4(x.z, y.z, z.z, w.z));
}
float clear(vec2 crn, vec2 a, vec2 b) {
    return (crn.x >= max(min(a.x, a.y), min(b.x, b.y))) && (crn.y >= max(min(a.x, b.y), min(b.x, a.y))) ? 1.0 : 0.0;
}
void main() {
    vec4 A = texture2D(uPrev, t1.xw), B = texture2D(uPrev, t1.yw);
    vec4 D = texture2D(uPrev, t2.xw), E = texture2D(uPrev, t2.yw), F = texture2D(uPrev, t2.zw);
    vec4 G = texture2D(uPrev, t3.xw), H = texture2D(uPrev, t3.yw), I = texture2D(uPrev, t3.zw);
    vec4 As = texture2D(uTexture, t1.xw), Bs = texture2D(uTexture, t1.yw), Cs = texture2D(uTexture, t1.zw);
    vec4 Ds = texture2D(uTexture, t2.xw), Es = texture2D(uTexture, t2.yw), Fs = texture2D(uTexture, t2.zw);
    vec4 Gs = texture2D(uTexture, t3.xw), Hs = texture2D(uTexture, t3.yw), Is = texture2D(uTexture, t3.zw);
    vec4 jSx = vec4(As.z, Bs.w, Es.x, Ds.y), jDx = dom(As.yzw, Bs.zwx, Es.wxy, Ds.xyz);
    vec4 jSy = vec4(Bs.z, Cs.w, Fs.x, Es.y), jDy = dom(Bs.yzw, Cs.zwx, Fs.wxy, Es.xyz);
    vec4 jSz = vec4(Es.z, Fs.w, Is.x, Hs.y), jDz = dom(Es.yzw, Fs.zwx, Is.wxy, Hs.xyz);
    vec4 jSw = vec4(Ds.z, Es.w, Hs.x, Gs.y), jDw = dom(Ds.yzw, Es.zwx, Hs.wxy, Gs.xyz);
    vec4 zero4 = vec4(0.0);
    vec4 jx = min(GE(jDx, zero4) * (LEQ(jDx.yzwx, zero4) * LEQ(jDx.wxyz, zero4) + GE(jDx + jDx.zwxy, jDx.yzwx + jDx.wxyz)), 1.0);
    vec4 jy = min(GE(jDy, zero4) * (LEQ(jDy.yzwx, zero4) * LEQ(jDy.wxyz, zero4) + GE(jDy + jDy.zwxy, jDy.yzwx + jDy.wxyz)), 1.0);
    vec4 jz = min(GE(jDz, zero4) * (LEQ(jDz.yzwx, zero4) * LEQ(jDz.wxyz, zero4) + GE(jDz + jDz.zwxy, jDz.yzwx + jDz.wxyz)), 1.0);
    vec4 jw = min(GE(jDw, zero4) * (LEQ(jDw.yzwx, zero4) * LEQ(jDw.wxyz, zero4) + GE(jDw + jDw.zwxy, jDw.yzwx + jDw.wxyz)), 1.0);
    vec4 res;
    res.x = min(jx.z + NOT(jx.y) * NOT(jx.w) * GE(jSx.z, 0.0) * (jx.x + GE(jSx.x + jSx.z, jSx.y + jSx.w)), 1.0);
    res.y = min(jy.w + NOT(jy.z) * NOT(jy.x) * GE(jSy.w, 0.0) * (jy.y + GE(jSy.y + jSy.w, jSy.x + jSy.z)), 1.0);
    res.z = min(jz.x + NOT(jz.w) * NOT(jz.y) * GE(jSz.x, 0.0) * (jz.z + GE(jSz.x + jSz.z, jSz.y + jSz.w)), 1.0);
    res.w = min(jw.y + NOT(jw.x) * NOT(jw.z) * GE(jSw.y, 0.0) * (jw.w + GE(jSw.y + jSw.w, jSw.x + jSw.z)), 1.0);
    res = min(res * (vec4(jx.z, jy.w, jz.x, jw.y) + NOT(res.wxyz * res.yzwx)), 1.0);
    vec4 clr;
    clr.x = clear(vec2(D.z, E.x), vec2(D.w, E.y), vec2(A.w, D.y));
    clr.y = clear(vec2(F.x, E.z), vec2(E.w, E.y), vec2(B.w, F.y));
    clr.z = clear(vec2(H.z, I.x), vec2(E.w, H.y), vec2(H.w, I.y));
    clr.w = clear(vec2(H.x, G.z), vec2(D.w, H.y), vec2(G.w, G.y));
    vec4 h = vec4(min(D.w, A.w), min(E.w, B.w), min(E.w, H.w), min(D.w, G.w));
    vec4 v = vec4(min(E.y, D.y), min(E.y, F.y), min(H.y, I.y), min(H.y, G.y));
    vec4 orient = GE(h + vec4(D.w, E.w, E.w, D.w), v + vec4(E.y, E.y, H.y, H.y));
    vec4 hori = LE(h, v) * clr;
    vec4 vert = GE(h, v) * clr;
    gl_FragColor = (res + 2.0 * hori + 4.0 * vert + 8.0 * orient) / 15.0;
}`;

const SCALEFX_PASS3 = SCALEFX_HEADER + `
#define SFX_SCN 1.0
bvec4 loadCorn(vec4 x) { return bvec4(floor(mod(x * 15.0 + 0.5, 2.0))); }
bvec4 loadHori(vec4 x) { return bvec4(floor(mod(x * 7.5 + 0.25, 2.0))); }
bvec4 loadVert(vec4 x) { return bvec4(floor(mod(x * 3.75 + 0.125, 2.0))); }
bvec4 loadOr(vec4 x) { return bvec4(floor(mod(x * 1.875 + 0.0625, 2.0))); }
void main() {
    vec4 E = texture2D(uTexture, vTexCoord);
    vec4 D = texture2D(uTexture, t1.xw), D0 = texture2D(uTexture, t1.yw), D1 = texture2D(uTexture, t1.zw);
    vec4 F = texture2D(uTexture, t2.xw), F0 = texture2D(uTexture, t2.yw), F1 = texture2D(uTexture, t2.zw);
    vec4 B = texture2D(uTexture, t3.xy), B0 = texture2D(uTexture, t3.xz), B1 = texture2D(uTexture, t3.xw);
    vec4 H = texture2D(uTexture, t4.xy), H0 = texture2D(uTexture, t4.xz), H1 = texture2D(uTexture, t4.xw);
    bvec4 Ec = loadCorn(E), Eh = loadHori(E), Ev = loadVert(E), Eo = loadOr(E);
    bvec4 Dc = loadCorn(D), Dh = loadHori(D), Do = loadOr(D), D0c = loadCorn(D0), D0h = loadHori(D0), D1h = loadHori(D1);
    bvec4 Fc = loadCorn(F), Fh = loadHori(F), Fo = loadOr(F), F0c = loadCorn(F0), F0h = loadHori(F0), F1h = loadHori(F1);
    bvec4 Bc = loadCorn(B), Bv = loadVert(B), Bo = loadOr(B), B0c = loadCorn(B0), B0v = loadVert(B0), B1v = loadVert(B1);
    bvec4 Hc = loadCorn(H), Hv = loadVert(H), Ho = loadOr(H), H0c = loadCorn(H0), H0v = loadVert(H0), H1v = loadVert(H1);
    bool lvl1x = Ec.x && (Dc.z || Bc.z || SFX_SCN == 1.0);
    bool lvl1y = Ec.y && (Fc.w || Bc.w || SFX_SCN == 1.0);
    bool lvl1z = Ec.z && (Fc.x || Hc.x || SFX_SCN == 1.0);
    bool lvl1w = Ec.w && (Dc.y || Hc.y || SFX_SCN == 1.0);
    bvec2 lvl2x = bvec2((Ec.x && Eh.y) && Dc.z, (Ec.y && Eh.x) && Fc.w);
    bvec2 lvl2y = bvec2((Ec.y && Ev.z) && Bc.w, (Ec.z && Ev.y) && Hc.x);
    bvec2 lvl2z = bvec2((Ec.w && Eh.z) && Dc.y, (Ec.z && Eh.w) && Fc.x);
    bvec2 lvl2w = bvec2((Ec.x && Ev.w) && Bc.z, (Ec.w && Ev.x) && Hc.y);
    bvec2 lvl3x = bvec2(lvl2x.y && (Dh.y && Dh.x) && Fh.z, lvl2w.y && (Bv.w && Bv.x) && Hv.z);
    bvec2 lvl3y = bvec2(lvl2x.x && (Fh.x && Fh.y) && Dh.w, lvl2y.y && (Bv.z && Bv.y) && Hv.w);
    bvec2 lvl3z = bvec2(lvl2z.x && (Fh.w && Fh.z) && Dh.x, lvl2y.x && (Hv.y && Hv.z) && Bv.x);
    bvec2 lvl3w = bvec2(lvl2z.y && (Dh.z && Dh.w) && Fh.y, lvl2w.x && (Hv.x && Hv.w) && Bv.y);
    bvec2 lvl4x = bvec2((Dc.x && Dh.y && Eh.x && Eh.y && Fh.x && Fh.y) && (D0c.z && D0h.w), (Bc.x && Bv.w && Ev.x && Ev.w && Hv.x && Hv.w) && (B0c.z && B0v.y));
    bvec2 lvl4y = bvec2((Fc.y && Fh.x && Eh.y && Eh.x && Dh.y && Dh.x) && (F0c.w && F0h.z), (Bc.y && Bv.z && Ev.y && Ev.z && Hv.y && Hv.z) && (B0c.w && B0v.x));
    bvec2 lvl4z = bvec2((Fc.z && Fh.w && Eh.z && Eh.w && Dh.z && Dh.w) && (F0c.x && F0h.y), (Hc.z && Hv.y && Ev.z && Ev.y && Bv.z && Bv.y) && (H0c.x && H0v.w));
    bvec2 lvl4w = bvec2((Dc.w && Dh.z && Eh.w && Eh.z && Fh.w && Fh.z) && (D0c.y && D0h.x), (Hc.w && Hv.x && Ev.w && Ev.x && Bv.w && Bv.x) && (H0c.y && H0v.z));
    bvec2 lvl5x = bvec2(lvl4x.x && (F0h.x && F0h.y) && (D1h.z && D1h.w), lvl4y.x && (D0h.y && D0h.x) && (F1h.w && F1h.z));
    bvec2 lvl5y = bvec2(lvl4y.y && (H0v.y && H0v.z) && (B1v.w && B1v.x), lvl4z.y && (B0v.z && B0v.y) && (H1v.x && H1v.w));
    bvec2 lvl5z = bvec2(lvl4w.x && (F0h.w && F0h.z) && (D1h.y && D1h.x), lvl4z.x && (D0h.z && D0h.w) && (F1h.x && F1h.y));
    bvec2 lvl5w = bvec2(lvl4x.y && (H0v.x && H0v.w) && (B1v.z && B1v.y), lvl4w.y && (B0v.w && B0v.x) && (H1v.y && H1v.z));
    bvec2 lvl6x = bvec2(lvl5x.y && (D1h.y && D1h.x), lvl5w.y && (B1v.w && B1v.x));
    bvec2 lvl6y = bvec2(lvl5x.x && (F1h.x && F1h.y), lvl5y.y && (B1v.z && B1v.y));
    bvec2 lvl6z = bvec2(lvl5z.x && (F1h.w && F1h.z), lvl5y.x && (H1v.y && H1v.z));
    bvec2 lvl6w = bvec2(lvl5z.y && (D1h.z && D1h.w), lvl5w.x && (H1v.x && H1v.w));
    vec4 crn;
    crn.x = (lvl1x && Eo.x || lvl3x.x && Eo.y || lvl4x.x && Do.x || lvl6x.x && Fo.y) ? 5.0 : (lvl1x || lvl3x.y && !Eo.w || lvl4x.y && !Bo.x || lvl6x.y && !Ho.w) ? 1.0 : lvl3x.x ? 3.0 : lvl3x.y ? 7.0 : lvl4x.x ? 2.0 : lvl4x.y ? 6.0 : lvl6x.x ? 4.0 : lvl6x.y ? 8.0 : 0.0;
    crn.y = (lvl1y && Eo.y || lvl3y.x && Eo.x || lvl4y.x && Fo.y || lvl6y.x && Do.x) ? 5.0 : (lvl1y || lvl3y.y && !Eo.z || lvl4y.y && !Bo.y || lvl6y.y && !Ho.z) ? 3.0 : lvl3y.x ? 1.0 : lvl3y.y ? 7.0 : lvl4y.x ? 4.0 : lvl4y.y ? 6.0 : lvl6y.x ? 2.0 : lvl6y.y ? 8.0 : 0.0;
    crn.z = (lvl1z && Eo.z || lvl3z.x && Eo.w || lvl4z.x && Fo.z || lvl6z.x && Do.w) ? 7.0 : (lvl1z || lvl3z.y && !Eo.y || lvl4z.y && !Ho.z || lvl6z.y && !Bo.y) ? 3.0 : lvl3z.x ? 1.0 : lvl3z.y ? 5.0 : lvl4z.x ? 4.0 : lvl4z.y ? 8.0 : lvl6z.x ? 2.0 : lvl6z.y ? 6.0 : 0.0;
    crn.w = (lvl1w && Eo.w || lvl3w.x && Eo.z || lvl4w.x && Do.w || lvl6w.x && Fo.z) ? 7.0 : (lvl1w || lvl3w.y && !Eo.x || lvl4w.y && !Ho.w || lvl6w.y && !Bo.x) ? 1.0 : lvl3w.x ? 3.0 : lvl3w.y ? 5.0 : lvl4w.x ? 2.0 : lvl4w.y ? 8.0 : lvl6w.x ? 4.0 : lvl6w.y ? 6.0 : 0.0;
    vec4 mid;
    mid.x = (lvl2x.x &&  Eo.x || lvl2x.y &&  Eo.y || lvl5x.x &&  Do.x || lvl5x.y &&  Fo.y) ? 5.0 : lvl2x.x ? 1.0 : lvl2x.y ? 3.0 : lvl5x.x ? 2.0 : lvl5x.y ? 4.0 : (Ec.x && Dc.z && Ec.y && Fc.w) ? ( Eo.x ?  Eo.y ? 5.0 : 3.0 : 1.0) : 0.0;
    mid.y = (lvl2y.x && !Eo.y || lvl2y.y && !Eo.z || lvl5y.x && !Bo.y || lvl5y.y && !Ho.z) ? 3.0 : lvl2y.x ? 5.0 : lvl2y.y ? 7.0 : lvl5y.x ? 6.0 : lvl5y.y ? 8.0 : (Ec.y && Bc.w && Ec.z && Hc.x) ? (!Eo.y ? !Eo.z ? 3.0 : 7.0 : 5.0) : 0.0;
    mid.z = (lvl2z.x &&  Eo.w || lvl2z.y &&  Eo.z || lvl5z.x &&  Do.w || lvl5z.y &&  Fo.z) ? 7.0 : lvl2z.x ? 1.0 : lvl2z.y ? 3.0 : lvl5z.x ? 2.0 : lvl5z.y ? 4.0 : (Ec.z && Fc.x && Ec.w && Dc.y) ? ( Eo.z ?  Eo.w ? 7.0 : 1.0 : 3.0) : 0.0;
    mid.w = (lvl2w.x && !Eo.x || lvl2w.y && !Eo.w || lvl5w.x && !Bo.x || lvl5w.y && !Ho.w) ? 1.0 : lvl2w.x ? 5.0 : lvl2w.y ? 7.0 : lvl5w.x ? 6.0 : lvl5w.y ? 8.0 : (Ec.w && Hc.y && Ec.x && Bc.z) ? (!Eo.w ? !Eo.x ? 1.0 : 5.0 : 7.0) : 0.0;
    gl_FragColor = (crn + 9.0 * mid) / 80.0;
}`;

/** The output pass reads the tags (uTexture) and the original picture (uPrev) and writes to the screen. */
const SCALEFX_PASS4 = SCALEFX_HEADER + `
vec4 loadCrn(vec4 x) { return floor(mod(x * 80.0 + 0.5, 9.0)); }
vec4 loadMid(vec4 x) { return floor(mod(x * 8.888888 + 0.055555, 9.0)); }
void main() {
    vec4 E = texture2D(uTexture, vTexCoord);
    vec4 crn = loadCrn(E);
    vec4 mid = loadMid(E);
    vec2 fp = floor(3.0 * fract(vTexCoord * uTextureSize));
    float sp = fp.y == 0.0 ? (fp.x == 0.0 ? crn.x : fp.x == 1.0 ? mid.x : crn.y) : (fp.y == 1.0 ? (fp.x == 0.0 ? mid.w : fp.x == 1.0 ? 0.0 : mid.y) : (fp.x == 0.0 ? crn.w : fp.x == 1.0 ? mid.z : crn.z));
    vec2 res = sp == 0.0 ? vec2(0.0, 0.0) : sp == 1.0 ? vec2(-1.0, 0.0) : sp == 2.0 ? vec2(-2.0, 0.0) : sp == 3.0 ? vec2(1.0, 0.0) : sp == 4.0 ? vec2(2.0, 0.0) : sp == 5.0 ? vec2(0.0, -1.0) : sp == 6.0 ? vec2(0.0, -2.0) : sp == 7.0 ? vec2(0.0, 1.0) : vec2(0.0, 2.0);
    gl_FragColor = vec4(texture2D(uPrev, vTexCoord + res / uTextureSize).rgb, 1.0);
}`;

const SINGLE_PASS: Partial<Record<FilterName, string>> = { sharp: SHARP, smooth: SMOOTH, crt: CRT, scanlines: SCANLINES };
const SCALEFX_PASSES: Array<{ vertex: string; fragment: string }> = [
    { vertex: SCALEFX_NEIGHBOUR_VERTEX, fragment: SCALEFX_PASS0 },
    { vertex: SCALEFX_NEIGHBOUR_VERTEX, fragment: SCALEFX_PASS1 },
    { vertex: SCALEFX_NEIGHBOUR_VERTEX, fragment: SCALEFX_PASS2 },
    { vertex: SCALEFX_REACH_VERTEX, fragment: SCALEFX_PASS3 },
    { vertex: SCALEFX_NEIGHBOUR_VERTEX, fragment: SCALEFX_PASS4 },
];

interface Program {
    program: WebGLProgram; aPosition: number; aTexCoord: number;
    uTexture: WebGLUniformLocation | null; uPrev: WebGLUniformLocation | null;
    uTextureSize: WebGLUniformLocation | null; uOutputSize: WebGLUniformLocation | null;
}

interface Target { texture: WebGLTexture; framebuffer: WebGLFramebuffer; width: number; height: number }

export class GlPresenter {
    private gl: WebGLRenderingContext | null;
    private programs = new Map<string, Program | null>();
    private textures: WebGLTexture[] = [];
    /** Four intermediate targets per layer for ScaleFX, keyed by layer index. */
    private targets = new Map<number, Target[]>();
    private buffer: WebGLBuffer | null = null;
    private floatTargets = false;

    constructor(private canvas: HTMLCanvasElement) {
        let gl: WebGLRenderingContext | null = null;
        try {
            gl = (canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false }) ??
                canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
        } catch { gl = null; }
        this.gl = gl;
        if (gl) {
            this.buffer = gl.createBuffer();
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
            this.floatTargets = this.probeFloatTargets(gl);
        }
    }

    /** False when the browser offers no WebGL; the caller then keeps the 2D canvas visible. */
    public get supported(): boolean {
        return this.gl !== null;
    }

    /** Size the output to the on-screen size of the canvas, in device pixels (capped). */
    public resize(cssWidth: number, cssHeight: number, pixelRatio = 1): void {
        const ratio = Math.min(2, Math.max(1, pixelRatio));
        const width = Math.max(1, Math.round(cssWidth * ratio)), height = Math.max(1, Math.round(cssHeight * ratio));
        if (this.canvas.width !== width) this.canvas.width = width;
        if (this.canvas.height !== height) this.canvas.height = height;
    }

    public present(frame: PresentFrame, filter: FilterName): boolean {
        const gl = this.gl;
        if (!gl) return false;
        const output = filter === 'scalefx' ? this.scaleFxProgram(4) : this.singleProgram(filter);
        if (!output) return false;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        let ok = true;
        frame.layers.forEach((layer, index) => {
            if (!ok) return;
            const source = this.texture(index);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, source);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, layer.pixels.width, layer.pixels.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, layer.pixels.data);
            let sampled: WebGLTexture = source, previous: WebGLTexture | null = null;
            if (filter === 'scalefx') {
                const tags = this.runScaleFx(index, source, layer.pixels.width, layer.pixels.height);
                if (!tags) { ok = false; return; }
                sampled = tags;
                previous = source;
            }
            if (index === 0) {
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                gl.viewport(0, 0, this.canvas.width, this.canvas.height);
                gl.disable(gl.SCISSOR_TEST);
                gl.clearColor(0, 0, 0, 1);
                gl.clear(gl.COLOR_BUFFER_BIT);
            }
            this.drawLayer(output, layer, frame, sampled, previous);
        });
        gl.disable(gl.SCISSOR_TEST);
        return ok;
    }

    public dispose(): void {
        const gl = this.gl;
        if (!gl) return;
        for (const texture of this.textures) gl.deleteTexture(texture);
        this.textures = [];
        for (const targets of this.targets.values()) for (const target of targets) { gl.deleteTexture(target.texture); gl.deleteFramebuffer(target.framebuffer); }
        this.targets.clear();
        for (const program of this.programs.values()) if (program) gl.deleteProgram(program.program);
        this.programs.clear();
        if (this.buffer) gl.deleteBuffer(this.buffer);
        this.buffer = null;
        this.gl = null;
    }

    /** Draw one layer's quad onto the screen with `sampled` as the main texture and `previous` as the second. */
    private drawLayer(program: Program, layer: PresentLayer, frame: PresentFrame, sampled: WebGLTexture, previous: WebGLTexture | null): void {
        const gl = this.gl!;
        const scaleX = this.canvas.width / frame.width, scaleY = this.canvas.height / frame.height;
        // The analysis passes may have left an off-screen target and its small viewport bound.
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.useProgram(program.program);
        this.bindQuadAttributes(program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sampled);
        gl.uniform1i(program.uTexture, 0);
        if (previous) {
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, previous);
            gl.uniform1i(program.uPrev, 1);
            gl.activeTexture(gl.TEXTURE0);
        }
        gl.uniform2f(program.uTextureSize, layer.pixels.width, layer.pixels.height);
        if (program.uOutputSize) gl.uniform2f(program.uOutputSize, layer.dest.width * scaleX, layer.dest.height * scaleY);
        const x0 = layer.dest.x * scaleX, y0 = layer.dest.y * scaleY;
        const x1 = x0 + layer.dest.width * scaleX, y1 = y0 + layer.dest.height * scaleY;
        const clip = (x: number, y: number) => [x / this.canvas.width * 2 - 1, 1 - y / this.canvas.height * 2];
        const u0 = layer.source.x / layer.pixels.width, v0 = layer.source.y / layer.pixels.height;
        const u1 = (layer.source.x + layer.source.width) / layer.pixels.width, v1 = (layer.source.y + layer.source.height) / layer.pixels.height;
        const [ax, ay] = clip(x0, y0), [bx, by] = clip(x1, y1);
        this.quad(ax, ay, bx, by, u0, v0, u1, v1);
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(Math.floor(x0), Math.floor(this.canvas.height - y1), Math.ceil(x1 - x0), Math.ceil(y1 - y0));
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.disable(gl.SCISSOR_TEST);
    }

    /** Run the four ScaleFX analysis passes at source size; returns the tag texture, or null if a pass failed to build. */
    private runScaleFx(index: number, source: WebGLTexture, width: number, height: number): WebGLTexture | null {
        const gl = this.gl!;
        const targets = this.scaleFxTargets(index, width, height);
        if (!targets) return null;
        const inputs: Array<[WebGLTexture, WebGLTexture | null]> = [
            [source, null], [targets[0].texture, null], [targets[1].texture, targets[0].texture], [targets[2].texture, null],
        ];
        for (let pass = 0; pass < 4; pass++) {
            const program = this.scaleFxProgram(pass);
            if (!program) return null;
            const target = targets[pass];
            gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
            gl.viewport(0, 0, width, height);
            gl.disable(gl.SCISSOR_TEST);
            gl.useProgram(program.program);
            this.bindQuadAttributes(program);
            const [main, previous] = inputs[pass];
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, main);
            gl.uniform1i(program.uTexture, 0);
            if (previous) {
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, previous);
                gl.uniform1i(program.uPrev, 1);
                gl.activeTexture(gl.TEXTURE0);
            }
            gl.uniform2f(program.uTextureSize, width, height);
            this.quad(-1, 1, 1, -1, 0, 0, 1, 1);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return targets[3].texture;
    }

    private scaleFxTargets(index: number, width: number, height: number): Target[] | null {
        const gl = this.gl!;
        const existing = this.targets.get(index);
        if (existing && existing[0].width === width && existing[0].height === height) return existing;
        if (existing) for (const target of existing) { gl.deleteTexture(target.texture); gl.deleteFramebuffer(target.framebuffer); }
        const targets: Target[] = [];
        for (let pass = 0; pass < 4; pass++) {
            // The metric and strength passes carry fine fractions; keep them in float textures when the GPU allows.
            const target = this.createTarget(width, height, pass < 2 && this.floatTargets);
            if (!target) { for (const made of targets) { gl.deleteTexture(made.texture); gl.deleteFramebuffer(made.framebuffer); } this.targets.delete(index); return null; }
            targets.push(target);
        }
        this.targets.set(index, targets);
        return targets;
    }

    private createTarget(width: number, height: number, float: boolean): Target | null {
        const gl = this.gl!;
        const texture = gl.createTexture(), framebuffer = gl.createFramebuffer();
        if (!texture || !framebuffer) return null;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, float ? gl.FLOAT : gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        if (!complete) {
            gl.deleteTexture(texture); gl.deleteFramebuffer(framebuffer);
            return float ? this.createTarget(width, height, false) : null;
        }
        return { texture, framebuffer, width, height };
    }

    private probeFloatTargets(gl: WebGLRenderingContext): boolean {
        if (!gl.getExtension('OES_texture_float')) return false;
        const texture = gl.createTexture(), framebuffer = gl.createFramebuffer();
        if (!texture || !framebuffer) return false;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.FLOAT, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteTexture(texture); gl.deleteFramebuffer(framebuffer);
        return complete;
    }

    private bindQuadAttributes(program: Program): void {
        const gl = this.gl!;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.enableVertexAttribArray(program.aPosition);
        gl.enableVertexAttribArray(program.aTexCoord);
        gl.vertexAttribPointer(program.aPosition, 2, gl.FLOAT, false, 16, 0);
        gl.vertexAttribPointer(program.aTexCoord, 2, gl.FLOAT, false, 16, 8);
    }

    /** Upload a two-triangle quad from clip corner (ax, ay) to (bx, by) with texture corners (u0, v0) to (u1, v1). */
    private quad(ax: number, ay: number, bx: number, by: number, u0: number, v0: number, u1: number, v1: number): void {
        this.gl!.bufferData(this.gl!.ARRAY_BUFFER, new Float32Array([
            ax, ay, u0, v0,  bx, ay, u1, v0,  ax, by, u0, v1,
            bx, ay, u1, v0,  bx, by, u1, v1,  ax, by, u0, v1,
        ]), this.gl!.STREAM_DRAW);
    }

    private texture(index: number): WebGLTexture {
        const gl = this.gl!;
        while (this.textures.length <= index) {
            const texture = gl.createTexture()!;
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            this.textures.push(texture);
        }
        return this.textures[index];
    }

    private singleProgram(filter: FilterName): Program | null {
        const source = SINGLE_PASS[filter];
        return source ? this.program(filter, VERTEX, source) : null;
    }

    private scaleFxProgram(pass: number): Program | null {
        const { vertex, fragment } = SCALEFX_PASSES[pass];
        return this.program(`scalefx${pass}`, vertex, fragment);
    }

    private program(key: string, vertexSource: string, fragmentSource: string): Program | null {
        if (this.programs.has(key)) return this.programs.get(key) ?? null;
        const gl = this.gl!;
        const compile = (type: number, source: string): WebGLShader | null => {
            const shader = gl.createShader(type);
            if (!shader) return null;
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.warn(`Display filter shader "${key}" failed to compile: ${gl.getShaderInfoLog(shader) ?? ''}`);
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        };
        const vertex = compile(gl.VERTEX_SHADER, vertexSource), fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
        const program = vertex && fragment ? gl.createProgram() : null;
        let result: Program | null = null;
        if (program && vertex && fragment) {
            gl.attachShader(program, vertex);
            gl.attachShader(program, fragment);
            gl.linkProgram(program);
            if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
                result = {
                    program, aPosition: gl.getAttribLocation(program, 'aPosition'), aTexCoord: gl.getAttribLocation(program, 'aTexCoord'),
                    uTexture: gl.getUniformLocation(program, 'uTexture'), uPrev: gl.getUniformLocation(program, 'uPrev'),
                    uTextureSize: gl.getUniformLocation(program, 'uTextureSize'), uOutputSize: gl.getUniformLocation(program, 'uOutputSize'),
                };
            } else {
                console.warn(`Display filter "${key}" failed to link: ${gl.getProgramInfoLog(program) ?? ''}`);
                gl.deleteProgram(program);
            }
        }
        this.programs.set(key, result);
        return result;
    }
}
