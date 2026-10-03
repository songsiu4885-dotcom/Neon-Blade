import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// 주인공: 실제 스키닝 모델 + 모션캡처 걷기/달리기/대기.
// 갑옷은 흰색으로 칠하고 바이저와 팔·다리 발광선, 붉은 목도리를 붙인다.
// 걷기/달리기/대기는 모션캡처를 쓰고, 그 위에 칼 잡은 팔(IK), 왼팔 가드, 돌진 런지, 허리 비틀기를 덧입힌다.

const URL = `${import.meta.env.BASE_URL}models/Soldier.glb`;
let cache = null, loaded = null;
const srcMaps = new Map(); // 재질 이름 → 원래 텍스처 (복제 모델을 다른 색으로 칠할 때 쓴다)
export const heroGltf = () => loaded;
// fetch가 막힌 곳(아티팩트 뷰어)에서도 읽히도록 data: 주소는 직접 풀어서 쓴다
export async function loadBuffer(url) {
  if (url.startsWith('data:')) {
    const bin = atob(url.slice(url.indexOf(',') + 1));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`hero model ${r.status}`);
  return r.arrayBuffer();
}
export function loadHero() {
  if (!cache) cache = loadBuffer(URL).then((buf) => {
    const loader = new GLTFLoader();
    // 텍스처를 fetch(blob:) 대신 <img>로 읽는다 (fetch가 막혀도 이미지는 허용된다)
    loader.register((parser) => { parser.textureLoader = new THREE.TextureLoader(parser.options.manager); return { name: 'img_textures' }; });
    return loader.parseAsync(buf, '').then((g) => {
      g.scene.traverse((o) => { if (o.isMesh && o.material.map) srcMaps.set(o.material.name, o.material.map); });
      return (loaded = g);
    });
  });
  return cache;
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// 뼈의 월드 방향(자식 쪽)을 target 쪽으로 돌린다
export function aimBone(bone, child, target) {
  const from = bone.getWorldPosition(_a);
  const cur = child.getWorldPosition(_b).sub(from).normalize();
  const want = _c.copy(target).sub(from).normalize();
  _q.setFromUnitVectors(cur, want).multiply(bone.getWorldQuaternion(_q2));
  bone.quaternion.copy(bone.parent.getWorldQuaternion(_q3).invert().multiply(_q));
  bone.updateWorldMatrix(false, true);
}

// 뼈를 월드 축 기준으로 돌린다 (뼈마다 다른 로컬 축 방향을 신경 쓰지 않아도 된다)
export function rotateWorld(bone, axis, angle) {
  if (Math.abs(angle) < 1e-4) return;
  _q.setFromAxisAngle(axis, angle).multiply(bone.getWorldQuaternion(_q2));
  bone.quaternion.copy(bone.parent.getWorldQuaternion(_q3).invert().multiply(_q));
  bone.updateWorldMatrix(false, true);
}

// 2관절 IK: b1(어깨/고관절) → b2(팔꿈치/무릎) → b3(손목/발목)을 target에 닿게, 굽는 쪽은 pole 방향
export function twoBone(b1, b2, b3, target, pole) {
  const S = b1.getWorldPosition(new THREE.Vector3());
  const L1 = S.distanceTo(b2.getWorldPosition(_a));
  const L2 = _a.distanceTo(b3.getWorldPosition(_b));
  const dir = _d.copy(target).sub(S);
  const dist = THREE.MathUtils.clamp(dir.length(), 0.05, (L1 + L2) * 0.999);
  dir.normalize();
  const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const pl = _e.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
  const mid = S.clone().addScaledVector(dir, a).addScaledVector(pl, h);
  const end = S.clone().addScaledVector(dir, dist);
  aimBone(b1, b2, mid);
  aimBone(b2, b3, end);
}

// 텍스처를 흑백으로 바꿔 흰 갑옷으로 칠한다 (명암 무늬만 남긴다)
function regrade(t, dark = false) {
  const img = t.image, w = img.width, h = img.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, w, h), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const l = (p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11) / 255;
    const v = Math.pow(l, 0.8);
    // 흰 갑옷: 밝은 면은 거의 흰색, 무늬의 어두운 부분은 회색 이음새로 남는다
    if (dark) { p[i] = 255 * (0.08 + 0.78 * v); p[i + 1] = 255 * (0.09 + 0.82 * v); p[i + 2] = 255 * (0.11 + 0.9 * v); } // 검은 갑옷 (흰색으로 바꾸기 전 색)
    else { p[i] = 255 * (0.3 + 0.68 * v); p[i + 1] = 255 * (0.31 + 0.68 * v); p[i + 2] = 255 * (0.33 + 0.67 * v); }
  }
  g.putImageData(d, 0, 0);
  const nt = new THREE.CanvasTexture(c);
  nt.flipY = t.flipY; nt.colorSpace = t.colorSpace; nt.wrapS = t.wrapS; nt.wrapT = t.wrapT; nt.anisotropy = 4;
  return nt;
}

