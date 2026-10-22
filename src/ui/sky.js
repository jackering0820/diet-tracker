// 夜空背景（畫面層）：一個 WebGL 繪圖區，畫灰藍色的天空、3D 空間裡的星星和頂端的星座。
// 平常完全靜止，只在打開、視窗大小改變、資料變化時畫。
// 打開 App、加水、記一餐時，視角在 3D 空間裡轉動約 2.5 秒後停下，新點亮的星星綻放 RGB 光暈，轉動越快 RGB 分得越開。
// 「減少動態效果」開啟時不轉動，直接畫出結果。
// 不支援 WebGL、或繪圖區被系統收回時，畫布藏起來，改用 CSS 的靜態漸層（styles.css 的 body 背景）和 SVG 星座。
// 設計來自原型（prototype/sky-motion 分支，#37）。

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- 著色器 ----------
const BG_VERTEX = "attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }";

// 天空：上方灰藍、下方接近黑色，加一層淡淡的灰青色星雲
const BG_FRAGMENT = `
precision mediump float;
uniform vec2 uRes;
float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h1(i), h1(i + vec2(1.0, 0.0)), f.x), mix(h1(i + vec2(0.0, 1.0)), h1(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { return 0.5 * vn(p) + 0.25 * vn(p * 2.03 + 7.1) + 0.125 * vn(p * 4.01 + 3.3); }
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 col = mix(vec3(0.039, 0.067, 0.082), vec3(0.169, 0.247, 0.302), smoothstep(0.0, 1.0, uv.y));
  vec2 p = vec2(uv.x * uRes.x / uRes.y, uv.y);
  float n = fbm(p * 1.6), n2 = fbm(p * 3.1 + n * 1.3);
  col += vec3(0.07, 0.15, 0.17) * smoothstep(0.55, 0.95, n2) * 0.35 * smoothstep(0.2, 0.9, uv.y);
  col += vec3(0.10, 0.13, 0.12) * smoothstep(0.60, 0.95, n) * 0.18;
  gl_FragColor = vec4(col, 1.0);
}`;

// 星星：3D 空間裡的點，依視角轉動後做透視投影；越遠越小、越暗。
// uOffset 讓同一批點往旁邊錯開，分成 R、G、B 三次畫，就是 RGB 分光。
const STAR_VERTEX = `
attribute vec3 aPos; attribute float aSize; attribute vec4 aColor;
uniform mat3 uRot; uniform vec3 uPivot; uniform float uDolly; uniform float uFocal; uniform float uAspect;
uniform float uDpr; uniform float uSizeMul; uniform vec2 uOffset;
varying vec4 vColor;
void main() {
  vec3 p = uRot * (aPos - uPivot) + uPivot;
  p.z += uDolly;
  float w = max(-p.z, 0.05);
  gl_Position = vec4(p.x * uFocal / uAspect + uOffset.x * w, p.y * uFocal + uOffset.y * w, 0.0, w);
  gl_PointSize = -p.z < 0.3 ? 0.0 : aSize * uDpr * uSizeMul * 3.0 / w;
  vColor = vec4(aColor.rgb, aColor.a * clamp(5.5 / w, 0.45, 1.0));
}`;

// uMode：0 星星本體、1 柔和光暈、2 彩虹光環（像光穿過稜鏡）
const STAR_FRAGMENT = `
precision mediump float;
varying vec4 vColor; uniform vec3 uMask; uniform float uMode; uniform float uHue;
vec3 rainbow(float h) { return 0.5 + 0.5 * cos(6.2831 * (h + vec3(0.0, 0.33, 0.67))); }
void main() {
  vec2 d = gl_PointCoord * 2.0 - 1.0; float r = length(d);
  if (r > 1.0) discard;
  vec3 c;
  if (uMode < 0.5) c = vColor.rgb * exp(-r * r * 7.0);
  else if (uMode < 1.5) c = vColor.rgb * exp(-r * r * 3.5) * (1.0 - r);
  else {
    float ring = exp(-pow((r - 0.62) / 0.16, 2.0));
    c = (rainbow(r * 1.3 + uHue) * ring * 0.9 + vColor.rgb * exp(-r * r * 6.0) * 0.6) * (1.0 - r);
  }
  gl_FragColor = vec4(c * uMask * vColor.a, 1.0);
}`;

// ---------- 場景 ----------
const STAR_COUNT = 1400;
const FOCAL = 1 / Math.tan((70 * Math.PI) / 360); // 垂直視角 70 度
// 頂端星座的八顆星：和 SVG 星座同樣的排列（390×150 的座標），放進 3D 空間，各自有不同的深度
const CONSTELLATION_PX = [[196, 92], [222, 78], [250, 98], [278, 84], [304, 104], [330, 86], [356, 110], [330, 132]];
const CONSTELLATION_DEPTH = [0.45, -0.35, 0.2, -0.55, 0.3, -0.2, 0.55, 0.05];
const CONSTELLATION = CONSTELLATION_PX.map(([x, y], i) => [0.38 + ((x - 276) / 80) * 0.45, 1.5 - ((y - 78) / 54) * 0.42, -3 + CONSTELLATION_DEPTH[i]]);
// 視角繞著星座的中心轉
const PIVOT = CONSTELLATION.reduce((sum, p) => sum.map((v, i) => v + p[i] / CONSTELLATION.length), [0, 0, 0]);

