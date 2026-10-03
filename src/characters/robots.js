import * as THREE from 'three';
import { robotsReady, buildModelRobot, holdInHand, ModelAnimator } from './robotModels.js';

// 적 로봇들. 재질은 Enemy.std()/rim()으로 만들어 피격 번쩍임·예고 색이 그대로 적용된다.
// rim()으로 만든 부분(눈, 발광선)은 공격 예고 때 붉게, 자세가 무너지면 노랗게 바뀐다.

const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
const group = (x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); return g; };

// ---- 경비 로봇 (근접): 육중한 2족 보행, 외눈, 전기 진압봉 ----
// o: { shell, rim, vent, weapon: 'baton'|'sword'|'maul'|'rifle'|'none', shield }
export function buildGuardRobot(e, o = {}) {
  if (o.body !== 'proc' && robotsReady()) return buildModelVersion(e, o);
  const shell = e.std(o.shell ?? 0x3a4058), dark = e.std(0x14161f), joint = e.std(0x60677e), eye = e.rim(o.rim ?? 0xff2bd6), vent = e.rim(o.vent ?? 0xff5ad8);
  shell.roughness = 0.32; shell.metalness = 0.85;
  joint.roughness = 0.4; joint.metalness = 0.9;
  const J = {};

  J.pelvis = group(0, 1.02, 0);
  e.body.add(J.pelvis);
  const hip = mesh(new THREE.CapsuleGeometry(0.17, 0.32, 4, 10), dark); hip.rotation.z = Math.PI / 2;
  J.pelvis.add(hip);
  J.pelvis.add(mesh(new THREE.BoxGeometry(0.42, 0.18, 0.3), shell, 0, -0.02, -0.04));

  for (const s of [-1, 1]) {
    const h = group(s * 0.22, -0.04, 0);
    J.pelvis.add(h);
    h.add(mesh(new THREE.SphereGeometry(0.12, 12, 8), joint));
    h.add(mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.42, 10), dark, 0, -0.24, 0));        // 허벅지 프레임
    h.add(mesh(new THREE.BoxGeometry(0.2, 0.32, 0.18), shell, s * 0.02, -0.22, -0.04));        // 허벅지 장갑
    const k = group(0, -0.48, 0);
    h.add(k);
    k.add(mesh(new THREE.SphereGeometry(0.1, 12, 8), joint));
    k.add(mesh(new THREE.BoxGeometry(0.16, 0.12, 0.12), shell, 0, 0.02, -0.1));               // 무릎 덮개
    k.add(mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.44, 10), shell, 0, -0.24, 0));         // 정강이
    k.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.38, 6), joint, 0, -0.22, 0.13));      // 유압 피스톤
    k.add(mesh(new THREE.BoxGeometry(0.02, 0.24, 0.02), vent, s * 0.09, -0.24, -0.08));
    const a = group(0, -0.47, 0);
    k.add(a);
    a.add(mesh(new THREE.BoxGeometry(0.24, 0.1, 0.42), dark, 0, -0.03, -0.06));               // 발
    a.add(mesh(new THREE.BoxGeometry(0.26, 0.04, 0.16), shell, 0, 0.03, -0.18));
    J[s < 0 ? 'hipL' : 'hipR'] = h; J[s < 0 ? 'kneeL' : 'kneeR'] = k; J[s < 0 ? 'ankleL' : 'ankleR'] = a;
  }

  J.torso = group(0, 0.12, 0);
  J.pelvis.add(J.torso);
  J.torso.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.26, 10), joint, 0, 0.1, 0));       // 허리 관절
  const chest = mesh(new THREE.SphereGeometry(0.42, 18, 12), shell, 0, 0.5, 0.02); chest.scale.set(1.2, 0.88, 0.82);
  J.torso.add(chest);
  const plate = mesh(new THREE.BoxGeometry(0.62, 0.42, 0.12), shell, 0, 0.5, -0.3); plate.rotation.x = -0.18;
  J.torso.add(plate);
  for (let i = 0; i < 3; i++) J.torso.add(mesh(new THREE.BoxGeometry(0.34, 0.025, 0.02), vent, 0, 0.36 + i * 0.07, -0.37)); // 흡기구
  J.torso.add(mesh(new THREE.BoxGeometry(0.46, 0.55, 0.28), dark, 0, 0.52, 0.34));           // 등 배터리
  J.torso.add(mesh(new THREE.BoxGeometry(0.06, 0.4, 0.02), vent, 0, 0.52, 0.49));
  // 머리: 어깨 사이에 파묻힌 돔 + 외눈
  J.head = group(0, 0.86, -0.06);
  J.torso.add(J.head);
  const dome = mesh(new THREE.SphereGeometry(0.19, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), shell); dome.scale.set(1.15, 0.85, 1);
  J.head.add(dome);
  J.head.add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.1, 16), dark, 0, -0.02, 0));
  J.head.add(mesh(new THREE.BoxGeometry(0.3, 0.06, 0.08), dark, 0, 0.03, -0.17));
  J.head.add(mesh(new THREE.BoxGeometry(0.24, 0.035, 0.04), eye, 0, 0.03, -0.205));          // 외눈 바이저
  // 어깨 장갑
  for (const s of [-1, 1]) {
    const pad = mesh(new THREE.SphereGeometry(0.22, 14, 10), shell, s * 0.6, 0.72, 0); pad.scale.set(1.1, 0.85, 1.05);
    J.torso.add(pad);
    J.torso.add(mesh(new THREE.BoxGeometry(0.02, 0.02, 0.36), vent, s * 0.72, 0.72, 0));
  }
  // 팔 (오른팔 = 공격 팔, 진압봉)
  const arm = (s) => {
    const sh = group(s * 0.62, 0.62, 0);
    sh.add(mesh(new THREE.SphereGeometry(0.11, 10, 8), joint));
    sh.add(mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.4, 10), dark, 0, -0.24, 0));
    const el = group(0, -0.46, 0);
    sh.add(el);
    el.add(mesh(new THREE.SphereGeometry(0.09, 10, 8), joint));
    el.add(mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.44, 10), shell, 0, -0.24, 0));      // 굵은 전완
    el.add(mesh(new THREE.BoxGeometry(0.16, 0.14, 0.16), dark, 0, -0.5, 0));                  // 집게 손
    J.torso.add(sh);
    return { sh, el };
  };
  const L = arm(-1), R = arm(1);
  J.shoulderL = L.sh; J.elbowL = L.el; J.shoulderR = R.sh; J.elbowR = R.el;
  const weapon = o.weapon ?? 'baton';
  if (weapon === 'baton' || weapon === 'maul') { // 손에서 앞으로 뻗는 봉 / 대형 망치
    const baton = group(0, -0.5, 0);
    baton.rotation.x = -1.2;
    baton.add(mesh(new THREE.CylinderGeometry(0.035, 0.04, weapon === 'maul' ? 1.6 : 1.1, 8), dark, 0, weapon === 'maul' ? -0.75 : -0.5, 0));
    if (weapon === 'maul') {
      baton.add(mesh(new THREE.BoxGeometry(0.5, 0.55, 0.5), shell, 0, -1.55, 0));
      baton.add(mesh(new THREE.BoxGeometry(0.52, 0.06, 0.52), eye, 0, -1.55, 0));
    } else baton.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 8), eye, 0, -0.85, 0));
    R.el.add(baton);
  } else if (weapon === 'sword') { // 에너지 대검
    const sw = group(0, -0.5, 0);
    sw.rotation.x = -1.2;
    sw.add(mesh(new THREE.BoxGeometry(0.12, 0.3, 0.12), dark, 0, -0.1, 0));
    sw.add(mesh(new THREE.BoxGeometry(0.36, 0.05, 0.1), shell, 0, -0.27, 0));
    sw.add(mesh(new THREE.BoxGeometry(0.1, 1.7, 0.035), eye, 0, -1.15, 0));
    sw.add(mesh(new THREE.BoxGeometry(0.2, 1.6, 0.015), dark, 0, -1.1, 0));
    R.el.add(sw);
  } else if (weapon === 'rifle') { // 저격총: 몸통에 붙여 앞을 겨눈다
    const rf = group(0.34, 0.6, -0.5);
    rf.add(mesh(new THREE.BoxGeometry(0.1, 0.14, 0.9), dark, 0, 0, -0.1));
    rf.add(mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.1, 8).rotateX(Math.PI / 2), shell, 0, 0.02, -0.95));
    rf.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.32, 8).rotateX(Math.PI / 2), dark, 0, 0.12, -0.2)); // 스코프
    rf.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), eye, 0, 0.12, -0.38));
    J.torso.add(rf);
    J.rifle = rf;
  }
  if (o.shield) { // 몸통 앞에 든 대형 방패
    const sh = group(-0.3, 0.55, -0.62);
    sh.add(mesh(new THREE.BoxGeometry(1.0, 1.35, 0.12), shell));
    sh.add(mesh(new THREE.BoxGeometry(0.88, 0.04, 0.14), eye, 0, 0.52, 0));
    sh.add(mesh(new THREE.BoxGeometry(0.88, 0.04, 0.14), eye, 0, -0.52, 0));
    sh.add(mesh(new THREE.BoxGeometry(0.04, 1.2, 0.14), eye, -0.42, 0, 0));
    sh.add(mesh(new THREE.BoxGeometry(0.04, 1.2, 0.14), eye, 0.42, 0, 0));
    sh.add(mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.08, 16).rotateX(Math.PI / 2), dark, 0, 0.1, -0.08));
    J.torso.add(sh);
    J.shield = sh;
  }
  return J;
}