// o.dark: 검은 갑옷과 붉은 발광 (아담). o.dual: 왼손에도 칼. o.gun: 오른손 칼 자리에 권총을 함께 단다.
export function buildHero(gltf, o = {}) {
  const root = new THREE.Group();
  const model = gltf.scene;
  root.add(model);
  const T = o.dark
    ? { visor: new THREE.Color(1.9, 0.15, 0.6), glow: new THREE.Color(1.8, 0.1, 0.55), scarf: 0x1a0a14, blade: new THREE.Color(2.0, 0.35, 1.4) }
    : { visor: new THREE.Color(0.25, 1.6, 1.9), glow: new THREE.Color(0.35, 1.7, 1.9), scarf: 0x8a121c, blade: new THREE.Color(1.6, 2.0, 2.0) };

  const bones = {}, armorMats = [];
  model.traverse((ob) => {
    if (ob.isBone) bones[ob.name.replace('mixamorig', '')] = ob;
    if (ob.isMesh) {
      ob.frustumCulled = false;
      const name = ob.material.name;
      if (/visor/i.test(name)) {
        ob.material = new THREE.MeshStandardMaterial({ color: 0x0a1a20, emissive: T.visor, emissiveIntensity: 1, roughness: 0.15, metalness: 0.6 });
      } else {
        const m = (ob.material = ob.material.clone()); // 같은 원본을 쓰는 다른 모델(주인공/아담)과 재질을 나누지 않는다
        const src = srcMaps.get(name) || m.map;
        if (src?.image) m.map = regrade(src, o.dark);
        if (o.dark) { m.color.setRGB(0.34, 0.37, 0.43); m.metalness = 0.35; m.roughness = 0.5; }
        else { m.color.setRGB(0.95, 0.96, 1.0); m.metalness = 0.15; m.roughness = 0.45; }
        m.envMapIntensity = 0.6;
        armorMats.push(m);
      }
    }
  });

  const glow = new THREE.MeshBasicMaterial({ color: T.glow });
  const scarfMat = new THREE.MeshStandardMaterial({ color: T.scarf, roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide });
  model.updateMatrixWorld(true);
  // 뼈에 붙이는 장식: 뼈의 월드 스케일(0.01)을 상쇄해 미터 단위로 만든다
  const attach = (boneName, obj) => {
    const b = bones[boneName];
    const s = b.getWorldScale(new THREE.Vector3());
    const holder = new THREE.Group();
    holder.scale.set(1 / s.x, 1 / s.y, 1 / s.z);
    holder.add(obj);
    b.add(holder);
    return holder;
  };
  const strip = (len, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.012, len, 0.012), glow); m.position.set(x, y, z); return m; };
  attach('LeftForeArm', strip(0.18, 0.045, 0.13, 0.02));
  attach('RightForeArm', strip(0.18, -0.045, 0.13, 0.02));
  attach('LeftLeg', strip(0.26, 0.05, 0.2, 0.06));
  attach('RightLeg', strip(0.26, -0.05, 0.2, 0.06));
  attach('Spine2', new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 18), glow)).children[0].position.set(0, 0.12, 0.17);

  // 목도리: 목에 두른 고리 + 등 뒤로 날리는 두 가닥
  const scarf = [];
  {
    const neck = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 8, 18).rotateX(Math.PI / 2), scarfMat);
    ring.scale.set(1.1, 1, 1.05);
    neck.add(ring);
    for (const [x, len] of [[0.05, 0.8], [-0.04, 0.6]]) {
      const g = new THREE.Group(); g.position.set(x, 0.0, -0.1);
      g.add(new THREE.Mesh(new THREE.PlaneGeometry(0.11, len, 1, 6).translate(0, -len / 2, 0), scarfMat));
      neck.add(g); scarf.push(g);
    }
    const h = attach('Neck', neck);
    h.children[0].position.set(0, 0.04, 0);
  }

  // 칼: 어깨 높이의 피벗 (매 프레임 어깨 뼈 위치로 옮긴다). 칼날 부분은 blade 묶음이라 통째로 숨길 수 있다.
  const bladeMat = new THREE.MeshBasicMaterial({ color: T.blade });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.5, metalness: 0.6 });
  const makeSword = () => {
    const pivot = new THREE.Group();
    pivot.rotation.order = 'YXZ';
    root.add(pivot);
    const sword = new THREE.Group(); sword.position.y = 0.52;
    pivot.add(sword);
    const blade = new THREE.Group(); sword.add(blade);
    const add = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; blade.add(m); return m; };
    add(new THREE.CylinderGeometry(0.018, 0.018, 0.27, 8), dark, -0.02);
    add(new THREE.BoxGeometry(0.1, 0.014, 0.04), dark, 0.12);
    add(new THREE.BoxGeometry(0.03, 1.05, 0.008), bladeMat, 0.66);
    const tip = add(new THREE.ConeGeometry(0.015, 0.06, 4), bladeMat, 1.21); tip.scale.z = 0.3;
    const aura = add(new THREE.BoxGeometry(0.06, 1.1, 0.03), new THREE.MeshBasicMaterial({ color: o.dark ? 0xff2bd6 : 0x00e5ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }), 0.68);
    return { pivot, sword, blade, aura };
  };
  const main = makeSword();
  const { pivot, sword, aura } = main;
  const extra = {};
  if (o.dual) {
    const l = makeSword();
    Object.assign(extra, { pivotL: l.pivot, swordL: l.sword, bladeL: l.blade, auraL: l.aura, dual: true });
  }
  if (o.gun) {
    // 권총: 칼 손잡이 자리. 칼 묶음 기준 +y가 손잡이 아래쪽, +z가 총구 방향(조준 자세 기준)
    const gun = new THREE.Group(); gun.visible = false;
    const gm = new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.35, metalness: 0.8 });
    const gp = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); gun.add(m); };
    gp(new THREE.BoxGeometry(0.035, 0.13, 0.055), gm, 0, 0.02, -0.01);
    gp(new THREE.BoxGeometry(0.045, 0.06, 0.3), gm, 0, -0.07, 0.09);
    gp(new THREE.BoxGeometry(0.012, 0.012, 0.22), bladeMat, 0.024, -0.07, 0.1);
    sword.add(gun);
    extra.gun = gun; extra.muzzle = new THREE.Vector3(0, -0.07, 0.26);
  }
  if (o.sheath) {
    // 등에 엇갈려 멘 두 자루 (총을 쓸 때만 보인다)
    const back = new THREE.Group(); back.visible = false;
    for (const sgn of [-1, 1]) {
      const b = new THREE.Group(); b.rotation.z = sgn * 0.5;
      const m1 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.0, 0.01), bladeMat); m1.position.y = 0.2; b.add(m1);
      const m2 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.25, 6), dark); m2.position.y = -0.4; b.add(m2);
      back.add(b);
    }
    extra.sheath = back;
  }

  // 애니메이션 (원래 제자리 동작이라 그대로 쓴다)
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const [k, n] of [['idle', 'Idle'], ['walk', 'Walk'], ['run', 'Run']]) {
    actions[k] = mixer.clipAction(gltf.animations.find((a) => a.name === n));
    actions[k].play(); actions[k].setEffectiveWeight(0);
  }
  actions.idle.setEffectiveWeight(1);

  // 어깨 → 주먹 중심까지 최대 거리 (칼을 쥐는 손이 닿을 수 있는 범위)
  const p = (n) => bones[n].getWorldPosition(new THREE.Vector3());
  const maxReach = p('RightArm').distanceTo(p('RightForeArm')) + p('RightForeArm').distanceTo(p('RightHand')) + 0.07;
  const fingers = [];
  for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (let i = 1; i <= 3; i++) if (bones[`RightHand${f}${i}`]) fingers.push(bones[`RightHand${f}${i}`]);

  const fingersL = [];
  for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (let i = 1; i <= 3; i++) if (bones[`LeftHand${f}${i}`]) fingersL.push(bones[`LeftHand${f}${i}`]);
  if (extra.sheath) { const h = attach('Spine2', extra.sheath); h.children[0].position.set(0, 0.1, -0.2); }

  return { root, model, bones, pivot, sword, aura, bladeMat, blade: main.blade, scarf, mixer, actions, maxReach, fingers, fingersL, glow, armorMats, ...extra, swordTip: new THREE.Vector3(0, 1.22, 0), swordBase: new THREE.Vector3(0, 0.18, 0) };
}