// ---------- 動畫 ----------
// 停下來時的視角：微微側一點，看得出深度
const REST = { yaw: 0.22, pitch: -0.1, dolly: 0 };
const OPEN_MS = 2600;   // 打開 App：從遠處飛進來
const CHANGE_MS = 2400; // 加水、記一餐：轉過去再回來
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function poseAt(motion, progress) {
  if (!motion) return REST;
  if (motion.kind === "open") {
    const far = 1 - easeOut(progress);
    return { yaw: REST.yaw - 0.9 * far, pitch: REST.pitch + 0.25 * far, dolly: -2.4 * far };
  }
  const swing = Math.sin(Math.PI * easeInOut(progress));
  return { yaw: REST.yaw + 0.55 * swing * motion.dir, pitch: REST.pitch - 0.12 * swing, dolly: 0.6 * swing };
}

// 先繞垂直軸轉（yaw）再上下傾（pitch），依 WebGL 的欄優先排列
function rotation({ yaw, pitch }) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch);
  return new Float32Array([cy, sx * sy, -cx * sy, 0, cx, sx, sy, -sx * cy, cx * cy]);
}

// 固定的亂數種子：每次打開星星都在同樣的位置
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 每顆星 8 個數字：位置 x、y、z，大小，顏色 r、g、b，亮度
function starField() {
  const random = seeded(7);
  const stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    const tint = random();
    const color = tint < 0.08 ? [1, 0.86, 0.78] : tint < 0.2 ? [0.75, 0.86, 1] : [0.9, 0.95, 1];
    stars.push(random() * 7 - 3.5, random() * 9 - 4.5, -1.2 - random() * 8, 0.6 + Math.pow(random(), 3) * 1.8, ...color, 0.55 + random() * 0.45);
  }
  return new Float32Array(stars);
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

function link(gl, vertex, fragment) {
  const vs = compile(gl, gl.VERTEX_SHADER, vertex), fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  const uniform = {};
  for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
    const { name } = gl.getActiveUniform(program, i);
    uniform[name] = gl.getUniformLocation(program, name);
  }
  return { program, uniform };
}

