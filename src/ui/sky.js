// 夜空背景（畫面層）：一個 WebGL 繪圖區，只在打開和視窗大小改變時畫一次，平常完全靜止，不耗電。
// 不支援 WebGL、或繪圖區被系統收回時，畫布藏起來，改用 CSS 的靜態漸層和星點（styles.css 的 body 背景）。

const VERTEX = "attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }";

// 冷色夜空：上方深石油藍、下方深海軍藍，一層淡淡的星雲，兩層大小不同的星星。
const FRAGMENT = `
precision mediump float;
uniform vec2 uRes;
uniform float uDpr;
float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h1(i), h1(i + vec2(1.0, 0.0)), f.x), mix(h1(i + vec2(0.0, 1.0)), h1(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { return 0.5 * vn(p) + 0.25 * vn(p * 2.03 + 7.1) + 0.125 * vn(p * 4.01 + 3.3); }
void main() {
  vec2 fc = gl_FragCoord.xy, uv = fc / uRes;
  vec3 col = mix(vec3(0.031, 0.098, 0.169), vec3(0.055, 0.208, 0.314), smoothstep(0.0, 1.0, uv.y));
  vec2 p = vec2(uv.x * uRes.x / uRes.y, uv.y);
  float n = fbm(p * 1.6), n2 = fbm(p * 3.1 + n * 1.3);
  col += vec3(0.04, 0.22, 0.30) * smoothstep(0.55, 0.95, n2) * 0.35 * smoothstep(0.2, 0.9, uv.y);
  col += vec3(0.05, 0.25, 0.20) * smoothstep(0.60, 0.95, n) * 0.18;
  for (int L = 0; L < 2; L++) {
    float fl = float(L), cs = (fl < 0.5 ? 13.0 : 29.0) * uDpr;
    vec2 cell = floor(fc / cs); float h = h1(cell + fl * 7.3);
    vec2 cc = (cell + 0.5) * cs + (vec2(h1(cell + 1.9 + fl), h1(cell + 5.1 + fl)) - 0.5) * cs * 0.7;
    float on = step(fl < 0.5 ? 0.90 : 0.80, h), r = (fl < 0.5 ? 0.55 : 1.0) * uDpr;
    col += vec3(0.86, 0.93, 1.0) * (1.0 - smoothstep(r * 0.4, r * 1.6, length(fc - cc))) * on * (fl < 0.5 ? 0.45 : 0.85) * (0.6 + 0.4 * h);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

// 把夜空畫在 canvas 上；畫不出來時 canvas 維持隱藏，畫面就用 CSS 的備案。
export function startSky(canvas) {
  const gl = canvas.getContext("webgl", { antialias: false });
  if (!gl) return;
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX), fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  if (!vs || !fs) return;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const at = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(at);
  gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(program, "uRes"), uDpr = gl.getUniformLocation(program, "uDpr");

  function draw() {
    const dpr = Math.min(1.5, devicePixelRatio || 1);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (!w || !h) return;
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uRes, w, h);
    gl.uniform1f(uDpr, dpr);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  let pending = 0;
  addEventListener("resize", () => { cancelAnimationFrame(pending); pending = requestAnimationFrame(draw); });
  // 系統收回繪圖區時退回 CSS 背景，不再嘗試重畫
  canvas.addEventListener("webglcontextlost", () => { canvas.hidden = true; });
  canvas.hidden = false; // 先顯示才量得到大小
  draw();
}