const lerp = THREE.MathUtils.lerp, clamp = THREE.MathUtils.clamp;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// 몸(루트) 기준 목표 지점들. x: 오른쪽, y: 위, z: 뒤 (정면은 -z)
const FOOT = {
  dash: { L: V(-0.13, 0.09, -0.6), R: V(0.15, 0.2, 0.78), drop: 0.3 },     // 낮고 긴 돌진 런지 (오른발 뒤꿈치를 든다)
  stance: { L: V(-0.2, 0.09, -0.3), R: V(0.2, 0.09, 0.28), drop: 0.1 },    // 공격 디딤 자세
};
const LHAND = {
  guardFwd: V(0.17, -0.27, -0.22),   // 가슴 앞 가드 (어깨 기준)
  guardBack: V(-0.06, -0.42, 0.18),  // 칼이 왼쪽으로 지나가면 왼손은 허리 뒤로
  dash: V(-0.1, -0.36, 0.45),        // 돌진: 뒤로 뻗어 균형
  charge: V(0.12, -0.3, -0.3),
};

export class HeroAnimator {
  constructor(rig) {
    this.rig = rig;
    this.t = 0;
    this.w = { idle: 1, walk: 0, run: 0, atk: 0, dash: 0, charge: 0, hurt: 0 };
    this._g = new THREE.Vector3(); this._t = new THREE.Vector3(); this._pole = new THREE.Vector3();
    this._yawQ = new THREE.Quaternion(); this._origin = new THREE.Vector3();
    this._axisX = new THREE.Vector3(); this._axisY = new THREE.Vector3();
  }

