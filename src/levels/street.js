import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// 스테이지 1 「네온 스트리트」
// 한 줄로 이어지는 경로: 골목 → 큰길(옆 골목) → 광장 → 좁은 시장 골목 → 대로 → 타워 광장.
// 끝에는 거대한 타워가 빛기둥을 쏘아 올린다. 에셋 파일 없이 기하학 + 캔버스 텍스처만 쓴다.

const NEON = [0x00e5ff, 0xff2bd6, 0xffb347, 0x9b7bff, 0xff4d6d];
const FOG = 0x2a2531;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const col = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
const hexStr = (c) => '#' + new THREE.Color(c).getHexString();
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };

// 구역 사이의 붉은 자기장 위치 (z). 구역의 적을 모두 처치해야 열린다.
export const GATE_Z = [-62, -125, -186, -256, -336, -405, -470, -566, -666, -756, -815, -876];
// 한 줄로 이어지는 주 경로(R0~R9) + 옆 골목/안뜰/골목 속 틈. h: 주변 건물 높이 범위. style: 외벽 종류 고정(0 주거 1 업무 2 산업)
const MAIN_RECTS = [
  { x0: -4.5, x1: 4.5, z0: -67, z1: 8, h: [26, 60] },            // 0 새벽 골목
  { x0: -11, x1: 11, z0: -191, z1: -57, h: [45, 110] },          // 1 시장 큰길
  { x0: -26, x1: 26, z0: -261, z1: -181, h: [60, 140] },         // 2 먹자 광장
  { x0: -7, x1: 7, z0: -341, z1: -251, h: [24, 55] },            // 3 좁은 시장 골목
  { x0: -12, x1: 12, z0: -475, z1: -331, h: [55, 130] },         // 4 네온 대로
  { x0: -10, x1: 10, z0: -571, z1: -465, h: [40, 90] },          // 5 오락 거리
  { x0: -14, x1: 14, z0: -671, z1: -561, h: [30, 80], style: 2 },// 6 공사 지구
  { x0: -30, x1: 30, z0: -761, z1: -661, h: [70, 150] },         // 7 지하철 광장
  { x0: -13, x1: 13, z0: -881, z1: -751, h: [60, 140] },         // 8 고가 아래 대로
  { x0: -34, x1: 34, z0: -985, z1: -871, h: [70, 160], open: [-16, 16] }, // 9 타워 광장 (앞쪽이 트여 있다)
];
const BRANCHES = [
  { x0: -42, x1: -9, z0: -112, z1: -103, h: [22, 50] },
  { x0: 9, x1: 26, z0: -150, z1: -132, h: [30, 70] },
  { x0: -46, x1: -26, z0: -232, z1: -217, h: [30, 70] },
  { x0: 26, x1: 46, z0: -247, z1: -230, h: [30, 70] },
  { x0: 7, x1: 30, z0: -302, z1: -293, h: [24, 50] },
  { x0: -32, x1: -12, z0: -422, z1: -413, h: [40, 90] },
  { x0: 12, x1: 36, z0: -402, z1: -392, h: [40, 90] },
  { x0: 10, x1: 38, z0: -522, z1: -514, h: [30, 70] },
  { x0: -40, x1: -14, z0: -622, z1: -612, h: [24, 60], style: 2 },
  { x0: 14, x1: 40, z0: -642, z1: -632, h: [24, 60], style: 2 },
  { x0: -52, x1: -30, z0: -702, z1: -692, h: [40, 90] },
  { x0: 30, x1: 52, z0: -722, z1: -712, h: [40, 90] },
  { x0: 13, x1: 36, z0: -822, z1: -812, h: [40, 90] },
  { x0: -36, x1: -13, z0: -842, z1: -832, h: [40, 90] },
];
// ---- 타워 내부: 거리에서 멀리 떨어진 곳(x=600)에 층마다 닫힌 방을 둔다. 엘리베이터 발판으로 순간이동한다 ----
export const TOWER_X = 600;
export const ROOMS = [
  { name: '타워 1층 · 로비', z: -200, half: 22, theme: 0x00e5ff, kind: 'lobby' },
  { name: '타워 2층 · 서버실', z: -360, half: 22, theme: 0x3dff9a, kind: 'server' },
  { name: '타워 3층 · 연구실', z: -520, half: 24, theme: 0xff2bd6, kind: 'lab' },
  { name: '타워 4층 · 전망 회랑', z: -680, half: 22, theme: 0xffb347, kind: 'gallery' },
  { name: '최상층 · 시계실', z: -860, half: 30, theme: 0xff3b30, kind: 'clock' },
];
const ROOM_RECTS = ROOMS.map((m) => ({ x0: TOWER_X - m.half + 2, x1: TOWER_X + m.half - 2, z0: m.z - m.half + 2, z1: m.z + m.half - 2 }));

const RECTS = [...MAIN_RECTS, ...BRANCHES];
// 이동 판정용 영역: 옆 골목이 큰길과 딱 맞닿기만 하면 경계에 걸을 수 없는 틈이 생긴다.
// 맞닿은 쪽으로 1.5m 겹치게 늘려 걸어서도 드나들 수 있게 한다 (건물 배치는 RECTS 그대로).
const WALK = [...MAIN_RECTS, ...BRANCHES.map((b) => {
  const w = { ...b };
  for (const m of MAIN_RECTS) {
    if (Math.min(b.z1, m.z1) - Math.max(b.z0, m.z0) <= 0) continue;
    if (Math.abs(b.x0 - m.x1) < 0.01) w.x0 -= 1.5;
    if (Math.abs(b.x1 - m.x0) < 0.01) w.x1 += 1.5;
  }
  return w;
}), ...ROOM_RECTS];
const MAIN = MAIN_RECTS.map((_, i) => i); // 전선/증기가 걸리는 주 경로


function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---- 건물 외벽 텍스처: 256px = 8m. map(재질감)과 emissiveMap(켜진 창) 한 쌍 ----
function facade(variant) {
  const [c, g] = canvas(256, 256);
  const [e, ge] = canvas(256, 256);
  g.fillStyle = ['#1a1d33', '#171a2c', '#1d1b2e'][variant]; g.fillRect(0, 0, 256, 256);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) { // 얼룩/노이즈
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.05})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 6);
  }
  for (let i = 0; i < 26; i++) { // 빗물 얼룩 (위에서 아래로 흘러내린 때)
    const x = Math.random() * 256, w = 2 + Math.random() * 10, y0 = Math.random() * 200;
    const gr = g.createLinearGradient(0, y0, 0, y0 + 60 + Math.random() * 120);
    gr.addColorStop(0, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x, y0, w, 200);
  }
  const lit = () => pick(['#ffcf8a', '#ffb866', '#ffe2b0', '#ffd9a0', '#ffc27a', '#a8c8ff', '#d8ccff']);
  if (variant === 0) { // 주거형: 창문 격자
    for (let r = 0; r < 3; r++) {
      g.fillStyle = '#0e1020'; g.fillRect(0, r * 85 + 78, 256, 5);
      for (let k = 0; k < 4; k++) {
        const x = k * 64 + 14, y = r * 85 + 16, w = 36, h = 52;
        g.fillStyle = '#0a0b16'; g.fillRect(x, y, w, h);
        g.strokeStyle = '#2a2e4a'; g.lineWidth = 2; g.strokeRect(x, y, w, h);
        if (Math.random() < 0.38) {
          // 실내등: 위가 밝고 아래로 어두워지는 빛 + 커튼/블라인드
          const gr = ge.createLinearGradient(0, y, 0, y + h);
          gr.addColorStop(0, lit()); gr.addColorStop(1, '#2a1a10');
          ge.globalAlpha = rnd(0.3, 0.75); ge.fillStyle = gr;
          ge.fillRect(x + 2, y + 2, w - 4, h - 4);
          ge.globalAlpha = 1; ge.fillStyle = '#000';
          if (Math.random() < 0.5) ge.fillRect(x + 2, y + 2, rnd(6, 14), h - 4);           // 커튼
          if (Math.random() < 0.4) for (let b = y + 6; b < y + h * rnd(0.3, 0.7); b += 5) ge.fillRect(x + 2, b, w - 4, 2); // 블라인드
        }
      }
    }
  } else if (variant === 1) { // 업무형: 띠창
    for (let r = 0; r < 3; r++) {
      const y = r * 85 + 22;
      g.fillStyle = '#0b0c18'; g.fillRect(0, y, 256, 40);
      for (let x = 0; x < 256; x += 32) { g.fillStyle = '#262a44'; g.fillRect(x, y, 3, 40); }
      for (let x = 0; x < 256; x += 32) if (Math.random() < 0.42) {
        ge.globalAlpha = rnd(0.2, 0.5); ge.fillStyle = pick(['#e8f0ff', '#d0e4ff', '#fff0d8']);
        ge.fillRect(x + 3, y + 2, 29, 36); ge.globalAlpha = 1;
      }
    }
  } else { // 산업형: 패널 + 작은 창 + 배관
    for (let x = 0; x < 256; x += 42) { g.fillStyle = '#10121f'; g.fillRect(x, 0, 3, 256); }
    for (let y = 0; y < 256; y += 64) { g.fillStyle = '#10121f'; g.fillRect(0, y, 256, 3); }
    for (let i = 0; i < 7; i++) {
      const x = Math.floor(Math.random() * 6) * 42 + 12, y = Math.floor(Math.random() * 4) * 64 + 20;
      g.fillStyle = '#08090f'; g.fillRect(x, y, 18, 22);
      if (Math.random() < 0.5) { ge.globalAlpha = rnd(0.4, 0.9); ge.fillStyle = lit(); ge.fillRect(x + 2, y + 2, 14, 18); ge.globalAlpha = 1; }
    }
    g.fillStyle = '#0c0d18'; g.fillRect(200, 0, 10, 256);
  }
  return new THREE.MeshStandardMaterial({ map: tex(c, true), emissiveMap: tex(e, true), emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.92, metalness: 0.05 });
}

