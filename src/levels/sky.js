import * as THREE from 'three';

// 도시 상공 연출: 비구름 층, 번개, 옥상 홀로그램 광고판, 하늘을 훑는 탐조등.
// 모두 안개(fog)를 무시하고 가산 혼합으로 그려 멀리서도 보인다.
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---- 홀로그램 광고 (캔버스로 한 장씩 그린다) ----
const ADS = [
  { t: ['아담이', '지켜봅니다'], sub: 'ADAM CITY SYSTEM', c: '#ff4fd8', eye: true },
  { t: ['안전한 도시'], sub: '사람이 없는 거리가 가장 깨끗합니다', c: '#7ff6ff' },
  { t: ['기억 백업'], sub: '오늘 밤 당신의 기억을 지켜 드립니다', c: '#ffd36a' },
  { t: ['NEO', 'SEOUL'], sub: '2087 · 네오 서울', c: '#ff7a5a' },
  { t: ['꿈을', '다운로드'], sub: 'DREAM.NET 1시간 무료', c: '#a98bff' },
  { t: ['의체 할인'], sub: '팔 한 쪽 사면 한 쪽 무료', c: '#5af2a0' },
  { t: ['치킨', '1+1'], sub: '드론 배달 3분', c: '#ffb347' },
  { t: ['통금', '22:00'], sub: '규칙을 어기면 정리됩니다', c: '#ff3b30' },
];
function adTexture(ad) {
  const W = 512, H = 288, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, W, H);
  g.strokeStyle = ad.c; g.lineWidth = 6; g.shadowColor = ad.c; g.shadowBlur = 18;
  g.strokeRect(10, 10, W - 20, H - 20);
  g.fillStyle = ad.c; g.textAlign = 'center'; g.textBaseline = 'middle';
  const lines = ad.t, big = ad.eye ? 62 : lines.length > 1 ? 86 : 104;
  g.font = `900 ${big}px "Noto Sans KR","Malgun Gothic",sans-serif`;
  const x = ad.eye ? W * 0.68 : W / 2;
  lines.forEach((l, i) => g.fillText(l, x, H * 0.42 + (i - (lines.length - 1) / 2) * big * 0.95));
  g.font = '600 24px "Noto Sans KR","Malgun Gothic",sans-serif'; g.shadowBlur = 8;
  g.fillText(ad.sub, W / 2, H - 38);
  if (ad.eye) { // 큰 눈
    g.lineWidth = 8; g.beginPath(); g.ellipse(110, 128, 74, 42, 0, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(110, 128, 24, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const holoMat = (map) => new THREE.ShaderMaterial({
  uniforms: { map: { value: map }, uTime: { value: 0 }, uSeed: { value: Math.random() * 100 }, uBoost: { value: 1 } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true, fog: false,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D map; uniform float uTime; uniform float uSeed; uniform float uBoost; varying vec2 vUv;
    float h(float n){ return fract(sin(n)*43758.5453); }
    void main(){
      float t = uTime + uSeed;
      // 가끔 가로로 찢어지는 글리치
      float band = step(0.985, h(floor(t*7.0))) * step(abs(vUv.y - h(floor(t*7.0)+1.0)), 0.08);
      vec2 uv = vUv + vec2(band * (h(floor(t*30.0)) - 0.5) * 0.08, 0.0);
      vec4 c = texture2D(map, uv);
      float scan = 0.75 + 0.25 * sin(vUv.y * 220.0 - t * 6.0);
      float flick = 0.85 + 0.15 * sin(t * 23.0) * sin(t * 3.7);
      float off = step(0.995, h(floor(t*3.0))) * 0.7;           // 아주 가끔 꺼졌다 켜진다
      vec3 col = c.rgb * scan * flick * (1.0 - off) * 1.6 * uBoost;
      col += c.rgb * 0.15 * smoothstep(0.0, 1.0, sin(vUv.y*3.14159));  // 은은한 바탕 빛
      gl_FragColor = vec4(col, c.a * 0.9);
    }`,
});

// 아무 곳에나 거는 홀로그램 스크린 (타워 안의 방 등). 시간은 buildAtmosphere의 update가 함께 돌린다
const extraHolos = [];
export function makeHolo(adIndex, w) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.56), holoMat(adTexture(ADS[adIndex % ADS.length])));
  extraHolos.push(m);
  return m;
}

// foots: 건물 바닥과 높이 [{x0,x1,z0,z1,h,nx,nz}], route: 길을 따라가는 z 범위
export function buildAtmosphere(scene, { foots, hemi }) {
  const group = new THREE.Group(); scene.add(group);
  const time = { v: 0 };

  // ---- 비구름: 도시 불빛을 받아 아래가 분홍·청록으로 물든 구름층 ----
  const cloudU = { uTime: { value: 0 }, uFlash: { value: 0 }, uCam: { value: new THREE.Vector2() } };
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200, 1, 1).rotateX(Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: cloudU, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, forceSinglePass: true,
    vertexShader: 'varying vec2 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: `uniform float uTime; uniform float uFlash; uniform vec2 uCam; varying vec2 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<3;i++){ v+=a*n(p); p*=2.03; a*=0.5; } return v + 0.12; }
      void main(){
        vec2 p = vW * 0.0035 + vec2(uTime*0.012, uTime*0.004);
        float d = fbm(p) - 0.12 * n(p*3.0 + uTime*0.02);
        float a = smoothstep(0.18, 0.62, d);
        float dist = length(vW - uCam);
        float fade = 1.0 - smoothstep(700.0, 1500.0, dist);
        // 도시 불빛(분홍/청록)이 구름 아래를 물들이고, 번개가 치면 하얗게
        vec3 base = mix(vec3(0.1,0.06,0.16), vec3(0.62,0.2,0.52), smoothstep(0.3,0.85,d));
        base = mix(base, vec3(0.12,0.42,0.55), 0.4 * n(vW*0.001 + 7.0));
        base += vec3(0.75,0.72,0.95) * uFlash * (0.4 + 0.6*d);
        gl_FragColor = vec4(base, a * 0.85 * fade);
      }`,
  }));
  clouds.position.y = 260; clouds.renderOrder = -10;
  group.add(clouds);

  // ---- 번개 줄기 (번쩍일 때만 잠깐 보인다) ----
  const boltMat = new THREE.LineBasicMaterial({ color: new THREE.Color(2.5, 2.4, 3.0), transparent: true, opacity: 0, fog: false });
  const bolt = new THREE.LineSegments(new THREE.BufferGeometry(), boltMat); bolt.frustumCulled = false; group.add(bolt);
  const makeBolt = (cx, cz) => {
    const pts = []; let x = cx, y = 255, z = cz;
    const branch = (x, y, z, len, depth) => {
      for (let i = 0; i < len && y > 30; i++) {
        const nx = x + rnd(-14, 14), ny = y - rnd(10, 22), nz = z + rnd(-10, 10);
        pts.push(new THREE.Vector3(x, y, z), new THREE.Vector3(nx, ny, nz));
        if (depth < 2 && Math.random() < 0.18) branch(nx, ny, nz, 4, depth + 1);
        x = nx; y = ny; z = nz;
      }
    };
    branch(x, y, z, 18, 0);
    bolt.geometry.dispose(); bolt.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  };
  let nextStrike = rnd(5, 10), flashT = -1, hemiBase = hemi?.intensity ?? 1;

  // ---- 옥상 홀로그램 광고판: 길가의 높은 건물 지붕 위에, 길 쪽을 향해 ----
  const boards = [];
  const tall = foots.filter((f) => f.h > 38).sort(() => Math.random() - 0.5);
  const taken = [];
  for (const f of tall) {
    if (boards.length >= 22) break;
    const cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2;
    if (taken.some((p) => Math.hypot(p[0] - cx, p[1] - cz) < 70)) continue; // 서로 너무 붙지 않게
    taken.push([cx, cz]);
    const ad = pick(ADS), w = rnd(16, 26), hgt = w * 0.56;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), holoMat(adTexture(ad)));
    // 길 쪽 가장자리 위에 세운다
    const ex = f.nx > 0 ? f.x1 : f.nx < 0 ? f.x0 : cx, ez = f.nz > 0 ? f.z1 : f.nz < 0 ? f.z0 : cz;
    m.rotation.y = Math.atan2(f.nx || 0, f.nz || 0);
    const wall = f.h > 55; // 높은 건물은 벽면 중턱의 대형 스크린, 낮은 건물은 옥상 광고판
    if (wall) m.position.set(ex + (f.nx || 0) * 0.8, rnd(22, 36), ez + (f.nz || 0) * 0.8);
    else m.position.set(ex - (f.nx || 0) * 2, f.h + hgt / 2 + 3, ez - (f.nz || 0) * 2);
    group.add(m); boards.push(m);
    // 테두리 / 받침대
    const frame = new THREE.Mesh(wall ? new THREE.BoxGeometry(w + 0.8, hgt + 0.8, 0.4) : new THREE.BoxGeometry(w * 0.9, 0.6, 0.6), new THREE.MeshBasicMaterial({ color: 0x0a0a12 }));
    frame.position.copy(m.position);
    if (wall) frame.position.addScaledVector(new THREE.Vector3(f.nx || 0, 0, f.nz || 0), -0.25); else frame.position.y = f.h + 2.7;
    frame.rotation.y = m.rotation.y; group.add(frame);
  }

  // ---- 탐조등: 먼 곳에서 하늘을 훑는 빛 기둥 ----
  const beamGeo = new THREE.CylinderGeometry(0.6, 16, 420, 16, 1, true).translate(0, 210, 0);
  const beamM = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0.6, 0.7, 1.0) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: 'varying float vY; void main(){ vY = position.y / 420.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 uColor; varying float vY; void main(){ gl_FragColor = vec4(uColor, 0.2 * (1.0 - vY) * (1.0 - vY)); }',
  });
  const lights = [];
  for (const [x, z, c] of [[-160, -900, 0x9fb8ff], [170, -1050, 0xff9ae6], [-220, -1350, 0x9ff6ff], [240, -700, 0xffffff], [-90, -420, 0x9fb8ff], [130, -300, 0xff9ae6]]) {
    const m = new THREE.Mesh(beamGeo, beamM.clone()); m.material.uniforms.uColor.value = new THREE.Color(c);
    m.position.set(x, 0, z); m.userData = { a: rnd(0, 6), s: rnd(0.15, 0.35), tilt: rnd(0.25, 0.45) };
    group.add(m); lights.push(m);
  }

  return {
    group,
    onThunder: null,
    update(dt, cam, indoor, rainOn) {
      time.v += dt;
      for (const h of extraHolos) h.material.uniforms.uTime.value = time.v;
      group.visible = !indoor;
      clouds.visible = lights[0].visible = !this.low;
      for (const l of lights) l.visible = !this.low;
      if (indoor) return;
      cloudU.uTime.value = time.v; cloudU.uCam.value.set(cam.x, cam.z);
      clouds.position.x = Math.round(cam.x / 200) * 200; clouds.position.z = Math.round(cam.z / 200) * 200;
      for (const b of boards) b.material.uniforms.uTime.value = time.v;
      for (const l of lights) { const u = l.userData; l.rotation.set(Math.sin(time.v * u.s + u.a) * u.tilt, 0, Math.cos(time.v * u.s * 0.7 + u.a) * u.tilt); }
      // 번개: 비가 오면 가끔. 두세 번 깜빡이고, 잠시 뒤 천둥
      if (rainOn) {
        nextStrike -= dt;
        if (nextStrike <= 0) {
          nextStrike = rnd(8, 18); flashT = 0;
          const a = rnd(-1.2, 1.2), r = rnd(350, 700);
          makeBolt(cam.x + Math.sin(a) * r, cam.z - Math.cos(a) * r);
          const delay = rnd(0.5, 1.8);
          setTimeout(() => this.onThunder?.(r), delay * 1000);
        }
      }
      if (flashT >= 0) {
        flashT += dt;
        const f = Math.max(0, 1 - flashT / 0.5) * (0.55 + 0.45 * Math.sign(Math.sin(flashT * 55)));
        cloudU.uFlash.value = f;
        boltMat.opacity = flashT < 0.35 ? f : 0;
        if (hemi) hemi.intensity = hemiBase * (1 + f * 1.6);
        for (const b of boards) b.material.uniforms.uBoost.value = 1 + f * 0.5;
        if (flashT > 0.6) { flashT = -1; cloudU.uFlash.value = 0; boltMat.opacity = 0; if (hemi) hemi.intensity = hemiBase; }
      }
    },
  };
}