  // 루트(몸) 기준 좌표 → 월드. 돌진할 때 몸이 기울어도 발은 땅에 붙도록 기울기는 빼고 방향만 쓴다
  _ground(v, out) { return out.copy(v).applyQuaternion(this._yawQ).add(this._origin); }

  update(dt, s) {
    const R = this.rig, B = R.bones, W = this.w;
    this.t += dt;
    const speed = s.dashing ? 0 : s.speed;
    const k = 1 - Math.exp(-10 * dt);
    const tw = speed < 0.4 ? [1, 0, 0] : speed < 4.5 ? [0, 1, 0] : [0, 0, 1];
    if (speed >= 3 && speed < 4.5) { const u = (speed - 3) / 1.5; tw[1] = 1 - u; tw[2] = u; }
    W.idle += (tw[0] - W.idle) * k; W.walk += (tw[1] - W.walk) * k; W.run += (tw[2] - W.run) * k;
    R.actions.idle.setEffectiveWeight(W.idle);
    R.actions.walk.setEffectiveWeight(W.walk);
    R.actions.run.setEffectiveWeight(W.run);
    R.actions.walk.timeScale = clamp(speed / 1.8, 0.6, 1.6);
    R.actions.run.timeScale = clamp(speed / 7, 0.85, 1.45);
    R.mixer.update(s.dashing ? dt * 0.15 : dt);
    R.afterMixer?.(dt); // 적 안드로이드: 부위 크기 등 동작 뒤 처리

    W.atk += ((s.attacking ? 1 : 0) - W.atk) * (1 - Math.exp(-(s.attacking ? 26 : 8) * dt));
    W.dash += ((s.dashing ? 1 : 0) - W.dash) * (1 - Math.exp(-(s.dashing ? 32 : 7) * dt));
    W.charge += ((s.charging ? 1 : 0) - W.charge) * (1 - Math.exp(-12 * dt));
    W.hurt += ((s.stagger ? 1 : 0) - W.hurt) * (1 - Math.exp(-20 * dt));

    R.root.updateMatrixWorld(true);
    R.root.getWorldPosition(this._origin);
    this._yawQ.setFromAxisAngle(UP, R.root.rotation.y + (R.root.parent ? 0 : 0));
    if (R.root.parent) { const pq = R.root.parent.getWorldQuaternion(_q3); this._yawQ.premultiply(pq); }
    const ax = this._axisX.set(1, 0, 0).applyQuaternion(this._yawQ);   // 몸 기준 오른쪽 축 (앞뒤로 숙이기)
    const ay = this._axisY.copy(UP);                                     // 세로 축 (비틀기)

    const wStance = Math.max(W.atk, W.charge) * (1 - W.run) * (1 - W.dash);
    // ---- 엉덩이 낮추기 ----
    const drop = FOOT.dash.drop * W.dash + FOOT.stance.drop * wStance;
    if (drop > 0.001) {
      const hp = B.Hips.getWorldPosition(this._g).addScaledVector(UP, -drop);
      B.Hips.position.copy(B.Hips.parent.worldToLocal(hp));
      B.Hips.updateWorldMatrix(false, true);
    }

    // ---- 상체: 숙이기와 허리 비틀기 (칼 방향을 따라 감았다 푼다) ----
    const yaw = clamp(s.swordYaw * 0.5, -0.8, 0.8) * W.atk - 0.45 * W.charge;
    const pitch = 0.6 * W.dash + 0.18 * W.atk + 0.12 * W.charge - 0.35 * W.hurt;
    const sp = [B.Spine, B.Spine1, B.Spine2], share = [0.38, 0.34, 0.28];
    sp.forEach((b, i) => { rotateWorld(b, ay, yaw * share[i]); rotateWorld(b, ax, -pitch * share[i]); });
    rotateWorld(B.Neck, ay, -yaw * 0.55);
    rotateWorld(B.Neck, ax, pitch * 0.65);          // 고개는 들어 앞을 본다

    // ---- 다리: 돌진 런지 / 공격 디딤 ----
    const wLeg = Math.min(1, W.dash + wStance);
    if (wLeg > 0.01) {
      const mix = W.dash / Math.max(1e-4, W.dash + wStance);
      for (const side of ['L', 'R']) {
        const up = B[`${side === 'L' ? 'Left' : 'Right'}UpLeg`], kn = B[`${side === 'L' ? 'Left' : 'Right'}Leg`], ft = B[`${side === 'L' ? 'Left' : 'Right'}Foot`], toe = B[`${side === 'L' ? 'Left' : 'Right'}ToeBase`];
        const want = this._t.copy(FOOT.stance[side]).lerp(FOOT.dash[side], mix);
        const goal = this._ground(want, new THREE.Vector3());
        const cur = ft.getWorldPosition(new THREE.Vector3());
        goal.lerp(cur, 1 - wLeg);
        const pole = this._pole.set(side === 'L' ? -0.1 : 0.1, 0, -1).applyQuaternion(this._yawQ); // 무릎은 앞으로
        twoBone(up, kn, ft, goal, pole);
        // 발: 앞발은 평평하게, 돌진 뒷발은 발끝으로 선다
        const tipToe = side === 'R' ? mix * W.dash : 0;
        const toeGoal = this._ground(this._t.set(0, lerp(0, -0.11, tipToe), lerp(-0.16, -0.06, tipToe)), new THREE.Vector3()).sub(this._origin).add(ft.getWorldPosition(new THREE.Vector3()));
        if (toe) { const t0 = toe.getWorldPosition(new THREE.Vector3()); aimBone(ft, toe, t0.lerp(toeGoal, wLeg)); }
      }
    }

    // ---- 오른팔: 칼 손잡이(주먹)까지 IK ----
    B.RightArm.getWorldPosition(this._g);
    R.pivot.position.copy(R.root.worldToLocal(this._g));
    R.pivot.updateMatrixWorld(true);
    this._arm('Right');

    // ---- 왼팔: 쌍검이면 왼손 칼까지 IK, 아니면 가드 / 돌진 때 뒤로 뻗기 ----
    if (R.dual && R.pivotL && !R.gunMode) {
      B.LeftArm.getWorldPosition(this._g);
      R.pivotL.position.copy(R.root.worldToLocal(this._g));
      R.pivotL.updateMatrixWorld(true);
      this._arm('Left');
    } else {
      const wL = Math.min(1, W.atk + W.charge + W.dash + (R.gunMode ? 1 : 0));
      if (wL > 0.01) {
        const g = clamp((s.swordYaw + 1.4) / 2.8, 0, 1);
        const want = this._t.copy(LHAND.guardFwd).lerp(LHAND.guardBack, g * W.atk * (R.gunMode ? 0 : 1));
        want.lerp(LHAND.charge, W.charge * (1 - W.atk));
        want.lerp(LHAND.dash, W.dash);
        const sh = B.LeftArm.getWorldPosition(new THREE.Vector3());
        const goal = want.applyQuaternion(this._yawQ).add(sh);
        goal.lerp(B.LeftHand.getWorldPosition(new THREE.Vector3()), 1 - wL);
        const pole = this._pole.set(-0.55, -0.55, 0.45).applyQuaternion(this._yawQ);
        twoBone(B.LeftArm, B.LeftForeArm, B.LeftHand, goal, pole);
      }
    }

    // ---- 목도리 ----
    const run = W.run;
    R.scarf.forEach((g, i) => {
      const lift = 0.2 + 1.1 * run + 1.1 * W.dash + 0.4 * W.walk;
      g.rotation.x = lift + Math.sin(this.t * (9 + i * 2) + i) * (0.06 + 0.12 * run); // 목 뼈 기준 +x가 뒤로 젖힘
      g.rotation.z = Math.sin(this.t * 4 + i * 1.7) * 0.1;
    });
  }