// ---- 간판 아틀라스 (한 장의 텍스처에 모든 간판을 그려 한 번에 그린다) ----
const V_TEXT = ['노래방', '치킨', '약국', 'PC방', '호프', '분식', '모텔', '당구장', '24시', '국밥', '오락실', '만화방', '포차', '커피', '안경', '헤어'];
// 상점 종류별 간판 이름 (H_TEXT 인덱스로 쓴다)
const SHOP_NAMES = {
  편의점: ['네온 편의점', '24 편의점'], 치킨: ['황금 치킨', '치킨 왕'], 국밥: ['24시 해장국', '할매 국밥'],
  분식: ['할매 떡볶이', '분식 천국'], PC방: ['스타 PC방', '게임존 PC'], 노래방: ['별빛 노래방', '코인 노래방'],
  호프: ['청춘 포차', '호프 한잔'], 카페: ['달빛 카페', 'CAFE 서울'], 약국: ['사이버 약국', '온누리 약국'],
  휴대폰: ['모바일 대리점', '휴대폰 할인'], 미용실: ['네온 헤어', '헤어 살롱'], 고기: ['고기 굽는 집', '삼겹살 천국'],
};
const H_TEXT = Object.values(SHOP_NAMES).flat();
function atlas(texts, cw, ch, cols, vertical) {
  const rows = Math.ceil(texts.length / cols);
  const [c, g] = canvas(cw * cols, ch * rows);
  const font = (s) => `bold ${s}px "Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",sans-serif`;
  texts.forEach((t, i) => {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
    const color = hexStr(NEON[i % NEON.length]);
    g.save(); g.translate(x, y);
    g.fillStyle = 'rgba(20,10,40,0.55)'; g.fillRect(10, 10, cw - 20, ch - 20);
    g.strokeStyle = color; g.lineWidth = 5; g.shadowColor = color; g.shadowBlur = 18;
    g.strokeRect(14, 14, cw - 28, ch - 28);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (vertical) {
      const chars = [...t]; const s = Math.min(cw * 0.6, (ch - 60) / chars.length);
      g.font = font(s);
      chars.forEach((k, j) => { g.fillText(k, cw / 2, 30 + s * (j + 0.5)); g.fillText(k, cw / 2, 30 + s * (j + 0.5)); });
    } else {
      let s = ch * 0.55; g.font = font(s);
      while (g.measureText(t).width > cw - 60 && s > 16) { s -= 3; g.font = font(s); }
      g.fillText(t, cw / 2, ch / 2 + 2); g.fillText(t, cw / 2, ch / 2 + 2);
    }
    g.restore();
  });
  return { texture: tex(c), cols, rows, count: texts.length };
}
function atlasPlane(at, idx, w, h) {
  const geo = new THREE.PlaneGeometry(w, h);
  const uv = geo.attributes.uv;
  const cx = idx % at.cols, cy = Math.floor(idx / at.cols);
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (cx + uv.getX(i)) / at.cols, 1 - (cy + 1) / at.rows + uv.getY(i) / at.rows);
  }
  return geo;
}

function radialTex(inner = 'rgba(255,255,255,1)') {
  const [c, g] = canvas(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return tex(c);
}

// 높이 y0부터 쌓는 상자. UV를 월드 크기(8m 타일)에 맞춰 창문 크기가 일정하게 보이게 한다.
function box(cx, cz, sx, sy, sz, y0 = 0) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const uv = g.attributes.uv;
  const ou = Math.floor(rnd(0, 4)) * 0.25;
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, uv.getX(i) * dims[f][0] / 8 + ou, uv.getY(i) * dims[f][1] / 8 + y0 / 8);
  }
  g.translate(cx, y0 + sy / 2, cz);
  return g;
}

function instanced(geo, mat, list) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  list.forEach((it, i) => { im.setMatrixAt(i, m.compose(it.p, q, it.s)); im.setColorAt(i, it.c); });
  im.count = list.length;
  return im;
}

