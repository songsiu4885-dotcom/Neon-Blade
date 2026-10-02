import * as THREE from 'three';
import { warnMaterial } from './enemy.js';

// 보스 패턴용 바닥 위험 지역. 모두 바닥에 붉은 예고를 먼저 그리고, 시간이 되면 터진다.
// 하나하나가 따로 '공격'이라서, 터지는 순간 대시하면 각각 완벽 회피가 된다.
//  circle: 원 / donut: 도넛(안쪽은 안전) / line: 긴 직사각형 / wave: 바깥으로 퍼지는 충격파 고리
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const circleGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
const ringGeo = new THREE.RingGeometry(0.86, 1, 56).rotateX(-Math.PI / 2);
const rectGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5);

export class Hazards {
  constructor(scene, fx) {
    this.scene = scene; this.fx = fx;
    this.list = [];
    this.pool = { circle: [], ring: [], rect: [] };
  }

  _mesh(kind) {
    const free = this.pool[kind].find((m) => !m.userData.used);
    if (free) { free.userData.used = true; return free; }
    const geo = kind === 'circle' ? circleGeo : kind === 'ring' ? ringGeo : rectGeo;
    const m = new THREE.Mesh(geo, warnMaterial());
    m.frustumCulled = false; m.renderOrder = 2; m.userData.used = true;
    this.scene.add(m); this.pool[kind].push(m);
    return m;
  }
  _add(h) { h.dodged = false; h.age = 0; this.list.push(h); return h; }

  // 원: delay초 뒤에 반지름 r 안이 터진다
  circle(x, z, r, delay, dmg, o = {}) {
    const m = this._mesh('circle'); m.position.set(x, 0.06, z); m.scale.set(r, 1, r); m.visible = true;
    const edge = this._mesh('ring'); edge.position.set(x, 0.065, z); edge.scale.set(r, 1, r); edge.visible = true;
    return this._add({ kind: 'circle', m, edge, x, z, r, delay, dmg, color: o.color ?? 0xff6ae8, owner: o.owner, shake: o.shake ?? 0.05 });
  }
  // 도넛: 안쪽 반지름 r0 ~ 바깥 r1 사이가 터진다 (보스 품 안이 안전)
  donut(x, z, r0, r1, delay, dmg, o = {}) {
    const m = this._mesh('circle'); m.position.set(x, 0.06, z); m.scale.set(r1, 1, r1); m.visible = true;
    const hole = this._mesh('ring'); hole.position.set(x, 0.065, z); hole.scale.set(r0, 1, r0); hole.visible = true;
    return this._add({ kind: 'donut', m, edge: hole, x, z, r0, r: r1, delay, dmg, color: o.color ?? 0xff6ae8, owner: o.owner, shake: o.shake ?? 0.08 });
  }
  // 직선: (x,z)에서 angle 방향(정면 = -z 기준 yaw)으로 len, 폭 w
  line(x, z, angle, len, w, delay, dmg, o = {}) {
    const m = this._mesh('rect'); m.position.set(x, 0.06, z); m.rotation.y = angle; m.scale.set(w, 1, len); m.visible = true;
    return this._add({ kind: 'line', m, x, z, angle, len, w, delay, dmg, color: o.color ?? 0xff3b30, owner: o.owner, beam: o.beam ?? true, shake: o.shake ?? 0.04 });
  }
  // 충격파: delay 뒤 (x,z)에서 speed m/s로 퍼지는 고리. 고리가 지나가는 순간 대시로 넘어야 한다
  wave(x, z, speed, maxR, dmg, delay = 0, o = {}) {
    const m = this._mesh('ring'); m.position.set(x, 0.07, z); m.scale.set(0.5, 1, 0.5); m.visible = delay <= 0;
    return this._add({ kind: 'wave', m, x, z, speed, r: 0.5, maxR, delay, dmg, color: o.color ?? 0xffb347, owner: o.owner, hit: false });
  }

  clear() {
    for (const h of this.list) this._free(h);
    this.list.length = 0;
  }
  _free(h) {
    h.m.visible = false; h.m.userData.used = false;
    if (h.edge) { h.edge.visible = false; h.edge.userData.used = false; }
  }
  get busy() { return this.list.length > 0; }

  update(dt, player, rig) {
    const p = player.pos;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i];
      h.age += dt;
      if (h.kind === 'wave') {
        if (h.age < h.delay) continue;
        h.m.visible = true;
        const prev = h.r;
        h.r += h.speed * dt;
        h.m.scale.set(h.r, 1, h.r);
        h.m.material.color.setHex(0xffb347);
        h.m.material.opacity = 0.75 * (1 - h.r / h.maxR) + 0.2;
        const d = Math.hypot(p.x - h.x, p.z - h.z);
        // 고리 띠(두께 약 1.1m)가 플레이어를 지나치는 프레임에 판정
        if (!h.hit && d > prev - 0.9 && d < h.r + 0.3 && p.y < 0.6) {
          h.hit = true; // 한 번 지나가면 끝 (회피 판정도 한 번)
          player.hurt(h.dmg, V3(p.x - h.x, 0, p.z - h.z).normalize(), h);
        }
        if (h.r >= h.maxR) { this._free(h); this.list.splice(i, 1); }
        continue;
      }
      const u = Math.min(1, h.age / h.delay);
      const blink = h.delay - h.age < 0.22 && Math.sin(h.age * 60) > 0 ? 0.2 : 0;
      h.m.material.color.setHex(0xff3b30);
      h.m.material.opacity = 0.08 + 0.42 * u * u + blink;
      if (h.edge) { h.edge.material.color.setHex(0xff3b30); h.edge.material.opacity = 0.5 + 0.4 * u; }
      if (h.kind === 'circle') { const s = h.r * (0.25 + 0.75 * u); h.m.scale.set(s, 1, s); } // 안쪽이 차오르며 터질 때를 알린다
      if (h.age < h.delay) continue;
      // 터짐
      const dx = p.x - h.x, dz = p.z - h.z, d = Math.hypot(dx, dz);
      let inside = false, dir = V3(dx, 0, dz).normalize();
      if (h.kind === 'circle') inside = d < h.r + 0.35;
      else if (h.kind === 'donut') inside = d > h.r0 - 0.2 && d < h.r + 0.35;
      else {
        const fx = -Math.sin(h.angle), fz = -Math.cos(h.angle);
        const along = dx * fx + dz * fz, perp = dx * fz - dz * fx;
        inside = along > -0.4 && along < h.len + 0.4 && Math.abs(perp) < h.w / 2 + 0.35;
        dir = V3(fz, 0, -fx).multiplyScalar(Math.sign(perp) || 1);
        if (h.beam && h.dmg > 0) this.fx.beam?.(V3(h.x, 1.0, h.z), h.angle, h.len, h.w);
      }
      if (inside && h.dmg > 0) player.hurt(h.dmg, dir, h); // dmg 0: 돌진 길 표시처럼 예고만 하는 것
      const c = V3(h.x, 0.3, h.z);
      if (h.kind !== 'line' && h.dmg > 0) { this.fx.shockwave(c, h.color, h.r / 5); this.fx.sparks(c, V3(0, 1, 0), 16, h.color); }
      rig?.shake(h.shake);
      this._free(h); this.list.splice(i, 1);
    }
  }
}
