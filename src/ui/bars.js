import * as THREE from 'three';

// 적 머리 위 체력바(+ 자세 게이지). DOM 오버레이로 그린다.
export class EnemyBars {
  constructor(container) {
    this.root = container;
    this.map = new Map();
    this._v = new THREE.Vector3();
  }

  _make() {
    const el = document.createElement('div');
    el.className = 'ebar';
    el.innerHTML = '<div class="hp"><i class="ghost"></i><i class="fill"></i></div><div class="ps"><i></i></div>';
    this.root.appendChild(el);
    return { el, ghost: el.querySelector('.ghost'), fill: el.querySelector('.fill'), ps: el.querySelector('.ps'), psf: el.querySelector('.ps i') };
  }

  update(enemies, camera, player) {
    const seen = new Set();
    const w = innerWidth, h = innerHeight;
    for (const e of enemies) {
      if (!e.alive) continue;
      if (e.boss) continue; // 보스는 상단 큰 체력바
      seen.add(e);
      let b = this.map.get(e);
      if (!b) { b = this._make(); this.map.set(e, b); }

      const top = e.flying ? e.pos.y + 0.95 : 2.65;
      const v = this._v.set(e.pos.x, top, e.pos.z).project(camera);
      const dist = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
      const visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && dist < 34;
      b.el.style.display = visible ? 'block' : 'none';
      if (!visible) continue;
      b.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px,${(-v.y * 0.5 + 0.5) * h}px) translate(-50%,-100%)`;
      b.el.style.opacity = Math.max(0.35, 1 - dist / 40);

      const hp = Math.max(0, e.hp / e.maxHp) * 100;
      b.fill.style.width = hp + '%';
      b.ghost.style.width = hp + '%'; // CSS transition이 지연되어 따라온다

      const hasPosture = e.maxPosture > 0;
      b.ps.style.display = hasPosture ? 'block' : 'none';
      if (hasPosture) {
        b.psf.style.width = (e.broken ? 100 : (e.posture / e.maxPosture) * 100) + '%';
        b.el.classList.toggle('broken', !!e.broken);
      }
    }
    for (const [e, b] of this.map) {
      if (!seen.has(e)) { b.el.remove(); this.map.delete(e); }
    }
  }

  clear() {
    for (const b of this.map.values()) b.el.remove();
    this.map.clear();
  }
}