export function buildStreet(scene) {
  scene.background = new THREE.Color(FOG);
  scene.fog = new THREE.FogExp2(FOG, 0.0088);

  scene.add(new THREE.HemisphereLight(0x8a7f98, 0x1a120c, 1.1));
  const towerLight = new THREE.DirectionalLight(0xff8ad8, 0.45); towerLight.position.set(0, 60, -300); scene.add(towerLight);
  const back = new THREE.DirectionalLight(0x3fc8ff, 0.45); back.position.set(-30, 40, 120); scene.add(back);

  // ---- 하늘: 지평선은 연보라 안개, 위로 갈수록 짙은 남색, 타워 쪽이 밝다 ----
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: { top: { value: col(0x070a22) }, hor: { value: col(FOG) }, glow: { value: col(0x7a5a78) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 glow; varying vec3 vP;
      void main(){ vec3 n = normalize(vP); float h = clamp(n.y, 0.0, 1.0);
        vec3 c = mix(hor, top, pow(h, 0.55));
        float toward = max(0.0, -n.z);
        c += glow * pow(toward, 6.0) * exp(-h * 3.0) * 0.6;
        gl_FragColor = vec4(c, 1.0); }`
  }));
  sky.renderOrder = -20;
  scene.add(sky);

  // ---- 낡고 더러운 아스팔트: 금, 기름때, 덧댄 자국 (16m 타일) ----
  {
    const [c, g] = canvas(512, 512);
    g.fillStyle = '#4a4642'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9000; i++) { // 자갈 알갱이
      const v = 45 + Math.random() * 55;
      g.fillStyle = `rgba(${v},${v - 2},${v - 4},${0.3 + Math.random() * 0.4})`;
      g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    for (let i = 0; i < 7; i++) { // 덧댄 아스팔트 조각
      g.fillStyle = `rgba(${34 + Math.random() * 14},${32 + Math.random() * 12},${30},0.85)`;
      g.fillRect(Math.random() * 450, Math.random() * 450, 30 + Math.random() * 120, 20 + Math.random() * 90);
    }
    for (let i = 0; i < 26; i++) { // 기름때 / 젖은 얼룩
      const x = Math.random() * 512, y = Math.random() * 512, r = 10 + Math.random() * 50;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(14,13,14,0.6)'); gr.addColorStop(1, 'rgba(14,13,14,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * (0.4 + Math.random() * 0.6), Math.random() * 3, 0, 7); g.fill();
    }
    g.strokeStyle = 'rgba(6,6,6,0.8)'; g.lineCap = 'round';
    for (let i = 0; i < 16; i++) { // 갈라진 금
      let x = Math.random() * 512, y = Math.random() * 512;
      g.lineWidth = 1 + Math.random() * 2; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += (Math.random() - 0.5) * 50; y += (Math.random() - 0.5) * 50; g.lineTo(x, y); }
      g.stroke();
    }
    g.fillStyle = 'rgba(190,175,110,0.35)'; // 거의 지워진 노면 표시
    for (let y = 0; y < 512; y += 64) if (Math.random() < 0.6) g.fillRect(250, y, 10, 30);
    const t = tex(c, true); t.repeat.set(150, 150);
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: t, color: 0xd6d0c6, roughness: 0.9, metalness: 0.0, envMapIntensity: 0.15 })));
  }

  const facades = [facade(0), facade(1), facade(2)];
  const geos = [[], [], []];
  const glow = [];  // 발광 디테일 {p, s, c}
  const dark = [];  // 어두운 디테일 (실외기, 차양, 난간)
  const vSigns = [], hSigns = [];
  const inner = [];  // 상점 실내 (조명 영향 없는 단색)
  const glass = [];  // 유리창 평면
  const vAt = atlas(V_TEXT, 128, 384, 8, true);
  const hAt = atlas(H_TEXT, 512, 128, 4, false);

  const overlapsWalk = (x0, x1, z0, z1, m = -0.05) =>
    RECTS.some((r) => x1 > r.x0 - m && x0 < r.x1 + m && z1 > r.z0 - m && z0 < r.z1 + m);

  // ---- 3D 상점 ----
  // a~b: 면을 따라가는 구간. 유리는 건물 바깥선에서 G만큼 안쪽. put()의 w는 유리에서 안쪽으로 들어간 깊이.
  const KINDS = ['편의점', '치킨', '국밥', '분식', 'PC방', '노래방', '호프', '카페', '약국', '휴대폰', '미용실', '고기', '셔터', '임대'];
  const NAME_IDX = {};
  { let i = 0; for (const [k, list] of Object.entries(SHOP_NAMES)) NAME_IDX[k] = list.map(() => i++); }
  const PALS = {
    편의점: { wall: 0xdfe8ef, floor: 0xb8c4cc, light: 0xeaf4ff, k: 0.85 },
    치킨: { wall: 0xffcf8a, floor: 0x8a5a3a, light: 0xffe0a8, k: 0.6 },
    국밥: { wall: 0xf0d8b0, floor: 0x7a5a40, light: 0xffe8c0, k: 0.6 },
    분식: { wall: 0xffe0c0, floor: 0x9a6a4a, light: 0xfff0d0, k: 0.65 },
    고기: { wall: 0xc88a5a, floor: 0x5a3a28, light: 0xffc890, k: 0.55 },
    PC방: { wall: 0x1a2458, floor: 0x10142a, light: 0x6a8aff, k: 0.45 },
    노래방: { wall: 0x5a1a5a, floor: 0x1a0a1a, light: 0xff5ad8, k: 0.45 },
    호프: { wall: 0x6a3a1a, floor: 0x2a1a10, light: 0xffb060, k: 0.5 },
    카페: { wall: 0xc89a6a, floor: 0x6a4a30, light: 0xffd8a0, k: 0.6 },
    약국: { wall: 0xe8f8f0, floor: 0xc0d0c8, light: 0xeafff4, k: 0.8 },
    휴대폰: { wall: 0xf0f2ff, floor: 0xd0d4e0, light: 0xffffff, k: 0.85 },
    미용실: { wall: 0xffe8f4, floor: 0xd8c8d0, light: 0xfff4fa, k: 0.8 },
    임대: { wall: 0x2a2c38, floor: 0x1a1c24, light: 0, k: 0.25 },
  };
  function shop(a, b, at, along, nx, nz, D, GH) {
    const kind = pick(KINDS);
    const W = b - a, mid = (a + b) / 2, G = 0.25;
    const put = (list, u, y, w, su, sy, sw, c) => list.push({ p: at(u, y, -(G + w)), s: along(su, sy, sw), c });
    const frame = col(0x1a1c26);

    if (kind === '셔터') { // 셔터 내린 가게
      put(dark, mid, GH / 2, 0, W, GH - 0.1, 0.12, col(0x4a4e5a));
      for (let y = 0.3; y < GH - 0.2; y += 0.28) put(dark, mid, y, -0.07, W, 0.05, 0.03, col(0x2a2d36));
      put(dark, mid, GH - 0.25, -0.1, W + 0.1, 0.4, 0.3, col(0x3a3e48));
      return;
    }
    const PAL = PALS[kind];
    const tint = (hex, k = PAL.k) => col(hex, k);
    const DI = D - G; // 실내 깊이
    put(inner, mid, 0.02, DI / 2, W, 0.04, DI, tint(PAL.floor, PAL.k * 0.8));         // 바닥
    put(inner, mid, GH / 2, DI - 0.05, W, GH, 0.1, tint(PAL.wall));                    // 뒷벽
    put(inner, a + 0.05, GH / 2, DI / 2, 0.1, GH, DI, tint(PAL.wall, PAL.k * 0.8));    // 옆벽
    put(inner, b - 0.05, GH / 2, DI / 2, 0.1, GH, DI, tint(PAL.wall, PAL.k * 0.8));
    put(inner, mid, GH - 0.05, DI / 2, W, 0.1, DI, tint(PAL.wall, PAL.k * 0.5));       // 천장
    if (PAL.light) for (let w = 0.6; w < DI - 0.3; w += 1.0) put(glow, mid, GH - 0.14, w, W * 0.8, 0.06, 0.18, col(PAL.light, 1.3)); // 천장 조명

    const rowsU = (step, fn) => { for (let u = a + 0.9; u < b - 0.7; u += step) fn(u); };
    switch (kind) {
      case '편의점':
      case '약국': {
        const goods = kind === '약국' ? [0xffffff, 0xd8f0ff, 0x8ad8b0] : [0xff5a5a, 0xffd25a, 0x5ad2ff, 0x7aff9a, 0xff9ad2, 0xffffff];
        for (const w of [0.9, 1.8]) {
          put(inner, mid - W * 0.12, 0.8, w, W * 0.55, 1.6, 0.45, col(0x8a96a6, 0.6));          // 진열대
          for (const y of [0.45, 0.85, 1.25]) rowsU(0.22, (u) => {
            if (u > mid + W * 0.15 || Math.random() < 0.2) return;
            const hh = rnd(0.15, 0.3);
            put(inner, u, y + 0.15 + hh / 2, w, 0.16, hh, 0.14, col(pick(goods), 0.9));         // 상품
          });
        }
        put(glow, mid, 1.15, DI - 0.2, W * 0.75, 2.0, 0.08, col(kind === '약국' ? 0xd8fff0 : 0xcfe8ff, 0.9)); // 냉장 진열장
        put(inner, b - 1.1, 0.5, 0.6, 1.4, 1.0, 0.6, col(0x6a7080, 0.7));                           // 계산대
        if (kind === '약국') {
          put(glow, mid, 3.0, DI - 0.3, 0.22, 0.8, 0.05, col(0x18e87a, 2));
          put(glow, mid, 3.0, DI - 0.3, 0.8, 0.22, 0.05, col(0x18e87a, 2));
        }
        break;
      }
      case '치킨': case '국밥': case '분식': case '고기':
        rowsU(1.9, (u) => {
          for (const w of [0.8, 1.9]) {
            put(inner, u, 0.74, w, 1.0, 0.06, 0.8, col(0x6a3a20, 0.7));     // 상판
            put(dark, u, 0.36, w, 0.1, 0.72, 0.1, col(0x2a1a10));          // 다리
            put(dark, u - 0.62, 0.23, w, 0.32, 0.45, 0.32, col(0x3a2a1a)); // 의자
            put(dark, u + 0.62, 0.23, w, 0.32, 0.45, 0.32, col(0x3a2a1a));
            if (kind === '고기') put(glow, u, 0.8, w, 0.35, 0.06, 0.35, col(0xff5a20, 1.6)); // 불판
          }
        });
        put(inner, mid, 2.2, DI - 0.12, W * 0.5, 0.7, 0.05, col(0xfff4e0, 0.95)); // 메뉴판
        if (kind === '분식') put(glow, a + 1.2, 1.0, 0.5, 1.2, 0.08, 0.7, col(0xff3a1a, 1.4)); // 떡볶이 철판
        break;
      case 'PC방':
        for (const w of [0.9, 2.0]) {
          put(inner, mid, 0.74, w, W * 0.85, 0.05, 0.6, col(0x1a1a28, 0.8));
          rowsU(0.85, (u) => {
            put(glow, u, 1.05, w + 0.15, 0.6, 0.36, 0.04, col(pick([0x2a6aff, 0x3ad2ff, 0x6a4aff, 0xff3a8a]), 1.5)); // 모니터
            put(dark, u, 0.5, w - 0.5, 0.45, 1.0, 0.45, col(0x101018));    // 의자
          });
        }
        break;
      case '노래방': case '호프':
        put(inner, mid, 0.55, 1.4, W * 0.8, 1.1, 0.5, col(0x3a2014, 0.8));  // 바 카운터
        put(glow, mid, 1.12, 1.4, W * 0.8, 0.03, 0.52, col(PAL.light, 1.4));
        for (const y of [1.5, 2.0, 2.5]) {
          put(inner, mid, y - 0.12, DI - 0.25, W * 0.8, 0.04, 0.3, col(0x2a1a10, 0.8));
          rowsU(0.25, (u) => { if (Math.random() < 0.75) put(glow, u, y + 0.06, DI - 0.25, 0.08, 0.3, 0.08, col(pick([0xffb347, 0x7aff9a, 0xff6a6a, 0xd8f0ff]), 1.2)); }); // 술병
        }
        rowsU(1.0, (u) => put(dark, u, 0.38, 0.8, 0.35, 0.75, 0.35, col(0x1a1018)));
        break;
      case '카페':
        rowsU(1.8, (u) => {
          put(inner, u, 0.74, 1.0, 0.8, 0.05, 0.8, col(0xe8d8c0, 0.7));
          put(dark, u, 0.37, 1.0, 0.08, 0.74, 0.08, col(0x2a1a10));
          put(dark, u + 0.6, 0.25, 1.0, 0.35, 0.5, 0.35, col(0x3a2a1a));
          put(dark, u, 3.45, 1.0, 0.02, 1.3, 0.02, col(0x1a1a1a));          // 전선
          put(glow, u, 2.7, 1.0, 0.28, 0.2, 0.28, col(0xffd08a, 2.0));      // 펜던트 조명
        });
        put(inner, b - 0.8, 0.6, 0.5, 0.5, 1.2, 0.5, col(0x2a6a34, 0.7));   // 화분
        put(inner, mid, 0.55, DI - 0.5, W * 0.6, 1.1, 0.6, col(0x4a2a1a, 0.8)); // 커피 바
        break;
      case '휴대폰':
        rowsU(1.6, (u) => {
          put(inner, u, 0.45, 1.2, 1.1, 0.9, 0.7, col(0xffffff, 0.8));
          for (let i = -1; i <= 1; i++) put(glow, u + i * 0.3, 0.93, 1.2, 0.12, 0.04, 0.22, col(pick([0x3a8aff, 0xff3a6a, 0x7a4aff]), 1.6));
        });
        rowsU(1.4, (u) => put(glow, u, 2.4, DI - 0.12, 0.9, 1.3, 0.04, col(pick([0xff3a6a, 0x3a8aff, 0xffb43a]), 0.9))); // 포스터
        break;
      case '미용실':
        rowsU(1.5, (u) => {
          put(glow, u, 1.6, DI - 0.12, 0.8, 1.1, 0.04, col(0xcfe8ff, 0.7));   // 거울
          put(dark, u, 0.45, DI - 0.8, 0.6, 0.9, 0.6, col(0x1a1418));         // 의자
        });
        for (let i = 0; i < 8; i++) put(glow, a - 0.15, 0.5 + i * 0.3, -0.35, 0.18, 0.15, 0.18, col(i % 2 ? 0xff3a5a : 0x3a6aff, 1.6)); // 회전등
        break;
      case '임대':
        put(inner, mid, 1.5, 0.05, 0.9, 0.6, 0.02, col(0xf4f0e0, 0.8));      // 임대 종이
        put(inner, mid, 1.65, 0.04, 0.6, 0.12, 0.02, col(0xc81e1e, 0.9));
        break;
    }

    // 유리 + 창틀 + 문
    const doorU = Math.random() < 0.5 ? a + 1.0 : b - 1.0;
    glass.push({ w: W, h: GH - 0.5, p: at(mid, (GH - 0.5) / 2 + 0.05, -G), rotY: Math.atan2(nx, nz) });
    put(dark, mid, 0.05, -0.02, W, 0.1, 0.12, frame);
    put(dark, mid, GH - 0.45, -0.02, W, 0.1, 0.12, frame);
    put(dark, mid, 3.0, -0.02, W, 0.06, 0.1, frame);
    for (let u = a + 1.8; u < b - 0.5; u += 1.8) put(dark, u, (GH - 0.5) / 2, -0.02, 0.07, GH - 0.5, 0.1, frame);
    put(dark, doorU - 0.5, 1.5, -0.03, 0.08, 3.0, 0.12, frame);
    put(dark, doorU + 0.5, 1.5, -0.03, 0.08, 3.0, 0.12, frame);
    put(dark, doorU + 0.35, 1.1, -0.1, 0.04, 0.5, 0.04, col(0xc8ccd8)); // 손잡이

    // 간판 라이트박스 (1층 위 외벽)
    if (NAME_IDX[kind]) {
      const sw = Math.min(W * 0.85, 4.6), sh = sw / 4;
      dark.push({ p: at(mid, GH + 0.55, 0.18), s: along(sw + 0.25, sh + 0.2, 0.36), c: col(0x14121e) });
      hSigns.push({ geo: atlasPlane(hAt, pick(NAME_IDX[kind]), sw, sh), p: at(mid, GH + 0.55, 0.37), rotY: Math.atan2(nx, nz) });
      glow.push({ p: at(mid, GH + 0.04, 0.4), s: along(sw, 0.05, 0.05), c: col(pick(NEON), 2.2) });
    }
    // 차양
    if (Math.random() < 0.4) {
      dark.push({ p: at(mid, GH - 0.1, 0.8), s: along(W, 0.12, 1.6), c: col(0x2a2440) });
      glow.push({ p: at(mid, GH - 0.18, 1.58), s: along(W, 0.05, 0.05), c: col(pick(NEON), 2.2) });
    }
    // 가게 불빛이 젖은 바닥에 번진다
  }

  // 건물 하나: 길을 향한 면(nx, nz)에 상점/네온/간판을 붙인다
  function building(x0, x1, z0, z1, hr, nx, nz, style) {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const h = rnd(hr[0], hr[1]);
    const v = style ?? Math.floor(Math.random() * 3);
    const h1 = Math.random() < 0.5 ? h : h * rnd(0.55, 0.8);
    // 1층은 길 쪽으로 D만큼 파여 상점이 들어간다
    const D = 3.2, GH = 4.2;
    geos[v].push(box(cx - nx * D / 2, cz - nz * D / 2, w - Math.abs(nx) * D, GH, d - Math.abs(nz) * D));
    geos[v].push(box(cx, cz, w, h1 - GH, d, GH));
    if (h1 < h) { // 길 반대쪽으로 물러난 윗층
      const inset = 3;
      geos[(v + 1) % 3].push(box(cx - nx * inset / 2, cz - nz * inset / 2, w - (nx ? inset : 2), h - h1, d - (nz ? inset : 2), h1));
    }
    const fx = nx > 0 ? x1 : x0, fz = nz > 0 ? z1 : z0;
    const len = nx ? d : w;
    const t0 = nx ? z0 : x0;
    const at = (t, y, out) => nx ? V(fx + nx * out, y, t) : V(t, y, fz + nz * out);
    const along = (L, H, T) => nx ? V(T, H, L) : V(L, H, T);

    // 1층 상점들: 기둥으로 칸을 나누고 칸마다 3D 가게를 짓는다
    const shops = Math.max(1, Math.round(len / 7.5));
    for (let k = 0; k <= shops; k++) {
      const t = Math.min(t0 + len - 0.3, Math.max(t0 + 0.3, t0 + (len / shops) * k));
      const pp = at(t, GH / 2, -D / 2), ps = along(0.6, GH, D);
      geos[v].push(box(pp.x, pp.z, ps.x, GH, ps.z));
    }
    for (let k = 0; k < shops; k++) {
      shop(t0 + (len / shops) * k + 0.3, t0 + (len / shops) * (k + 1) - 0.3, at, along, nx, nz, D, GH);
    }
    // 세로 네온관
    for (let i = 0, n = Math.floor(rnd(0, 3)); i < n; i++) {
      const hh = rnd(4, Math.min(22, h1 - 6));
      if (hh < 3) break;
      glow.push({ p: at(t0 + rnd(1, len - 1), rnd(6, h1 - hh) + hh / 2, 0.12), s: along(0.16, hh, 0.16), c: col(pick(NEON), 2.0) });
    }
    // 가로 네온 띠
    if (Math.random() < 0.45) {
      const y = Math.floor(rnd(2, h1 / 2.7)) * 2.7;
      glow.push({ p: at(t0 + len / 2, y, 0.1), s: along(len - 1, 0.14, 0.14), c: col(pick(NEON), 1.8) });
    }
    // 실외기
    for (let i = 0, n = Math.floor(rnd(1, 7)); i < n; i++) {
      dark.push({ p: at(t0 + rnd(1, len - 1), rnd(5, Math.min(30, h1 - 1)), 0.35), s: along(0.9, 0.6, 0.7), c: col(0x2c3048) });
    }
    // 층 난간
    if (Math.random() < 0.4) for (let y = 8.1; y < Math.min(h1, 40); y += 5.4) {
      dark.push({ p: at(t0 + len / 2, y, 0.4), s: along(len - 0.4, 0.18, 0.8), c: col(0x232640) });
    }
    // 돌출 세로 간판 (길을 따라 내다보면 겹겹이 보인다)
    if (Math.random() < 0.65) {
      const sh = rnd(3.6, 6), sw = sh / 3;
      const p = at(t0 + rnd(1.5, len - 1.5), rnd(5.5, 12), 1.5);
      const idx = Math.floor(Math.random() * vAt.count);
      const off = nx ? V(0, 0, 0.13) : V(0.13, 0, 0);
      dark.push({ p: p.clone(), s: nx ? V(sw + 0.16, sh + 0.16, 0.22) : V(0.22, sh + 0.16, sw + 0.16), c: col(0x14121e) });
      vSigns.push({ geo: atlasPlane(vAt, idx, sw, sh), p: p.clone().add(off), rotY: nx ? 0 : Math.PI / 2 });
      vSigns.push({ geo: atlasPlane(vAt, idx, sw, sh), p: p.clone().sub(off), rotY: nx ? Math.PI : -Math.PI / 2 });
      dark.push({ p: p.clone().add(nx ? V(-nx * 0.85, sh / 2 - 0.3, 0) : V(0, sh / 2 - 0.3, -nz * 0.85)), s: along(0.08, 0.08, 1.4), c: col(0x1a1a2a) });
    }
    // 벽면 가로 간판
    if (Math.random() < 0.45) {
      const sw = rnd(4.5, Math.min(9, len - 1)), sh = sw / 4;
      if (sw > 3) {
        const t = t0 + len / 2 + rnd(-2, 2), y = rnd(6.5, 11);
        dark.push({ p: at(t, y, 0.15), s: along(sw + 0.2, sh + 0.2, 0.3), c: col(0x14121e) });
        hSigns.push({ geo: atlasPlane(hAt, Math.floor(Math.random() * hAt.count), sw, sh), p: at(t, y, 0.32), rotY: Math.atan2(nx, nz) });
      }
    }
  }

  // 각 영역의 네 변을 따라 건물을 세운다. 2m 단위로 다른 길과 겹치지 않는 구간만 막는다.
  for (const r of RECTS) {
    const sides = [
      { nx: 1, nz: 0, fixed: r.x0, a: r.z0, b: r.z1 },
      { nx: -1, nz: 0, fixed: r.x1, a: r.z0, b: r.z1 },
      { nx: 0, nz: 1, fixed: r.z0, a: r.x0, b: r.x1 },
      { nx: 0, nz: -1, fixed: r.z1, a: r.x0, b: r.x1 },
    ];
    for (const sd of sides) {
      const free = [];
      for (let t = sd.a; t < sd.b - 0.01; t += 2) {
        const t2 = Math.min(sd.b, t + 2), dd = 1.5;
        let blocked;
        if (sd.nx) {
          const xo = sd.nx > 0 ? sd.fixed - dd : sd.fixed;
          blocked = overlapsWalk(xo, xo + dd, t, t2);
        } else {
          const zo = sd.nz > 0 ? sd.fixed - dd : sd.fixed;
          blocked = overlapsWalk(t, t2, zo, zo + dd);
          if (r.open && sd.nz > 0 && t2 > r.open[0] && t < r.open[1]) blocked = true;
        }
        free.push({ t, t2, ok: !blocked });
      }
      let i = 0;
      while (i < free.length) {
        if (!free[i].ok) { i++; continue; }
        let j = i;
        while (j + 1 < free.length && free[j + 1].ok) j++;
        let s = free[i].t;
        const e = free[j].t2;
        while (s < e - 0.5) {
          let L = Math.min(rnd(8, 20), e - s);
          if (e - (s + L) < 4) L = e - s;
          const dpt = rnd(14, 24);
          if (sd.nx) {
            const x0 = sd.nx > 0 ? sd.fixed - dpt : sd.fixed;
            building(x0, x0 + dpt, s, s + L, r.h, sd.nx, 0, r.style);
          } else {
            const z0 = sd.nz > 0 ? sd.fixed - dpt : sd.fixed;
            building(s, s + L, z0, z0 + dpt, r.h, 0, sd.nz, r.style);
          }
          s += L;
        }
        i = j + 1;
      }
    }
  }

  // ---- 공중 연결 다리 ----
  for (const [ri, z] of [[1, -128], [3, -300], [4, -380], [4, -440], [5, -510], [6, -610], [8, -790], [8, -850]]) {
    const r = RECTS[ri];
    const y = rnd(26, 46), th = rnd(4, 6), dz = rnd(6, 10);
    geos[1].push(box((r.x0 + r.x1) / 2, z, r.x1 - r.x0 + 6, th, dz, y));
    glow.push({ p: V((r.x0 + r.x1) / 2, y - 0.1, z), s: V(r.x1 - r.x0 + 6, 0.1, 0.25), c: col(pick(NEON), 2) });
  }

  // ---- 먼 스카이라인 (타워 주변, 안개에 잠긴 실루엣) ----
  for (let i = 0; i < 90; i++) {
    const x = rnd(-360, 360), z = rnd(-1500, -700);
    if (Math.abs(x) < 70 && z > -1160) continue;
    geos[Math.floor(Math.random() * 3)].push(box(x, z, rnd(25, 60), rnd(60, 280), rnd(25, 60)));
  }
  // 양옆 뒤쪽 배경 매스 (건물 틈으로 허공이 보이지 않게)
  for (let z = 20; z > -1000; z -= 40) for (const sx of [-1, 1]) {
    geos[2].push(box(sx * rnd(70, 95), z, 40, rnd(80, 170), 44));
  }
  facades.forEach((m, i) => { if (geos[i].length) scene.add(new THREE.Mesh(mergeGeometries(geos[i]), m)); });

  // ---- 타워 광장 끝 난간 ----
  const F = MAIN_RECTS[9];
  glow.push({ p: V(0, 1.1, F.z0 + 0.3), s: V(F.open[1] - F.open[0], 0.08, 0.08), c: col(0x00e5ff, 2.5) });
  for (let x = F.open[0]; x <= F.open[1]; x += 4) dark.push({ p: V(x, 0.55, F.z0 + 0.3), s: V(0.12, 1.1, 0.12), c: col(0x2a2e44) });

  scene.add(instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), glow));
  scene.add(instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.4 }), dark));

  // 간판 병합 (아틀라스당 한 번에 그린다)
  const signMesh = (list, at) => {
    if (!list.length) return null;
    const merged = mergeGeometries(list.map((s) => s.geo.rotateY(s.rotY).translate(s.p.x, s.p.y, s.p.z)));
    const m = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ map: at.texture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: col(0xffffff, 1.25) }));
    scene.add(m);
    return m;
  };
  const vMesh = signMesh(vSigns, vAt), hMesh = signMesh(hSigns, hAt);
  scene.add(instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), inner));
  if (glass.length) {
    const merged = mergeGeometries(glass.map((g) => new THREE.PlaneGeometry(g.w, g.h).rotateY(g.rotY).translate(g.p.x, g.p.y, g.p.z)));
    scene.add(new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ color: 0x8aa0d8, transparent: true, opacity: 0.16, roughness: 0.08, metalness: 0.9, depthWrite: false, side: THREE.DoubleSide })));
  }

  // ---- 쓰레기 / 잡동사니: 벽을 따라 쌓인 봉투, 상자, 드럼통, 흩어진 종이 ----
  {
    const bags = [], crates = [], drums = [], papers = [], stains = [];
    const edgeSpot = (r) => {
      const side = Math.floor(Math.random() * 4), m = rnd(0.5, 1.4);
      if (side < 2) return V(side ? r.x1 - m : r.x0 + m, 0, rnd(r.z0 + 1, r.z1 - 1));
      return V(rnd(r.x0 + 1, r.x1 - 1), 0, side === 2 ? r.z0 + m : r.z1 - m);
    };
    for (const r of RECTS) {
      const n = Math.round((r.x1 - r.x0 + r.z1 - r.z0) / 9);
      for (let k = 0; k < n; k++) {
        const p = edgeSpot(r), roll = Math.random();
        if (roll < 0.45) for (let j = 0, m = 1 + Math.floor(Math.random() * 4); j < m; j++) {
          const s2 = rnd(0.35, 0.6);
          bags.push({ p: V(p.x + rnd(-0.6, 0.6), s2 * 0.4, p.z + rnd(-0.6, 0.6)), s: V(s2, s2 * 0.8, s2 * rnd(0.8, 1.2)), c: col(pick([0x2a2c32, 0x34363c, 0x3e3e2c, 0x2c3a4a]), 1) });
        }
        else if (roll < 0.75) {
          const s2 = rnd(0.5, 0.9);
          crates.push({ p: V(p.x, s2 / 2, p.z), s: V(s2, s2 * rnd(0.6, 1), s2 * rnd(0.8, 1.3)), c: col(pick([0x6a5236, 0x5a4a38, 0x3e5644, 0x7a6650]), 0.9) });
          if (Math.random() < 0.4) crates.push({ p: V(p.x + rnd(-0.1, 0.1), s2 + 0.2, p.z), s: V(s2 * 0.7, 0.4, s2 * 0.7), c: col(0x3a3228, 0.8) });
        } else {
          drums.push({ p: V(p.x, 0.45, p.z), s: V(1, 1, 1), c: col(pick([0x6a3a24, 0x34506a, 0x7a3a1c, 0x4e4e4e]), 1) });
        }
      }
      const area = (r.x1 - r.x0) * (r.z1 - r.z0);
      for (let k = 0; k < area / 50; k++) papers.push({ p: V(rnd(r.x0 + 0.5, r.x1 - 0.5), 0.02, rnd(r.z0 + 0.5, r.z1 - 0.5)), s: V(rnd(0.2, 0.45), 1, rnd(0.25, 0.4)), c: col(pick([0x8a8576, 0x6a665a, 0x9a8a6a, 0x5a6066]), 0.85) });
      for (let k = 0; k < area / 160; k++) stains.push({ p: V(rnd(r.x0, r.x1), 0.015, rnd(r.z0, r.z1)), s: V(rnd(2, 6), 1, rnd(2, 6)), c: col(0x000000) });
    }
    const dirt = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.05 });
    scene.add(instanced(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.1 }), bags));
    scene.add(instanced(new THREE.BoxGeometry(1, 1, 1), dirt, crates));
    scene.add(instanced(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.5 }), drums));
    const paper = instanced(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), dirt, papers);
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion();
    papers.forEach((it, i) => paper.setMatrixAt(i, m4.compose(it.p, q4.setFromAxisAngle(V(0, 1, 0), Math.random() * 6), it.s)));
    scene.add(paper);
    // 바닥의 검은 때 (가산 광원 없이 어둡게만 덮는다)
    const [sc, sg] = canvas(128, 128);
    const gr = sg.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,0.6)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = gr; sg.fillRect(0, 0, 128, 128);
    scene.add(instanced(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: tex(sc), transparent: true, depthWrite: false, color: 0xffffff }), stains));
  }
  const radial = radialTex();

  // ---- 전선: 길을 가로질러 처진 케이블 (밝은 안개를 배경으로 실루엣) ----
  const cable = [], lit = [];
  for (const ri of MAIN) {
    const r = RECTS[ri];
    for (let z = r.z1; z > r.z0; z -= rnd(4, 11)) {
      for (let k = 0, n = Math.floor(rnd(0, 4)); k < n; k++) {
        const ya = rnd(7, 34), yb = ya + rnd(-5, 5), zb = z + rnd(-7, 7);
        const xa = r.x0 - 0.3, xb = r.x1 + 0.3;
        const sag = rnd(0.6, 2.4) * (xb - xa) / 20;
        const arr = Math.random() < 0.12 ? lit : cable;
        let prev = null;
        for (let s = 0; s <= 14; s++) {
          const t = s / 14;
          const p = V(xa + (xb - xa) * t, ya + (yb - ya) * t - sag * 4 * t * (1 - t), z + (zb - z) * t);
          if (prev) arr.push(prev, p);
          prev = p;
        }
      }
    }
  }
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(cable), new THREE.LineBasicMaterial({ color: 0x07060f })));
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lit), new THREE.LineBasicMaterial({ color: col(0xff7ad9, 1.6) })));

  // ---- 거대한 타워 + 빛기둥 (안개를 뚫고 보이도록 fog 제외, 색을 미리 흐리게) ----
  const tower = new THREE.Group();
  tower.position.set(0, 0, -1260);
  const tm = (c) => new THREE.MeshBasicMaterial({ color: c, fog: false });
  const tbase = new THREE.Mesh(new THREE.CylinderGeometry(55, 75, 40, 8), tm(0x6a5aa8)); tbase.position.y = 20; tower.add(tbase);
  let ty = 40;
  const radii = [36, 33, 30, 27, 24, 21, 18];
  radii.forEach((rr, i) => {
    const hh = 38;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(rr - 1.5, rr, hh, 8), tm(new THREE.Color(0x7a6cc0).lerp(new THREE.Color(0xc8bcff), i / radii.length)));
    seg.position.y = ty + hh / 2; tower.add(seg);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(rr + 2, rr + 2, 1.6, 8), tm(col(i % 2 ? 0x8ff6ff : 0xffa8ec, 2.2)));
    ring.position.y = ty + hh; tower.add(ring);
    ty += hh;
  });
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(42, 22, 10, 8), tm(0xb8a8f0)); crown.position.y = ty + 5; tower.add(crown);
  const crownRim = new THREE.Mesh(new THREE.CylinderGeometry(43, 43, 1.2, 8), tm(col(0xffc4f4, 1.8))); crownRim.position.y = ty + 10; tower.add(crownRim);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(6, 80, 8), tm(0xd8ccff)); spire.position.y = ty + 50; tower.add(spire);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.2, ty - 40, 1.2), tm(col(0x9ff6ff, 1.3)));
    strip.position.set(Math.cos(a) * 30, 40 + (ty - 40) / 2, Math.sin(a) * 30);
    tower.add(strip);
  }
  const beamMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 1400, 12, 1, true), beamMat(0xff9ae6, 0.12)); beam.position.y = 700; tower.add(beam);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1400, 8, 1, true), beamMat(0xffffff, 0.3)); core.position.y = 700; tower.add(core);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial, color: col(0xb48cff, 0.22), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  halo.scale.set(520, 520, 1); halo.position.set(0, 170, -60); tower.add(halo);
  scene.add(tower);

  // ---- 비행 차량 ----
  const CARS = 60;
  const cars = [];
  for (let i = 0; i < CARS; i++) cars.push({ x: rnd(-60, 60), y: rnd(45, 140), z: rnd(-1300, 100), dir: Math.random() < 0.5 ? 1 : -1, sp: rnd(18, 55) });
  const carMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.8, 5), new THREE.MeshStandardMaterial({ color: 0x1a1b2c, roughness: 0.5, metalness: 0.6 }), CARS);
  const lightMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 0.25, 0.2), new THREE.MeshBasicMaterial({ color: 0xffffff }), CARS * 2);
  for (let i = 0; i < CARS; i++) { lightMesh.setColorAt(i * 2, col(0xfff2dd, 3)); lightMesh.setColorAt(i * 2 + 1, col(0xff2848, 3)); }
  carMesh.frustumCulled = lightMesh.frustumCulled = false;
  scene.add(carMesh, lightMesh);

  // ---- 증기/물안개 ----
  const steamTex = radialTex('rgba(255,255,255,0.8)');
  const steam = [];
  for (let i = 0; i < 44; i++) {
    const r = RECTS[MAIN[Math.floor(Math.random() * MAIN.length)]];
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, color: col(0x9a948c), transparent: true, opacity: 0, depthWrite: false }));
    s.userData = { x: rnd(r.x0, r.x1), z: rnd(r.z0, r.z1), ph: Math.random(), sc: rnd(7, 13) };
    scene.add(s); steam.push(s);
  }

  // ---- 비 ----
  const RAIN = 1500;
  const rainGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(RAIN * 6), end = new Float32Array(RAIN * 2), seed = new Float32Array(RAIN * 2);
  for (let i = 0; i < RAIN; i++) {
    const x = Math.random(), yy = Math.random(), z = Math.random(), s = Math.random();
    for (let k = 0; k < 2; k++) { const o = i * 2 + k; pos[o * 3] = x; pos[o * 3 + 1] = yy; pos[o * 3 + 2] = z; end[o] = k; seed[o] = s; }
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  rainGeo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  rainGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const rainU = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(50, 26, 50) } };
  const rain = new THREE.LineSegments(rainGeo, new THREE.ShaderMaterial({
    uniforms: rainU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `attribute float aEnd; attribute float aSeed; uniform float uTime; uniform vec3 uCenter; uniform vec3 uBox; varying float vA;
      void main(){
        vec3 p = position; float sp = 30.0 + aSeed*14.0;
        vec3 w = vec3(p.x*uBox.x, p.y*uBox.y - uTime*sp, p.z*uBox.z);
        w.x = mod(w.x - uCenter.x + uBox.x*0.5, uBox.x) - uBox.x*0.5 + uCenter.x;
        w.z = mod(w.z - uCenter.z + uBox.z*0.5, uBox.z) - uBox.z*0.5 + uCenter.z;
        w.y = mod(w.y, uBox.y);
        w.x += aEnd*0.15; w.y += aEnd*1.2;
        vec4 mv = viewMatrix*vec4(w,1.0); float dist = length(mv.xyz);
        vA = (1.0 - aEnd*0.8) * 0.15 * clamp(1.0 - dist/42.0, 0.0, 1.0) * smoothstep(1.5, 5.0, dist);
        gl_Position = projectionMatrix*mv; }`,
    fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(0.62,0.72,1.0, vA); }'
  }));
  rain.frustumCulled = false;
  scene.add(rain);

  // 바닥 물방울 파문: 바닥에 눕는 링. 월드 좌표에 고정되고, 플레이어 둘레 40m 격자 안에서만 보인다.
  const SPL = 120;
  const splGeo = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  const ss = new Float32Array(SPL * 3);
  for (let i = 0; i < SPL; i++) { ss[i * 3] = Math.random(); ss[i * 3 + 1] = Math.random(); ss[i * 3 + 2] = Math.random(); }
  splGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(ss, 3));
  splGeo.instanceCount = SPL;
  const splU = { uTime: rainU.uTime, uCenter: rainU.uCenter };
  const splash = new THREE.Mesh(splGeo, new THREE.ShaderMaterial({
    uniforms: splU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `attribute vec3 aSeed; uniform float uTime; uniform vec3 uCenter; varying float vPh; varying vec2 vUv; varying float vFade;
      void main(){
        float t = uTime*0.85 + aSeed.z*10.0; float ph = fract(t); float cyc = floor(t);
        // 한 번 퍼지는 동안(cyc)은 같은 자리. 월드 격자에 고정하고 플레이어에서 너무 멀면 반대편으로 옮긴다.
        vec2 base = vec2(fract(aSeed.x + cyc*0.618), fract(aSeed.y + cyc*0.381)) * 40.0;
        vec2 c = uCenter.xz;
        vec2 wp = mod(base - c + 20.0, 40.0) - 20.0 + c;
        float r = 0.12 + ph*0.55;
        vec3 w = vec3(wp.x + position.x*r*2.0, 0.045, wp.y + position.z*r*2.0);
        vUv = position.xz*2.0; vPh = ph;
        vFade = smoothstep(20.0, 14.0, length(wp - c));
        gl_Position = projectionMatrix*viewMatrix*vec4(w,1.0); }`,
    fragmentShader: `varying float vPh; varying vec2 vUv; varying float vFade; void main(){
      float d = length(vUv);
      float ring = smoothstep(0.16, 0.0, abs(d - 0.85));
      gl_FragColor = vec4(0.55,0.65,0.9, ring*(1.0-vPh)*0.22*vFade); }`
  }));
  splash.frustumCulled = false;
  scene.add(splash);

  // ---- 붉은 자기장 방벽 ----
  const gateTex = (() => {
    const [c, g] = canvas(512, 96);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 40px "Noto Sans KR","Malgun Gothic",sans-serif';
    g.shadowColor = '#ff3b30'; g.shadowBlur = 18; g.fillStyle = '#ffd0cc';
    g.fillText('⚠ 구역 봉쇄 · 적을 모두 처치하라', 256, 50);
    return tex(c);
  })();
  const gateMats = [];
  // 방벽 하나: 그 z에서 걸을 수 있는 폭 전체를 막는다
  const makeGate = (gz, indoor = false) => {
    let mn = Infinity, mx = -Infinity;
    for (const r of indoor ? ROOM_RECTS : RECTS) if (gz > r.z0 - 0.01 && gz < r.z1 + 0.01) { mn = Math.min(mn, r.x0); mx = Math.max(mx, r.x1); }
    const W = mx - mn, cx = (mn + mx) / 2, H = 12;
    const g = new THREE.Group();
    g.position.set(cx, 0, gz);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uTime: { value: 0 }, uOpen: { value: 0 }, uW: { value: W } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; uniform float uOpen; uniform float uW; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
        void main(){
          vec2 cell = floor(vUv*vec2(uW/0.7, 18.0));
          if (h(cell) < uOpen*1.15) discard;
          float gx = step(0.93, fract(vUv.x*uW/1.6)), gy = step(0.93, fract(vUv.y*12.0/1.6));
          float grid = max(gx, gy);
          float scan = smoothstep(0.55, 1.0, sin(vUv.y*34.0 - uTime*5.0));
          float flick = 0.88 + 0.12*sin(uTime*23.0 + vUv.x*40.0);
          float a = (0.10 + 0.26*grid + 0.12*scan) * (1.0 - vUv.y*0.6) + 0.55*exp(-vUv.y*10.0);
          a *= flick * (1.0 - uOpen*0.6);
          gl_FragColor = vec4(vec3(1.5, 0.14, 0.1), a);
        }`
    });
    gateMats.push(mat);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
    plane.position.y = H / 2;
    g.add(plane);
    const post = new THREE.MeshStandardMaterial({ color: 0x2a2c38, roughness: 0.5, metalness: 0.8 });
    const glowM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.2, 0.15), fog: false });
    for (const sx of [-1, 1]) {
      const px = sx * (W / 2 + 0.3);
      g.add(mesh(new THREE.BoxGeometry(1.0, H + 2, 1.0), post, px, (H + 2) / 2, 0));
      g.add(mesh(new THREE.BoxGeometry(0.16, H, 0.16), glowM, px - sx * 0.55, H / 2, 0));
      g.add(mesh(new THREE.BoxGeometry(1.4, 0.5, 1.4), glowM, px, H + 1.2, 0));
    }
    g.add(mesh(new THREE.BoxGeometry(W, 0.12, 0.3), glowM, 0, 0.08, 0));               // 바닥 발광선
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.6), new THREE.MeshBasicMaterial({ map: gateTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    sign.position.y = H + 3.2; g.add(sign);
    scene.add(g);
    return { z: gz, group: g, mat, W, open: false, openT: 0, closing: false, sign };
  };
  const gates = GATE_Z.map((gz) => makeGate(gz));
  // 뒤쪽 방벽: 적과 마주치면 플레이어 뒤에 솟아 도망칠 수 없게 하고, 구역을 정리하면 함께 열린다
  let rear = null;
  const dropRearNow = () => { if (rear) { scene.remove(rear.group); rear.mat.dispose(); rear = null; } };

  // ---- 타워 입구와 층마다의 방 ----
  const pads = []; // 0: 거리 끝 타워 입구, k + 1: k층 방의 엘리베이터
  const labelTex = (text, color) => {
    const [c, g] = canvas(512, 128);
    g.font = 'bold 54px "Noto Sans KR","Malgun Gothic",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 20; g.fillStyle = '#fff'; g.fillText(text, 256, 66);
    return tex(c);
  };
  const makePad = (x, z, color, label) => {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    g.add(mesh(new THREE.CylinderGeometry(1.7, 1.8, 0.1, 40), new THREE.MeshStandardMaterial({ color: 0x20232c, roughness: 0.35, metalness: 0.8 }), 0, 0.05, 0));
    const on = new THREE.Group(); g.add(on);
    on.add(mesh(new THREE.TorusGeometry(1.55, 0.07, 8, 48).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: col(color, 2.4) }), 0, 0.12, 0));
    const beam = mesh(new THREE.CylinderGeometry(1.45, 1.45, 10, 32, 1, true).translate(0, 5, 0),
      new THREE.MeshBasicMaterial({ color: col(color, 0.9), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    on.add(beam);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(label, hexStr(color)), transparent: true, depthWrite: false }));
    sp.scale.set(5, 1.25, 1); sp.position.y = 4.2; on.add(sp);
    on.visible = false;
    scene.add(g);
    const pad = { pos: V(x, 0, z), group: g, on, beam };
    pads.push(pad);
    return pad;
  };
  // 거리 끝 타워 입구 (광장 난간 앞)
  {
    const z = -979, frame = new THREE.MeshStandardMaterial({ color: 0x2a2c38, roughness: 0.4, metalness: 0.8 }), glowM = new THREE.MeshBasicMaterial({ color: col(0xff2bd6, 2.2) });
    for (const sx of [-1, 1]) { scene.add(mesh(new THREE.BoxGeometry(1.2, 9, 1.2), frame, sx * 4, 4.5, z - 3)); scene.add(mesh(new THREE.BoxGeometry(0.14, 8, 0.14), glowM, sx * 3.3, 4, z - 2.4)); }
    scene.add(mesh(new THREE.BoxGeometry(9.2, 1.2, 1.2), frame, 0, 9.2, z - 3));
    scene.add(mesh(new THREE.BoxGeometry(7, 0.14, 0.14), glowM, 0, 8.5, z - 2.4));
    makePad(0, z, 0xff2bd6, '타워 입구');
  }
  const tileTex = (theme) => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = '#14161d'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`; g.fillRect(i * 64 + 2, j * 64 + 2, 60, 60); }
    g.strokeStyle = hexStr(theme); g.globalAlpha = 0.35; g.lineWidth = 2;
    for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
    const t = tex(c, true); return t;
  };
  let clockHands = null;
  const rooms = ROOMS.map((m, k) => {
    const X = TOWER_X, Z = m.z, H = m.half, WH = 11;
    const grp = new THREE.Group(); scene.add(grp);
    const add = (geo, mat, x, y, z) => { const o = mesh(geo, mat, x, y, z); grp.add(o); return o; };
    const t = tileTex(m.theme); t.repeat.set(H / 4, H / 4);
    add(new THREE.PlaneGeometry(H * 2, H * 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: t, color: 0xb8bcc8, roughness: 0.32, metalness: 0.55 }), X, 0.01, Z);
    const wallM = new THREE.MeshStandardMaterial({ color: 0x23262f, roughness: 0.55, metalness: 0.6 });
    const neon = new THREE.MeshBasicMaterial({ color: col(m.theme, 2.0) });
    const dim = new THREE.MeshBasicMaterial({ color: col(m.theme, 0.6) });
    for (const [dx, dz, w, d] of [[0, -1, H * 2 + 2, 1], [0, 1, H * 2 + 2, 1], [-1, 0, 1, H * 2 + 2], [1, 0, 1, H * 2 + 2]]) {
      add(new THREE.BoxGeometry(w, WH, d), wallM, X + dx * (H + 0.5), WH / 2, Z + dz * (H + 0.5));
      for (const y of [0.3, 7.2]) add(new THREE.BoxGeometry(dx ? 0.1 : w - 2, 0.12, dz ? 0.1 : d - 2), y < 1 ? neon : dim, X + dx * H, y, Z + dz * H);
    }
    add(new THREE.PlaneGeometry(H * 2, H * 2).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x14151b, roughness: 0.8 }), X, WH, Z);
    const lightM = new THREE.MeshBasicMaterial({ color: col(0xe8f0ff, 1.1) });
    for (let i = -H + 6; i < H - 3; i += 8) add(new THREE.BoxGeometry(H * 1.4, 0.08, 0.6), lightM, X, WH - 0.1, Z + i);
    // 방마다 다른 장식 (걸어 다니는 영역 바깥 2m 띠 안에 둔다)
    const R = H - 1.1;
    if (m.kind === 'lobby') {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { add(new THREE.BoxGeometry(1.6, WH, 1.6), wallM, X + sx * R, WH / 2, Z + sz * R); add(new THREE.BoxGeometry(0.12, WH - 1, 0.12), neon, X + sx * (R - 0.85), WH / 2, Z + sz * (R - 0.85)); }
      add(new THREE.TorusGeometry(5, 0.08, 6, 64).rotateX(Math.PI / 2), neon, X, WH - 1.4, Z);
    } else if (m.kind === 'server') {
      for (const sx of [-1, 1]) for (let zz = -H + 4; zz < H - 3; zz += 3.2) {
        add(new THREE.BoxGeometry(1.4, 3.4, 2.6), wallM, X + sx * R, 1.7, Z + zz);
        for (let y = 0.6; y < 3.2; y += 0.5) add(new THREE.BoxGeometry(0.04, 0.05, 2.0), Math.random() < 0.5 ? neon : dim, X + sx * (R - 0.72), y, Z + zz);
      }
    } else if (m.kind === 'lab') {
      const glass = new THREE.MeshStandardMaterial({ color: 0x8ab0c8, transparent: true, opacity: 0.25, roughness: 0.1, metalness: 0.2, depthWrite: false });
      const liquid = new THREE.MeshBasicMaterial({ color: col(0xff2bd6, 0.9), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
      for (const sx of [-1, 1]) for (let zz = -H + 5; zz < H - 4; zz += 5) {
        add(new THREE.CylinderGeometry(0.9, 0.9, 0.4, 20), wallM, X + sx * R, 0.2, Z + zz);
        add(new THREE.CylinderGeometry(0.8, 0.8, 3.2, 20, 1, true), glass, X + sx * R, 2, Z + zz);
        add(new THREE.CylinderGeometry(0.7, 0.7, 2.6, 20), liquid, X + sx * R, 1.7, Z + zz);
        add(new THREE.CylinderGeometry(0.9, 0.9, 0.4, 20), wallM, X + sx * R, 3.8, Z + zz);
      }
    } else if (m.kind === 'gallery') {
      const [c, g] = canvas(512, 256); g.fillStyle = '#0a0b18'; g.fillRect(0, 0, 512, 256);
      for (let i = 0; i < 900; i++) { g.fillStyle = pick(['#ffcf8a', '#7ff6ff', '#ff8ae6', '#ffffff', '#ffb347']); g.globalAlpha = Math.random() * 0.8; g.fillRect(Math.random() * 512, 90 + Math.random() * 166, 2, 2); }
      const city = new THREE.MeshBasicMaterial({ map: tex(c) });
      for (const sx of [-1, 1]) add(new THREE.PlaneGeometry(H * 2 - 4, 6).rotateY(-sx * Math.PI / 2), city, X + sx * (H - 0.05), 4.2, Z);
    } else if (m.kind === 'clock') {
      const [c, g] = canvas(1024, 1024);
      g.fillStyle = '#100810'; g.beginPath(); g.arc(512, 512, 500, 0, 7); g.fill();
      g.strokeStyle = '#ff5a8a'; g.lineWidth = 14; g.shadowColor = '#ff2b6a'; g.shadowBlur = 30; g.beginPath(); g.arc(512, 512, 480, 0, 7); g.stroke();
      g.font = 'bold 110px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffd8e8';
      const NUM = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
      NUM.forEach((n, i) => { const a = (i / 12) * Math.PI * 2; g.fillText(n, 512 + Math.sin(a) * 380, 512 - Math.cos(a) * 380); });
      for (let i = 0; i < 60; i++) { const a = (i / 60) * Math.PI * 2; g.fillRect(512 + Math.sin(a) * 455 - 3, 512 - Math.cos(a) * 455 - 3, 6, i % 5 ? 10 : 26); }
      const face = add(new THREE.CircleGeometry(9, 64), new THREE.MeshBasicMaterial({ map: tex(c), transparent: true }), X, 9.5, Z - H + 0.06);
      face.scale.setScalar(0.95);
      const handM = new THREE.MeshBasicMaterial({ color: col(0xffd8e8, 1.6) });
      const h1 = add(new THREE.BoxGeometry(0.35, 6.5, 0.1).translate(0, 3.0, 0), handM, X, 9.5, Z - H + 0.2);
      const h2 = add(new THREE.BoxGeometry(0.5, 4.2, 0.1).translate(0, 1.9, 0), handM, X, 9.5, Z - H + 0.25);
      clockHands = [h1, h2];
      for (const sx of [-1, 1]) for (let zz = -H + 6; zz < H - 4; zz += 7) { add(new THREE.BoxGeometry(1.6, WH, 1.6), wallM, X + sx * R, WH / 2, Z + zz); add(new THREE.BoxGeometry(0.14, WH - 1, 0.14), neon, X + sx * (R - 0.9), WH / 2, Z + zz); }
    }
    const lift = k < ROOMS.length - 1 ? makePad(X, Z - H + 5, m.theme, '엘리베이터 ▲') : null;
    return {
      name: m.name, center: V(X, 0, Z), start: V(X, 0, Z + H - 4), lift: lift && lift.pos.clone(),
      x0: X - H + 3, x1: X + H - 3, half: H, boss: !!m.boss || m.kind === 'clock',
    };
  });

  // ---- 월드 API ----
  const inside = (x, z, m) => WALK.some((r) => x >= r.x0 + m && x <= r.x1 - m && z >= r.z0 + m && z <= r.z1 - m);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
  let time = 0;
  // 가장 먼저 닫혀 있는 방벽 (앞쪽에서부터 차례로 열린다)
  const curGate = () => gates.find((g) => !g.open) || null;

  return {
    start: V(0, 0, -12),
    rooms, towerDoor: pads[0].pos.clone(),
    showPad(i, on) { if (pads[i]) pads[i].on.visible = on; },
    gates,
    curGate,
    openGate(i) { const g = gates[i]; if (g && !g.open) { g.open = true; g.openT = 0; } },
    // 체크포인트용: i 이전 방벽은 열고 i부터는 닫는다
    setGates(i) { gates.forEach((g, k) => { g.open = k < i; g.openT = g.open ? 1 : 0; g.group.visible = !g.open; g.mat.uniforms.uOpen.value = g.open ? 1 : 0; }); },
    // 걸을 수 있는 영역 안으로 밀어 넣고, 닫힌 방벽을 넘지 못하게 한다
    raiseRear(z, indoor = false) { dropRearNow(); rear = makeGate(z, indoor); rear.openT = 1; rear.closing = true; rear.mat.uniforms.uOpen.value = 1; },
    lowerRear() { if (rear && !rear.open) { rear.open = true; rear.closing = false; } },
    clearRear: dropRearNow,
    get rear() { return rear; },
    // 걸을 수 있는 영역 안으로 밀어 넣고, 닫힌 방벽을 넘지 못하게 한다 (walls=false: 카메라는 뒤쪽 방벽을 통과해 본다)
    resolve(p, r = 0.5, walls = true) {
      const gt = curGate();
      if (gt && p.z < gt.z + r) p.z = gt.z + r;
      if (walls && rear && !rear.open && p.z > rear.z - r) p.z = rear.z - r;
      if (inside(p.x, p.z, r)) return;
      let bx = p.x, bz = p.z, bd = Infinity;
      for (const R of WALK) {
        const cx = THREE.MathUtils.clamp(p.x, R.x0 + r, R.x1 - r), cz = THREE.MathUtils.clamp(p.z, R.z0 + r, R.z1 - r);
        const d = (cx - p.x) ** 2 + (cz - p.z) ** 2;
        if (d < bd) { bd = d; bx = cx; bz = cz; }
      }
      p.x = bx; p.z = bz;
    },
    blocked(p) { return p.y < 70 && !inside(p.x, p.z, 0); },
    // z 구간 [zMin, zMax] 안에서 걸을 수 있는 무작위 지점. avoid에서 minD~maxD 떨어진 곳
    spawnInZone(zMin, zMax, avoid, minD = 12, maxD = 38, xr = [-34, 34]) {
      for (let i = 0; i < 80; i++) {
        const z = rnd(zMin, zMax), x = rnd(xr[0], xr[1]);
        if (!inside(x, z, 1.5)) continue;
        if (avoid) { const d = Math.hypot(x - avoid.x, z - avoid.z); if (d < minD || d > maxD) continue; }
        return V(x, 0, z);
      }
      return V((xr[0] + xr[1]) / 2, 0, (zMin + zMax) / 2);
    },
    update(dt, playerPos, camera, viewportH) {
      time += dt;
      if (rear) { // 뒤쪽 방벽: 솟을 때는 조각이 모여들고, 열릴 때는 흩어진 뒤 치운다
        rear.mat.uniforms.uTime.value = time;
        if (rear.closing) { rear.openT = Math.max(0, rear.openT - dt / 0.5); rear.mat.uniforms.uOpen.value = rear.openT; if (rear.openT <= 0) rear.closing = false; }
        else if (rear.open) { rear.openT = Math.min(1, rear.openT + dt / 0.9); rear.mat.uniforms.uOpen.value = rear.openT; rear.sign.visible = false; if (rear.openT >= 1) dropRearNow(); }
      }
      for (const g of gates) { // 열리는 방벽은 흩어지듯 사라진다
        g.mat.uniforms.uTime.value = time;
        if (g.open && g.openT < 1) {
          g.openT = Math.min(1, g.openT + dt / 0.9);
          g.mat.uniforms.uOpen.value = g.openT;
          g.sign.visible = false;
          if (g.openT >= 1) g.group.visible = false;
        }
      }
      const indoor = playerPos.x > 300; // 타워 안에서는 비가 오지 않는다
      rain.visible = splash.visible = !indoor;
      for (const s of steam) s.visible = !indoor;
      for (const pd of pads) if (pd.on.visible) { pd.beam.material.opacity = 0.16 + 0.1 * Math.sin(time * 4); pd.beam.rotation.y += dt; }
      if (clockHands) { clockHands[0].rotation.z = -time * 0.5; clockHands[1].rotation.z = -time * 0.04; }
      rainU.uTime.value = time;
      rainU.uCenter.value.set(playerPos.x, 0, playerPos.z);
      sky.position.copy(camera.position);
      if (vMesh) vMesh.material.opacity = Math.sin(time * 37) > 0.992 ? 0.6 : 1;
      if (hMesh) hMesh.material.opacity = Math.sin(time * 29 + 1.3) > 0.993 ? 0.6 : 1;
      for (let i = 0; i < CARS; i++) {
        const c = cars[i];
        c.z += c.dir * c.sp * dt;
        if (c.z > 120) c.z = -1300; else if (c.z < -1300) c.z = 120;
        carMesh.setMatrixAt(i, _m.compose(_p.set(c.x, c.y, c.z), _q, _s));
        lightMesh.setMatrixAt(i * 2, _m.compose(_p.set(c.x, c.y, c.z - c.dir * 2.55), _q, _s));
        lightMesh.setMatrixAt(i * 2 + 1, _m.compose(_p.set(c.x, c.y, c.z + c.dir * 2.55), _q, _s));
      }
      carMesh.instanceMatrix.needsUpdate = true;
      lightMesh.instanceMatrix.needsUpdate = true;
      for (const s of steam) {
        const u = s.userData;
        const ph = (u.ph + time * 0.05) % 1;
        s.position.set(u.x, 0.5 + ph * 6, u.z);
        s.scale.setScalar(u.sc * (0.6 + ph));
        s.material.opacity = Math.sin(ph * Math.PI) * 0.09;
      }
    }
  };
}
