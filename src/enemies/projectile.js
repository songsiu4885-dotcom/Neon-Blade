import * as THREE from 'three';
import { audio } from '../audio.js';

// 탄환 풀. 플레이어에게 닿으면 피해, 패링하면 발사자 쪽으로 되돌아가 적을 때린다.
export class Projectiles {
  constructor(scene, fx, n = 16) {
    this.fx = fx;
    const geo = new THREE.SphereGeometry(0.28, 8, 6);
    const haloGeo = new THREE.SphereGeometry(0.5, 8, 6);
    this.list = [];
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.35, 0.25) });
      const haloMat = new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
      const m = new THREE.Mesh(geo, mat);
      m.add(new THREE.Mesh(haloGeo, haloMat));
      m.visible = false;
      scene.add(m);
      this.list.push({ mesh: m, mat, haloMat, vel: new THREE.Vector3(), life: 0, dmg: 0, active: false, dodged: false, reflected: false, owner: null });
    }
  }

  spawn(pos, vel, dmg, owner = null) {
    const p = this.list.find((q) => !q.active) || this.list[0];
    p.mesh.position.copy(pos);
    p.vel.copy(vel);
    p.life = 4;
    p.dmg = dmg;
    p.owner = owner;
    p.dodged = false;
    p.reflected = false;
    p.mat.color.setRGB(1.6, 0.35, 0.25);
    p.haloMat.color.setHex(0xff3b30);
    p.active = true;
    p.mesh.visible = true;
    audio.shot();
  }

  clear() {
    for (const p of this.list) { p.active = false; p.mesh.visible = false; }
  }

  update(dt, player, combat) {
    for (const p of this.list) {
      if (!p.active) continue;
      p.life -= dt;
      const px = p.mesh.position.x, pz = p.mesh.position.z;
      p.mesh.position.addScaledVector(p.vel, dt);
      const pos = p.mesh.position;
      let end = p.life <= 0 || pos.y < 0.1 || !!combat.world?.blocked(pos);

      if (!end && !player.dead) {
        // 빠른 탄환이 프레임 사이에 지나치지 않도록 이동 선분과의 최근접 거리로 검사
        const sx = pos.x - px, sz = pos.z - pz, sl = sx * sx + sz * sz || 1e-6;
        const tt = Math.max(0, Math.min(1, ((player.pos.x - px) * sx + (player.pos.z - pz) * sz) / sl));
        const dx = px + sx * tt - player.pos.x, dz = pz + sz * tt - player.pos.z;
        const dy = pos.y - (player.pos.y + 1.1);
        const d2 = dx * dx + dz * dz;
        if (!p.dodged && d2 < 0.55 * 0.55 && Math.abs(dy) < 1.1) {
          if (player.hurt(p.dmg, p.vel.clone().setY(0).normalize(), p)) end = true;
        }
      }
      if (end) {
        p.active = false; p.mesh.visible = false;
        this.fx.sparks(pos.clone(), p.vel.clone().normalize().negate(), 8, p.reflected ? 0x7ff6ff : 0xff6a5a);
      }
    }
  }
}