  // 오른팔 IK + 칼 쥔 손.
  // 손가락은 손잡이에 수직으로 뻗고 손가락 마디 줄은 손잡이와 나란하게(검지가 칼날 쪽) 맞춘다.
  // 손을 비트는 각도는 팔뚝(60%)과 손목(40%)이 나눠 가져서 손목이 꼬여 보이지 않게 한다.
  _arm(side) {
    const R = this.rig, B = R.bones, L = side === 'Left', sx = L ? -1 : 1;
    const Arm = B[`${side}Arm`], Fore = B[`${side}ForeArm`], Hand = B[`${side}Hand`];
    const swordG = L ? R.swordL : R.sword;
    const S = Arm.getWorldPosition(new THREE.Vector3());
    const G = swordG.getWorldPosition(new THREE.Vector3());
    const H = UP.clone().applyQuaternion(swordG.getWorldQuaternion(new THREE.Quaternion())); // 손잡이 축 (칼날 쪽)
    const dir = G.clone().sub(S).normalize();
    // 손가락 방향: 팔 방향에서 손잡이 축 성분을 뺀 것
    const fdir = dir.clone().addScaledVector(H, -dir.dot(H));
    if (fdir.lengthSq() < 1e-4) fdir.set(0, -1, 0).applyQuaternion(this._yawQ).addScaledVector(H, -H.y);
    fdir.normalize();
    const local = dir.clone().applyQuaternion(this._yawQ.clone().invert()); // 몸 기준 방향
    const up = clamp(local.y, 0, 1), cross = clamp(-local.x * sx, 0, 1);
    const pole = this._pole.set(sx * (0.7 + 0.1 * up - 0.3 * cross), -0.6 * (1 - up) + 0.25 * up, 0.35 - 0.6 * up - 0.4 * cross).applyQuaternion(this._yawQ);
    const wrist = G.clone().addScaledVector(fdir, -0.075);
    twoBone(Arm, Fore, Hand, wrist, pole);

    if (R.noFingers) return; // 적은 손가락·손목 세부 계산을 생략한다 (성능)
    const mid = B[`${side}HandMiddle1`], idx = B[`${side}HandIndex1`], pky = B[`${side}HandPinky1`];
    if (!mid || !idx || !pky) return;
    const aimFingers = () => { const hp = Hand.getWorldPosition(new THREE.Vector3()); aimBone(Hand, mid, hp.addScaledVector(fdir, 0.1)); };
    // 손가락 마디 줄(검지→새끼 반대)을 손잡이 축에 맞추는 데 필요한 비틀림 각도
    const rollNeeded = () => {
      const hp = Hand.getWorldPosition(new THREE.Vector3());
      const fd = mid.getWorldPosition(new THREE.Vector3()).sub(hp).normalize();
      const kn = idx.getWorldPosition(new THREE.Vector3()).sub(pky.getWorldPosition(new THREE.Vector3()));
      kn.addScaledVector(fd, -kn.dot(fd)).normalize();
      const hp2 = H.clone().addScaledVector(fd, -H.dot(fd)).normalize();
      return { fd, angle: Math.atan2(fd.dot(kn.clone().cross(hp2)), kn.dot(hp2)) };
    };
    aimFingers();
    const r1 = rollNeeded();
    const forearmAxis = Hand.getWorldPosition(new THREE.Vector3()).sub(Fore.getWorldPosition(new THREE.Vector3())).normalize();
    rotateWorld(Fore, forearmAxis, r1.angle * 0.6);
    aimFingers();
    const r2 = rollNeeded();
    rotateWorld(Hand, r2.fd, r2.angle);

    // 손가락을 손잡이 쪽으로 감는다. 감는 방향(부호)은 처음 한 번 손끝이 손잡이에 가까워지는 쪽으로 정한다.
    const axis = idx.getWorldPosition(new THREE.Vector3()).sub(pky.getWorldPosition(new THREE.Vector3())).normalize();
    const key = L ? 'curlSignL' : 'curlSign', fingers = L ? R.fingersL : R.fingers;
    if (R[key] == null) {
      const tip = B[`${side}HandMiddle4`] || B[`${side}HandMiddle3`];
      const line = (p) => { const v = p.clone().sub(G); return v.addScaledVector(H, -v.dot(H)).length(); };
      const save = fingers.map((f) => f.quaternion.clone());
      const test = (sg) => { fingers.forEach((f, i) => { f.quaternion.copy(save[i]); f.updateWorldMatrix(false, true); }); for (const f of fingers) rotateWorld(f, axis, sg * 0.5); return line(tip.getWorldPosition(new THREE.Vector3())); };
      const a = test(1), b = test(-1);
      fingers.forEach((f, i) => { f.quaternion.copy(save[i]); f.updateWorldMatrix(false, true); });
      R[key] = a < b ? 1 : -1;
    }
    for (const f of fingers) rotateWorld(f, axis, R[key] * 0.62);
    const thumb = B[`${side}HandThumb2`];
    if (thumb) rotateWorld(thumb, axis, R[key] * 0.35);
  }
}