// 把夜空畫在 canvas 上。畫不出來時回傳 null（canvas 維持隱藏，畫面用 CSS 和 SVG 的備案）。
// 回傳的 update(lit, motion)：lit 是星座點亮數；motion 是 "open"（打開 App）、"change"（加水、記一餐）或不動。
export function startSky(canvas) {
  const gl = canvas.getContext("webgl", { antialias: false });
  if (!gl) return null;
  const sky = link(gl, BG_VERTEX, BG_FRAGMENT);
  const stars = link(gl, STAR_VERTEX, STAR_FRAGMENT);
  if (!sky || !stars) return null;

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const field = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, field);
  gl.bufferData(gl.ARRAY_BUFFER, starField(), gl.STATIC_DRAW);
  const points = gl.createBuffer(); // 星座：每次畫的時候重新放
  const attr = {
    pos: gl.getAttribLocation(stars.program, "aPos"),
    size: gl.getAttribLocation(stars.program, "aSize"),
    color: gl.getAttribLocation(stars.program, "aColor"),
    quad: gl.getAttribLocation(sky.program, "p"),
  };

  let lit = 0;
  let motion = null;   // 正在播的動畫：{ kind, start, duration, dir, newStars }
  let lastPose = null; // 上一張畫面的視角和時間，用來算轉動速度
  let swingDir = 1;
  let frame = 0;
  const dpr = () => Math.min(1.5, devicePixelRatio || 1);

  // 同一批點畫一次；spreadPx 大於 0 時分成 R、G、B 三次，往左右錯開
  function drawPoints(buffer, count, { mode, sizeMul = 1, spreadPx = 0, hue = 0 }) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(attr.pos, 3, gl.FLOAT, false, 32, 0);
    gl.vertexAttribPointer(attr.size, 1, gl.FLOAT, false, 32, 12);
    gl.vertexAttribPointer(attr.color, 4, gl.FLOAT, false, 32, 16);
    gl.uniform1f(stars.uniform.uMode, mode);
    gl.uniform1f(stars.uniform.uSizeMul, sizeMul);
    gl.uniform1f(stars.uniform.uHue, hue);
    const dx = (2 * spreadPx * dpr()) / canvas.width;
    const passes = spreadPx < 0.3 ? [[[1, 1, 1], 0]] : [[[1, 0, 0], -dx], [[0, 1, 0], 0], [[0, 0, 1], dx]];
    for (const [mask, offset] of passes) {
      gl.uniform3fv(stars.uniform.uMask, mask);
      gl.uniform2f(stars.uniform.uOffset, offset, 0);
      gl.drawArrays(gl.POINTS, 0, count);
    }
  }
  function drawList(list, options) {
    if (!list.length) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, points);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(list), gl.DYNAMIC_DRAW);
    drawPoints(points, list.length / 8, options);
  }

  function draw(now) {
    const d = dpr();
    const w = Math.round(canvas.clientWidth * d), h = Math.round(canvas.clientHeight * d);
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);

    const progress = motion ? Math.min(1, (now - motion.start) / motion.duration) : 1;
    const pose = poseAt(motion, progress);
    // 轉動速度（每秒幾弧度）：轉得越快，RGB 分得越開
    const speed = lastPose ? (Math.abs(pose.yaw - lastPose.yaw) / Math.max(1, now - lastPose.time)) * 1000 : 0;
    lastPose = motion ? { ...pose, time: now } : null;
    const motionSpread = Math.min(9, speed * 14);

    gl.disable(gl.BLEND);
    gl.useProgram(sky.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(attr.quad);
    gl.vertexAttribPointer(attr.quad, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(sky.uniform.uRes, w, h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(attr.quad);

    // 星星用加法混色：重疊的地方更亮，像光
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(stars.program);
    for (const a of [attr.pos, attr.size, attr.color]) gl.enableVertexAttribArray(a);
    gl.uniformMatrix3fv(stars.uniform.uRot, false, rotation(pose));
    gl.uniform3fv(stars.uniform.uPivot, PIVOT);
    gl.uniform1f(stars.uniform.uDolly, pose.dolly);
    gl.uniform1f(stars.uniform.uFocal, FOCAL);
    gl.uniform1f(stars.uniform.uAspect, w / h);
    gl.uniform1f(stars.uniform.uDpr, d);
    drawPoints(field, STAR_COUNT, { mode: 0, sizeMul: 3.2, spreadPx: motionSpread });

    // 星座：點亮的星星之間連成發光的線（沿著線排一串小光點）
    const line = [];
    for (let i = 0; i + 1 < lit; i++) {
      const [a, b] = [CONSTELLATION[i], CONSTELLATION[i + 1]];
      for (let k = 0; k <= 40; k++) {
        const t = k / 40;
        line.push(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 5, 0.55, 0.85, 1, 0.45);
      }
    }
    drawList(line, { mode: 1, spreadPx: Math.max(0.8, motionSpread) });

    // 星座的八顆星：沒點亮是暗的小點；點亮的有光暈和 RGB 彩虹光環，新點亮的會綻放
    const dim = [], cores = [], glows = [], rings = [], blooms = [];
    CONSTELLATION.forEach((star, i) => {
      if (i >= lit) { dim.push(...star, 6, 0.92, 0.93, 1, 0.7); return; }
      const isNew = motion?.newStars.includes(i);
      const bloom = isNew ? Math.exp(-Math.pow((progress - 0.25) / 0.2, 2)) : 0;
      cores.push(...star, 9 + 8 * bloom, 0.85, 0.94, 1, 1);
      glows.push(...star, 28, 0.43, 0.83, 1, 0.5);
      if (isNew) blooms.push(...star, 52 * (1 + 1.6 * bloom + 0.2 * progress), 1, 1, 1, 0.35 + 1.4 * bloom);
      else rings.push(...star, 52, 1, 1, 1, 0.35);
    });
    drawList(dim, { mode: 0 });
    drawList(glows, { mode: 1 });
    drawList(rings, { mode: 2, spreadPx: 1.6 + motionSpread * 0.5 });
    drawList(blooms, { mode: 2, spreadPx: 2 + 12 * (1 - progress), hue: progress * 0.6 });
    drawList(cores, { mode: 0 });
    for (const a of [attr.pos, attr.size, attr.color]) gl.disableVertexAttribArray(a);
  }

  // 動畫期間每一幀都畫；播完再畫一張靜止的就停下來
  function tick(now) {
    draw(now);
    if (motion && now - motion.start < motion.duration) {
      frame = requestAnimationFrame(tick);
    } else {
      motion = null;
      lastPose = null;
      frame = 0;
      draw(now);
    }
  }

  let resizing = 0;
  addEventListener("resize", () => {
    cancelAnimationFrame(resizing);
    resizing = requestAnimationFrame(() => { if (!motion) draw(performance.now()); });
  });
  // 系統收回繪圖區時退回 CSS 背景，不再嘗試重畫
  canvas.addEventListener("webglcontextlost", () => { canvas.hidden = true; });
  canvas.hidden = false; // 先顯示才量得到大小

  return {
    update(nextLit, kind) {
      const before = lit;
      lit = nextLit;
      if (!kind || reduceMotion()) {
        if (!motion) draw(performance.now());
        return;
      }
      if (kind === "change") swingDir = -swingDir; // 每次往不同方向轉
      const newStars = Array.from({ length: Math.max(0, lit - before) }, (_, k) => before + k);
      motion = { kind, start: performance.now(), duration: kind === "open" ? OPEN_MS : CHANGE_MS, dir: swingDir, newStars };
      lastPose = null;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    },
  };
}
