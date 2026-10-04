import * as THREE from 'three';

// 3인칭 추적 카메라: 뒤쪽 약간 위, 대시 방향으로 끌림, FOV 확장, 흔들림.
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0.38;
    this.distance = 7.5;
    this.baseFov = 68;
    this.world = null;
    this.fovKick = 0;      // 대시 중 추가 FOV
    this.pull = new THREE.Vector3(); // 대시 방향 끌림 (평활)
    this.target = new THREE.Vector3();
    this.shakeAmp = 0;
    this.kick = new THREE.Vector3(); // 방향성 짧은 킥
    this._tmp = new THREE.Vector3();
    this.sens = 1;
    this.shakeMul = 1;
  }

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
  right(out = new THREE.Vector3()) {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  shake(amp) { this.shakeAmp = Math.max(this.shakeAmp, amp * this.shakeMul); }
  addKick(dir, amt) { this.kick.addScaledVector(dir, amt * this.shakeMul); }

  // 이동 계산 전에 호출: 시점 입력 반영 (이동 방향이 최신 yaw를 쓰도록)
  applyLook(dt, input, isTouch) {
    this.yaw -= input.lookDX * 0.0025 * this.sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.lookDY * 0.002 * this.sens, 0.12, 0.9);
    // 터치: 자동 추적 - 옆으로 달리면 시점이 따라 돈다
    if (isTouch && input.move.y > 0.3 && Math.abs(input.lookDX) < 1) {
      this.yaw -= input.move.x * dt * 1.2;
    }
  }

  update(dt, player) {

    const k = 1 - Math.exp(-10 * dt);
    // 대시 방향으로 끌려가는 오프셋
    const wantPull = this._tmp.set(0, 0, 0);
    if (player.dashing) wantPull.copy(player.dashDir).multiplyScalar(0.9);
    this.pull.lerp(wantPull, 1 - Math.exp(-(player.dashing ? 18 : 7) * dt));

    // FOV 확장: dashT는 0..1 (대시 진행 중 1에 가까움)
    const wantFov = this.baseFov + (player.dashing ? 13 : 0) + player.speedRatio * 2;
    this.fovKick += (wantFov - this.baseFov - this.fovKick) * (1 - Math.exp(-(player.dashing ? 12 : 5) * dt));
    this.camera.fov = this.baseFov + this.fovKick;
    this.camera.updateProjectionMatrix();

    // 목표 지점: 플레이어 가슴 높이 + 끌림
    this.target.lerp(this._tmp.set(player.pos.x, player.pos.y + 1.4, player.pos.z).add(this.pull), k);

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    // 벽 충돌: 플레이어에서 카메라 쪽으로 조금씩 나가 보며 벽에 닿기 직전까지만 물러난다.
    // (예전처럼 벽 밖의 카메라를 옆으로 밀어 넣으면 화면이 튀고 방향이 바뀐다)
    const dx = Math.sin(this.yaw) * cp, dz = Math.cos(this.yaw) * cp;
    let free = this.distance;
    if (this.world?.open) {
      for (let d = 0.4; d <= this.distance; d += 0.2) {
        if (!this.world.open(this.target.x + dx * d, this.target.z + dz * d, 0.35)) { free = Math.max(0.2, d - 0.3); break; }
      }
    }
    // 벽 쪽으로는 빨리 당기고, 벽에서 멀어질 때는 천천히 원래 거리로
    this.curDist = this.curDist ?? this.distance;
    this.curDist += (free - this.curDist) * (1 - Math.exp(-(free < this.curDist ? 30 : 4) * dt));
    const dist = Math.min(this.curDist, this.distance);
    const lift = (1 - dist / this.distance) * 1.7; // 가까워지면 살짝 위에서 내려다본다 (주인공 등에 가리지 않게)
    const pos = this._tmp.set(
      this.target.x + Math.sin(this.yaw) * cp * dist,
      this.target.y + sp * dist + lift,
      this.target.z + Math.cos(this.yaw) * cp * dist
    );

    // 킥(감쇠) + 약한 흔들림
    this.kick.multiplyScalar(Math.exp(-14 * dt));
    pos.add(this.kick);
    if (this.shakeAmp > 0.001) {
      pos.x += (Math.random() - 0.5) * this.shakeAmp;
      pos.y += (Math.random() - 0.5) * this.shakeAmp;
      this.shakeAmp *= Math.exp(-12 * dt);
    }

    this.camera.position.copy(pos);
    this.camera.lookAt(this.target);
  }
}