// 실제 3D 모델 버전: 같은 옵션(색, 무기, 방패)을 모델 위에 입힌다. o.body: 'android'(기본) | 'heavy'
function buildModelVersion(e, o) {
  const J = buildModelRobot(e, o, o.body === 'heavy' ? 'heavy' : 'android');
  J.e = e;
  const shell = e.std(o.shell ?? 0x3a4058), dark = e.std(0x14161f), eye = e.rim(o.rim ?? 0xff2bd6);
  shell.roughness = 0.32; shell.metalness = 0.85;
  const weapon = o.weapon ?? 'baton';
  if (weapon === 'baton' || weapon === 'maul') {
    const g = group(); const big = weapon === 'maul';
    g.add(mesh(new THREE.CylinderGeometry(0.035, 0.04, big ? 1.6 : 1.0, 8), dark, 0, big ? -0.7 : -0.45, 0));
    if (big) { g.add(mesh(new THREE.BoxGeometry(0.5, 0.55, 0.5), shell, 0, -1.5, 0)); g.add(mesh(new THREE.BoxGeometry(0.52, 0.06, 0.52), eye, 0, -1.5, 0)); }
    else g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 8), eye, 0, -0.78, 0));
    holdInHand(J, e, g, new THREE.Vector3(0, -1, 0));
  } else if (weapon === 'sword') {
    const g = group();
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.22, 0.08), dark, 0, -0.02, 0));
    g.add(mesh(new THREE.BoxGeometry(0.3, 0.04, 0.08), shell, 0, -0.14, 0));
    g.add(mesh(new THREE.BoxGeometry(0.07, 1.4, 0.025), eye, 0, -0.86, 0));
    holdInHand(J, e, g, new THREE.Vector3(0, -1, 0));
  } else if (weapon === 'rifle') {
    const g = group();
    g.add(mesh(new THREE.BoxGeometry(0.09, 0.13, 0.8), dark, 0, 0.02, -0.15));
    g.add(mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.9, 8).rotateX(Math.PI / 2), shell, 0, 0.04, -0.95));
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.28, 8).rotateX(Math.PI / 2), dark, 0, 0.13, -0.25));
    g.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), eye, 0, 0.13, -0.4));
    holdInHand(J, e, g, new THREE.Vector3(0, 0, -1));
    J.weapons[J.weapons.length - 1].rifle = true;
    J.rifle = g;
  }
  if (o.shield) {
    const sh = group(-0.25, 1.05, -0.6);
    sh.add(mesh(new THREE.BoxGeometry(0.95, 1.3, 0.1), shell));
    for (const y of [0.5, -0.5]) sh.add(mesh(new THREE.BoxGeometry(0.85, 0.04, 0.12), eye, 0, y, 0));
    for (const x of [-0.4, 0.4]) sh.add(mesh(new THREE.BoxGeometry(0.04, 1.15, 0.12), eye, x, 0, 0));
    e.body.add(sh);
    J.shield = sh; J.shieldRef = sh;
  }
  return J;
}

