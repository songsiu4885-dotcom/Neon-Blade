import * as THREE from 'three';

// 샌드백 적: 맞으면 밀려나고 기울고 번쩍인다. 죽으면 일정 시간 뒤 부활.
export class Dummy {
  constructor(x, z) {
    this.home = new THREE.Vector3(x, 0, z);
    this.group = new THREE.Group();
    this.pos = this.group.position;
    this.pos.copy(this.home);
    this.radius = 0.7;
    this.maxHp = 120;
    this.hp = this.maxHp;
    this.alive = true;
    this.vel = new THREE.Vector3();
    this.lean = 0;
    this.leanDir = new THREE.Vector3(0, 0, 1);
    this.flash = 0;
    this.respawn = 0;
    this.spawnT = 1;

    this.mat = new THREE.MeshStandardMaterial({ color: 0x161a30, roughness: 0.5, metalness: 0.7, emissive: 0x000000 });
    this.rimMat = new THREE.MeshBasicMaterial({ color: 0xff2bd6 });
    this.body = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.42, 1.3, 6), this.mat);
    torso.position.y = 1.05;
    const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), this.mat);
    head.position.y = 2.0;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.4, 6), this.mat);
    base.position.y = 0.2;
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 4, 6).rotateX(Math.PI / 2), this.rimMat);
    r1.position.y = 1.35;
    const r2 = r1.clone(); r2.position.y = 0.75;
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.1), this.rimMat);
    eye.position.set(0, 2.02, -0.3);
    this.body.add(torso, head, base, r1, r2, eye);
    this.group.add(this.body);
  }

  takeHit(dmg, dir, knock, launch = 0) {
    this.hp -= dmg;
    this.vel.set(dir.x * knock, 0, dir.z * knock);
    this.lean = 0.5 + Math.min(0.5, knock * 0.02);
    this.leanDir.copy(dir);
    this.flash = 0.09;
    this.launchY = launch;
    if (this.hp <= 0) {
      this.alive = false;
      this.group.visible = false;
      this.respawn = 2.5;
      return true;
    }
    return false;
  }

  update(dt) {
    if (!this.alive) {
      this.respawn -= dt;
      if (this.respawn <= 0) {
        this.alive = true; this.hp = this.maxHp;
        this.pos.copy(this.home); this.vel.set(0, 0, 0);
        this.group.visible = true; this.spawnT = 0; this.lean = 0;
      }
      return;
    }
    this.pos.addScaledVector(this.vel, dt);
    this.vel.multiplyScalar(Math.exp(-6 * dt));
    const d = Math.hypot(this.pos.x, this.pos.z);
    if (d > 42) { this.pos.x *= 42 / d; this.pos.z *= 42 / d; }

    this.lean *= Math.exp(-7 * dt);
    this.body.rotation.set(this.lean * this.leanDir.z, 0, -this.lean * this.leanDir.x);

    this.flash = Math.max(0, this.flash - dt);
    const f = this.flash > 0;
    this.mat.emissive.setHex(f ? 0xffffff : 0x000000);
    this.rimMat.color.setHex(f ? 0xffffff : 0xff2bd6);

    if (this.spawnT < 1) {
      this.spawnT = Math.min(1, this.spawnT + dt * 3);
      this.group.scale.setScalar(0.2 + 0.8 * this.spawnT);
    }
  }
}
