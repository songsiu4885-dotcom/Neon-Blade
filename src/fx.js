import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

// 후처리(블룸 하나만) + 대시 잔상 + 속도선
export class FX {
  constructor(renderer, scene, camera) {
    this.scene = scene;
    this.camera = camera;

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    // 블룸은 절반 해상도로 계산한다 (가장 비싼 패스)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.45, 0.5, 0.7);
    this.bloomOn = true;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.bloom.setSize(innerWidth / 2, innerHeight / 2);

    this._initRings();
    this.ghosts = []; this.ghostRig = null; this.ghostTimer = 0; this.ghostIdx = 0;
    this._initSpeedLines();
    this.particles = new Particles(scene);
    // 처형용 베기 선 (빌보드 얇은 판)
    this.slashes = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false; m.frustumCulled = false; m.userData.t = 1;
      scene.add(m); this.slashes.push(m);
    }
    this.slashIdx = 0;
    this.trail = new Trail(scene);
    this.flashEl = document.createElement('div');
    this.flashEl.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;mix-blend-mode:screen';
    document.body.appendChild(this.flashEl);
  }

  resize(w, h) {
    this.composer.setSize(w, h);
    this.bloom.setSize(w / 2, h / 2);
  }

  setBloom(on) { this.bloomOn = on; this.bloom.enabled = on; }

  render() {
    this.composer.render();
  }

  // ---- 잔상: 캐릭터(뼈대와 칼 포함)를 복제한 빛의 실루엣. 대시할 때 그 순간의 자세를 남긴다 ----
  _buildGhosts(player) {
    for (const g of this.ghosts) this.scene.remove(g);
    this.ghosts = [];
    for (let i = 0; i < 8; i++) {
      const g = cloneSkinned(player.model);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      g.traverse((o) => { if (o.isMesh) { o.material = mat; o.frustumCulled = false; } });
      const nodes = []; g.traverse((o) => nodes.push(o));
      g.userData = { mat, life: 0, nodes };
      g.visible = false;
      this.scene.add(g);
      this.ghosts.push(g);
    }
    this.srcNodes = []; player.model.traverse((o) => this.srcNodes.push(o));
    this.ghostRig = player.rig;
  }

  _spawnGhost(player) {
    const g = this.ghosts[this.ghostIdx++ % this.ghosts.length];
    const dst = g.userData.nodes, src = this.srcNodes;
    for (let i = 0; i < dst.length && i < src.length; i++) {
      dst[i].position.copy(src[i].position); dst[i].quaternion.copy(src[i].quaternion); dst[i].scale.copy(src[i].scale);
    }
    g.position.add(player.pos);
    g.userData.life = 1;
    g.userData.gold = player.rampage;
    g.visible = true;
  }

  _updateGhosts(dt, player) {
    if (this.ghostRig !== player.rig) this._buildGhosts(player); // 모델이 바뀌면(로딩 완료) 다시 만든다
    const spin = player.atk && player.atk.def.spin && player.swinging;
    if (player.dashing || spin) {
      this.ghostTimer -= dt;
      if (this.ghostTimer <= 0) { this._spawnGhost(player); this.ghostTimer = player.dashing ? 0.03 : 0.045; }
    } else this.ghostTimer = 0;
    for (const g of this.ghosts) {
      if (!g.visible) continue;
      const u = g.userData;
      u.life -= dt / 0.28;
      if (u.life <= 0) { g.visible = false; continue; }
      const l = u.life;
      // 새것은 하얀 시안, 사라질수록 마젠타 (폭주 중에는 금빛)
      if (u.gold) u.mat.color.setRGB(1.1 * l + 0.7, 0.75 * l + 0.25, 0.15 * l + 0.05);
      else u.mat.color.setRGB(0.55 * l + 0.75 * (1 - l), 1.15 * l + 0.15 * (1 - l), 1.25 * l + 0.95 * (1 - l));
      u.mat.opacity = Math.pow(l, 1.6) * 0.24;
    }
  }

  // ---- 바닥 충격파 링 ----
  _initRings() {
    this.dashTint = new THREE.Color(0.45, 0.95, 1.1);
    this.rings = [];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; m.userData.t = 1;
      this.scene.add(m); this.rings.push(m);
    }
  }

  // 레이저/직선 공격이 터질 때 잠깐 남는 빛기둥
  beam(pos, angle, len, w, color = 0xff4a6a) {
    if (!this.beams) this.beams = [];
    let m = this.beams.find((b) => !b.visible);
    if (!m) {
      if (this.beams.length >= 10) m = this.beams[0];
      else {
        m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0, -0.5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
        m.frustumCulled = false; this.scene.add(m); this.beams.push(m);
      }
    }
    m.position.copy(pos); m.rotation.set(0, angle, 0); m.scale.set(w * 0.7, 0.7, len);
    m.material.color.set(color).multiplyScalar(2); m.userData.t = 0; m.userData.w = w; m.visible = true;
  }

  shockwave(pos, color = 0x7ff6ff, size = 1) {
    const m = this.rings.find((r) => !r.visible) || this.rings[0];
    m.position.set(pos.x, 0.05, pos.z);
    m.material.color.set(color);
    m.userData.t = 0; m.userData.size = size;
    m.visible = true;
  }

  dashBurst(pos, dir) {
    const p = new THREE.Vector3(pos.x, 0.25, pos.z);
    // 젖은 바닥에서 튀는 물보라
    for (let i = 0; i < 16; i++) {
      const v = new THREE.Vector3(-dir.x + (Math.random() - 0.5) * 1.4, 0.5 + Math.random() * 0.8, -dir.z + (Math.random() - 0.5) * 1.4).normalize().multiplyScalar(5 + Math.random() * 7);
      this.particles.emit({ pos: p, vel: v, life: 0.3 + Math.random() * 0.25, size: 0.04, stretch: true, gravity: 18, drag: 2, color: new THREE.Color(0.6, 0.9, 1.4) });
    }
  }

  dashEnd(pos, dir) {
    for (let i = 0; i < 10; i++) {
      const v = new THREE.Vector3(dir.x + (Math.random() - 0.5) * 1.6, 0.3 + Math.random() * 0.6, dir.z + (Math.random() - 0.5) * 1.6).normalize().multiplyScalar(3 + Math.random() * 5);
      this.particles.emit({ pos: new THREE.Vector3(pos.x, 0.15, pos.z), vel: v, life: 0.25 + Math.random() * 0.2, size: 0.035, stretch: true, gravity: 16, drag: 2, color: new THREE.Color(1.2, 0.6, 1.3) });
    }
  }

  // ---- 속도선: 카메라 주변에 흩뿌려진 가는 막대 ----
  _initSpeedLines() {
    const N = 24;
    const geo = new THREE.BoxGeometry(0.03, 0.03, 1);
    this.lineMat = new THREE.MeshBasicMaterial({ color: 0xbfffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.lines = new THREE.InstancedMesh(geo, this.lineMat, N);
    this.lines.frustumCulled = false;
    this.lineData = [];
    for (let i = 0; i < N; i++) {
      this.lineData.push({ a: Math.random() * Math.PI * 2, r: 2 + Math.random() * 5, z: Math.random(), len: 2 + Math.random() * 5 });
    }
    this.scene.add(this.lines);
    this.lineIntensity = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }

  // ---- 타격 연출 ----
  sparks(pos, dir, n, color) {
    const c = new THREE.Color(color).multiplyScalar(1.8);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.8, (Math.random() - 0.5)).normalize()
        .addScaledVector(dir, 0.9).normalize().multiplyScalar(6 + Math.random() * 14);
      this.particles.emit({ pos, vel: v, life: 0.18 + Math.random() * 0.22, size: 0.035 + Math.random() * 0.03, stretch: true, gravity: 14, drag: 2.5, color: c });
    }
    // 중심 번쩍임
    this.particles.emit({ pos, vel: new THREE.Vector3(), life: 0.07, size: 0.25, stretch: false, gravity: 0, drag: 0, color: new THREE.Color(color).multiplyScalar(0.8), spin: 0 });
  }

  chunks(pos, dir, n = 16) {
    for (let i = 0; i < n; i++) {
      const glow = i % 3 === 0;
      const v = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.2 + 0.2, (Math.random() - 0.5) * 2).normalize()
        .addScaledVector(dir, 0.6).multiplyScalar(5 + Math.random() * 8);
      this.particles.emit({
        pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.6)),
        vel: v, life: 0.9 + Math.random() * 0.6, size: 0.14 + Math.random() * 0.26, stretch: false,
        gravity: 22, drag: 0.6, bounce: true, spin: 10,
        color: glow ? new THREE.Color(0xff2bd6).multiplyScalar(1.5) : new THREE.Color(0x232a4d)
      });
    }
    this.sparks(pos, dir, 18, 0xff6ae8);
  }

  slashLine(pos, dir) {
    const m = this.slashes[this.slashIdx++ % this.slashes.length];
    m.position.copy(pos);
    m.quaternion.copy(this.camera.quaternion);
    m.rotateZ((Math.random() < 0.5 ? 1 : -1) * (0.45 + Math.random() * 0.3));
    m.userData.t = 0;
    m.visible = true;
  }

  flash(a) {
    this.flashEl.getAnimations().forEach((x) => x.cancel());
    this.flashEl.animate([{ opacity: a }, { opacity: 0 }], { duration: 240, easing: 'ease-out' });
  }

  update(dt, player) {
    this._updateGhosts(dt, player);
    this.particles.update(dt);
    for (const m of this.slashes) {
      if (!m.visible) continue;
      m.userData.t += dt / 0.22;
      const t = m.userData.t;
      if (t >= 1) { m.visible = false; continue; }
      m.scale.set(6 * Math.min(1, t * 8), 0.09 * (1 - t), 1);
      m.material.opacity = 1 - t;
    }
    if (this.beams) for (const m of this.beams) {
      if (!m.visible) continue;
      m.userData.t += dt / 0.3;
      if (m.userData.t >= 1) { m.visible = false; continue; }
      m.material.opacity = 1 - m.userData.t;
      m.scale.x = m.userData.w * 0.7 * (1 - m.userData.t * 0.6);
    }
    for (const m of this.rings) {
      if (!m.visible) continue;
      m.userData.t += dt / 0.35;
      const t = m.userData.t;
      if (t >= 1) { m.visible = false; continue; }
      const sc = (1 + t * 5) * m.userData.size;
      m.scale.set(sc, 1, sc);
      m.material.opacity = (1 - t) * 0.7;
    }

    // 속도선
    const want = player.dashing ? 1 : 0;
    this.lineIntensity += (want - this.lineIntensity) * (1 - Math.exp(-(want ? 30 : 9) * dt));
    this.lineMat.opacity = this.lineIntensity * 0.22;
    this.lines.visible = this.lineIntensity > 0.02;
    if (this.lines.visible) {
      // 카메라 좌표계에서 앞쪽 깊이로 흐르는 선
      const cam = this.camera;
      const q = cam.quaternion;
      for (let i = 0; i < this.lineData.length; i++) {
        const d = this.lineData[i];
        d.z = (d.z + dt * (3 + d.len * 0.4)) % 1;
        const depth = -2 - d.z * 28;
        this._p.set(Math.cos(d.a) * d.r, Math.sin(d.a) * d.r * 0.7, depth).applyQuaternion(q).add(cam.position);
        this._s.set(1, 1, d.len * (0.6 + this.lineIntensity));
        this._m.compose(this._p, q, this._s);
        this.lines.setMatrixAt(i, this._m);
      }
      this.lines.instanceMatrix.needsUpdate = true;
    }

    // 대시 중 블룸 강화 → 네온 번짐
    const wantBloom = player.dashing ? 0.55 : 0.45;
    this.bloom.strength += (wantBloom - this.bloom.strength) * (1 - Math.exp(-14 * dt));
  }
}