// 보행 애니메이션: 무거운 발걸음, 몸통 흔들림, 왼팔 흔들기. armRx는 오른팔(공격 팔)의 어깨 각도.
export class GuardAnimator {
  constructor(J) { this.J = J; this.phase = Math.random() * 6; this.cur = {}; if (J.isModel) this.model = new ModelAnimator(J, J.e); }
  _go(key, v, k, dt) { const c = this.cur[key] ?? v; return (this.cur[key] = c + (v - c) * (1 - Math.exp(-k * dt))); }
  update(dt, speed, armRx, state, broken, ov = {}) {
    if (this.model) return this.model.update(dt, speed, armRx, state, broken, ov);
    const J = this.J;
    const moving = Math.min(1, speed / 1.2);
    this.phase += (speed * dt / 1.7) * Math.PI * 2;
    const sp = Math.sin(this.phase);
    const A = 0.5 * moving;
    let hipR = sp * A, hipL = -sp * A;
    let kneeR = -(0.12 + 0.75 * Math.max(0, -Math.sin(this.phase - 0.5))) * moving - 0.1;
    let kneeL = -(0.12 + 0.75 * Math.max(0, Math.sin(this.phase - 0.5))) * moving - 0.1;
    let pelvisY = -Math.abs(Math.cos(this.phase)) * 0.07 * moving;
    let roll = sp * 0.06 * moving, lean = 0.1 * moving, armL = -sp * 0.45 * moving, elbowR = -0.35;
    if (state === 'windup') { hipL = 0.3; kneeL = -0.4; hipR = -0.25; kneeR = -0.2; pelvisY = -0.08; lean = -0.15; armL = 0.4; elbowR = -0.6; }
    if (state === 'strike') { hipL = 0.55; kneeL = -0.7; hipR = -0.45; kneeR = -0.25; pelvisY = -0.16; lean = 0.35; armL = -0.5; elbowR = -0.1; }
    if (broken) { hipL = 0.6; kneeL = -1.3; hipR = 0.6; kneeR = -1.3; pelvisY = -0.35; lean = 0.5; armL = 0.2; }
    const k = state === 'strike' ? 40 : 14;
    J.hipL.rotation.x = this._go('hl', hipL, k, dt); J.hipR.rotation.x = this._go('hr', hipR, k, dt);
    J.kneeL.rotation.x = this._go('kl', kneeL, k, dt); J.kneeR.rotation.x = this._go('kr', kneeR, k, dt);
    J.ankleL.rotation.x = -(J.hipL.rotation.x + J.kneeL.rotation.x) * 0.5;
    J.ankleR.rotation.x = -(J.hipR.rotation.x + J.kneeR.rotation.x) * 0.5;
    J.pelvis.position.y = 1.02 + this._go('py', pelvisY, k, dt);
    J.torso.rotation.z = this._go('roll', roll, 10, dt);
    J.torso.rotation.x = this._go('lean', lean, k, dt);
    J.head.rotation.x = -J.torso.rotation.x * 0.6;
    J.shoulderL.rotation.x = ov.armL ?? this._go('al', armL, 10, dt);
    J.elbowL.rotation.x = ov.elbowL ?? -0.3;
    J.shoulderR.rotation.x = armRx;
    J.elbowR.rotation.x = this._go('er', elbowR, k, dt);
  }
}

