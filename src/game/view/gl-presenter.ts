/**
 * Presents the stage through WebGL so a pixel-art filter can upscale the
 * game's 1× pixels on the GPU, the way RetroArch shaders do.
 *
 * The stage keeps composing on its 2D canvas; this presenter redraws the
 * same layers (level, panel, menu picture) from their source pixels onto a
 * second canvas that sits on top, with the chosen filter.
 */

export type FilterName = 'sharp' | 'smooth' | 'crt' | 'scanlines';
export const FILTERS: readonly FilterName[] = ['sharp', 'smooth', 'crt', 'scanlines'];
export const FILTER_LABELS: Readonly<Record<FilterName, string>> = { sharp: 'SHARP', smooth: 'SMOOTH', crt: 'CRT', scanlines: 'SCANLINES' };

export interface PresentPixels { data: Uint8ClampedArray; width: number; height: number }
export interface PresentRect { x: number; y: number; width: number; height: number }
export interface PresentLayer { pixels: PresentPixels; source: PresentRect; dest: PresentRect }
/** Everything the stage drew, in the stage canvas's own pixel coordinates. */
export interface PresentFrame { width: number; height: number; layers: PresentLayer[] }

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

const HEADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
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

const SOURCES: Record<FilterName, string> = { sharp: SHARP, smooth: SMOOTH, crt: CRT, scanlines: SCANLINES };

interface Program { program: WebGLProgram; aPosition: number; aTexCoord: number; uTextureSize: WebGLUniformLocation | null; uOutputSize: WebGLUniformLocation | null }

export class GlPresenter {
    private gl: WebGLRenderingContext | null;
    private programs = new Map<FilterName, Program | null>();
    private textures: WebGLTexture[] = [];
    private buffer: WebGLBuffer | null = null;

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
        const program = this.programFor(filter);
        if (!program) return false;
        const scaleX = this.canvas.width / frame.width, scaleY = this.canvas.height / frame.height;
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.disable(gl.SCISSOR_TEST);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(program.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.enableVertexAttribArray(program.aPosition);
        gl.enableVertexAttribArray(program.aTexCoord);
        gl.vertexAttribPointer(program.aPosition, 2, gl.FLOAT, false, 16, 0);
        gl.vertexAttribPointer(program.aTexCoord, 2, gl.FLOAT, false, 16, 8);
        frame.layers.forEach((layer, index) => {
            const texture = this.texture(index);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, layer.pixels.width, layer.pixels.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, layer.pixels.data);
            gl.uniform2f(program.uTextureSize, layer.pixels.width, layer.pixels.height);
            gl.uniform2f(program.uOutputSize, layer.dest.width * scaleX, layer.dest.height * scaleY);
            const x0 = layer.dest.x * scaleX, y0 = layer.dest.y * scaleY;
            const x1 = x0 + layer.dest.width * scaleX, y1 = y0 + layer.dest.height * scaleY;
            const clip = (x: number, y: number) => [x / this.canvas.width * 2 - 1, 1 - y / this.canvas.height * 2];
            const u0 = layer.source.x / layer.pixels.width, v0 = layer.source.y / layer.pixels.height;
            const u1 = (layer.source.x + layer.source.width) / layer.pixels.width, v1 = (layer.source.y + layer.source.height) / layer.pixels.height;
            const [ax, ay] = clip(x0, y0), [bx, by] = clip(x1, y1);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
                ax, ay, u0, v0,  bx, ay, u1, v0,  ax, by, u0, v1,
                bx, ay, u1, v0,  bx, by, u1, v1,  ax, by, u0, v1,
            ]), gl.STREAM_DRAW);
            gl.enable(gl.SCISSOR_TEST);
            gl.scissor(Math.floor(x0), Math.floor(this.canvas.height - y1), Math.ceil(x1 - x0), Math.ceil(y1 - y0));
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        });
        gl.disable(gl.SCISSOR_TEST);
        return true;
    }

    public dispose(): void {
        const gl = this.gl;
        if (!gl) return;
        for (const texture of this.textures) gl.deleteTexture(texture);
        this.textures = [];
        for (const program of this.programs.values()) if (program) gl.deleteProgram(program.program);
        this.programs.clear();
        if (this.buffer) gl.deleteBuffer(this.buffer);
        this.buffer = null;
        this.gl = null;
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

    private programFor(filter: FilterName): Program | null {
        if (this.programs.has(filter)) return this.programs.get(filter) ?? null;
        const gl = this.gl!;
        const compile = (type: number, source: string): WebGLShader | null => {
            const shader = gl.createShader(type);
            if (!shader) return null;
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); return null; }
            return shader;
        };
        const vertex = compile(gl.VERTEX_SHADER, VERTEX), fragment = compile(gl.FRAGMENT_SHADER, SOURCES[filter]);
        const program = vertex && fragment ? gl.createProgram() : null;
        let result: Program | null = null;
        if (program && vertex && fragment) {
            gl.attachShader(program, vertex);
            gl.attachShader(program, fragment);
            gl.linkProgram(program);
            if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
                result = {
                    program, aPosition: gl.getAttribLocation(program, 'aPosition'), aTexCoord: gl.getAttribLocation(program, 'aTexCoord'),
                    uTextureSize: gl.getUniformLocation(program, 'uTextureSize'), uOutputSize: gl.getUniformLocation(program, 'uOutputSize'),
                };
            } else gl.deleteProgram(program);
        }
        this.programs.set(filter, result);
        return result;
    }
}