function mesh(geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

// ---- 파티클: InstancedMesh 하나로 불꽃/파편 처리 ----
class Particles {
  constructor(scene, N = 400) {
    this.N = N;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
    this.mesh.frustumCulled = false;
    const white = new THREE.Color(1, 1, 1);
    this.list = [];
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < N; i++) {
      this.mesh.setColorAt(i, white);
      this.mesh.setMatrixAt(i, zero);
      this.list.push({ life: 0, max: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), size: 1, stretch: false, gravity: 0, drag: 0, bounce: false, dead: true });
    }
    scene.add(this.mesh);
    this.cursor = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._d = new THREE.Vector3();
    this._z = new THREE.Vector3(0, 0, 1); this._zero = zero;
  }

  emit(o) {
    const p = this.list[this.cursor];
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.N;
    p.life = p.max = o.life; p.pos.copy(o.pos); p.vel.copy(o.vel);
    p.size = o.size; p.stretch = o.stretch; p.gravity = o.gravity; p.drag = o.drag; p.bounce = !!o.bounce; p.dead = false;
    const sp = o.spin ?? 0;
    p.spin.set((Math.random() - 0.5) * sp, (Math.random() - 0.5) * sp, (Math.random() - 0.5) * sp);
    p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    this.mesh.setColorAt(i, o.color);
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    let dirty = false;
    for (let i = 0; i < this.N; i++) {
      const p = this.list[i];
      if (p.dead) continue;
      dirty = true;
      p.life -= dt;
      if (p.life <= 0) { p.dead = true; this.mesh.setMatrixAt(i, this._zero); continue; }
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (p.bounce && p.pos.y < p.size * 0.5 && p.vel.y < 0) {
        p.pos.y = p.size * 0.5; p.vel.y *= -0.3; p.vel.x *= 0.6; p.vel.z *= 0.6; p.spin.multiplyScalar(0.5);
      }
      const k = p.life / p.max;
      if (p.stretch) {
        const speed = p.vel.length();
        this._d.copy(p.vel).divideScalar(speed || 1);
        this._q.setFromUnitVectors(this._z, this._d);
        const s = p.size * Math.min(1, k * 2.5);
        this._s.set(s, s, s + speed * 0.025);
      } else {
        p.rot.x += p.spin.x * dt; p.rot.y += p.spin.y * dt; p.rot.z += p.spin.z * dt;
        this._q.setFromEuler(p.rot);
        const s = p.size * (k < 0.25 ? k * 4 : 1);
        this._s.set(s, s, s);
      }
      this._m.compose(p.pos, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---- 칼 궤적: 칼날 밑동/끝 샘플을 이어 붙인 리본 ----
class Trail {
  constructor(scene, max = 28) {
    this.max = max;
    this.life = 0.2;
    this.samples = [];
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 2 * 3);
    this.col = new Float32Array(max * 2 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const idx = [];
    for (let i = 0; i < max - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.tint = new THREE.Color(0.7, 1, 1);
  }

  // samples: [{tip, base}] (시간순). emitting이 아니면 기존 샘플만 사라진다.
  update(dt, samples, tint) {
    for (const s of this.samples) s.age += dt;
    while (this.samples.length && this.samples[0].age > this.life) this.samples.shift();
    if (samples) for (const s of samples) {
      this.samples.push({ tip: s.tip.clone(), base: s.base.clone(), age: 0, tint });
      if (this.samples.length > this.max) this.samples.shift();
    }
    const n = this.samples.length;
    if (n < 2) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    for (let i = 0; i < n; i++) {
      const s = this.samples[n - 1 - i]; // 최신이 앞
      const f = Math.max(0, 1 - s.age / this.life), f2 = f * f;
      const o = i * 6;
      this.pos[o] = s.base.x; this.pos[o + 1] = s.base.y; this.pos[o + 2] = s.base.z;
      this.pos[o + 3] = s.tip.x; this.pos[o + 4] = s.tip.y; this.pos[o + 5] = s.tip.z;
      const t = s.tint;
      this.col[o] = t.r * 0.25 * f2; this.col[o + 1] = t.g * 0.25 * f2; this.col[o + 2] = t.b * 0.3 * f2;
      this.col[o + 3] = t.r * 0.9 * f2; this.col[o + 4] = t.g * 0.9 * f2; this.col[o + 5] = t.b * 0.9 * f2;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.setDrawRange(0, (n - 1) * 6);
  }
}