// ---- 드론 (원거리): 구형 코어 + 외눈 렌즈 + 4로터 + 하부 포신 ----
export function buildDrone(e) {
  const shell = e.std(0x3a4058), dark = e.std(0x14161f), eye = e.rim(0x00e5ff), light = e.rim(0x7af6ff);
  shell.roughness = 0.3; shell.metalness = 0.85;
  const J = {};
  const core = mesh(new THREE.SphereGeometry(0.3, 18, 12), shell); core.scale.set(1, 0.82, 1.1);
  e.body.add(core);
  e.body.add(mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.1, 18), dark, 0, -0.1, 0));           // 하부 링
  const lensHousing = mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.12, 16).rotateX(Math.PI / 2), dark, 0, 0.02, -0.3);
  e.body.add(lensHousing);
  e.body.add(mesh(new THREE.SphereGeometry(0.085, 12, 8), eye, 0, 0.02, -0.36));                   // 눈
  e.body.add(mesh(new THREE.TorusGeometry(0.11, 0.012, 6, 20), eye, 0, 0.02, -0.365));
  e.body.add(mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.42, 8).rotateX(Math.PI / 2), dark, 0, -0.2, -0.22)); // 포신
  e.body.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), dark, 0.1, 0.32, 0.1));       // 안테나
  e.body.add(mesh(new THREE.SphereGeometry(0.02, 6, 4), light, 0.1, 0.48, 0.1));
  J.rotors = [];
  const blurMat = new THREE.MeshBasicMaterial({ color: 0x9fb8ff, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const x = Math.cos(a) * 0.55, z = Math.sin(a) * 0.55;
    const armM = mesh(new THREE.BoxGeometry(0.42, 0.05, 0.07), dark, Math.cos(a) * 0.33, 0, Math.sin(a) * 0.33);
    armM.rotation.y = -a;
    e.body.add(armM);
    e.body.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10), shell, x, 0.02, z));          // 모터
    e.body.add(mesh(new THREE.TorusGeometry(0.24, 0.015, 6, 24).rotateX(Math.PI / 2), shell, x, 0.06, z)); // 보호 링
    const rotor = group(x, 0.08, z);
    rotor.add(mesh(new THREE.BoxGeometry(0.44, 0.008, 0.04), dark));
    rotor.add(mesh(new THREE.CircleGeometry(0.22, 20).rotateX(-Math.PI / 2), blurMat));               // 회전 잔상
    e.body.add(rotor);
    J.rotors.push(rotor);
    e.body.add(mesh(new THREE.SphereGeometry(0.018, 6, 4), light, x * 1.45, 0, z * 1.45));          // 항법등
  }
  return J;
}
