// 키보드/마우스/터치 입력을 하나의 상태 객체로 통합한다.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.move = { x: 0, y: 0 }; // x: 오른쪽, y: 앞쪽 (-1..1)
    this.lookDX = 0;
    this.lookDY = 0;
    this.dashPressed = false; // 한 프레임짜리 트리거
    this.attackPressed = false;
    this.mouseHeld = false;
    this.touchAttackHeld = false;
    this.isTouch = matchMedia('(pointer: coarse)').matches;
    if (this.isTouch) document.body.classList.add('touch');

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') { this.dashPressed = true; e.preventDefault(); }
      if (e.code === 'KeyJ') this.attackPressed = true;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('click', () => {
      if (!this.isTouch && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
    });
    addEventListener('mousedown', (e) => {
      if (e.button === 0 && document.pointerLockElement === canvas) { this.attackPressed = true; this.mouseHeld = true; }
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseHeld = false; });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) {
        this.lookDX += e.movementX;
        this.lookDY += e.movementY;
      }
    });

    this._initTouch();
  }

  _initTouch() {
    const stick = document.getElementById('stick');
    const knob = document.getElementById('knob');
    const zone = document.getElementById('lzone');
    this.stick = { id: null, x: 0, y: 0 };
    const R = 52;
    let ox = 0, oy = 0;

    // 왼쪽 화면 아무 곳이나 누르면 그 자리에 조이스틱이 생긴다
    const setStick = (t) => {
      let dx = t.clientX - ox, dy = t.clientY - oy;
      const len = Math.hypot(dx, dy);
      if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      this.stick.x = dx / R;
      this.stick.y = -dy / R;
    };
    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.stick.id !== null) return;
      const t = e.changedTouches[0];
      this.stick.id = t.identifier;
      ox = t.clientX; oy = t.clientY;
      stick.style.left = ox - 70 + 'px'; stick.style.top = oy - 70 + 'px';
      stick.classList.add('on');
      setStick(t);
    }, { passive: false });
    zone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === this.stick.id) setStick(t);
    }, { passive: false });
    const endStick = (e) => {
      for (const t of e.changedTouches) if (t.identifier === this.stick.id) {
        this.stick.id = null; this.stick.x = this.stick.y = 0;
        knob.style.transform = '';
        stick.classList.remove('on');
      }
    };
    zone.addEventListener('touchend', endStick);
    zone.addEventListener('touchcancel', endStick);

    const press = (el, down, up) => {
      el.addEventListener('touchstart', (e) => { e.preventDefault(); el.classList.add('down'); down(); }, { passive: false });
      const end = () => { el.classList.remove('down'); up?.(); };
      el.addEventListener('touchend', end);
      el.addEventListener('touchcancel', end);
    };
    press(document.getElementById('dashBtn'), () => { this.dashPressed = true; });
    press(document.getElementById('atkBtn'), () => { this.attackPressed = true; this.touchAttackHeld = true; }, () => { this.touchAttackHeld = false; });

    // 화면 오른쪽 드래그로 시점 회전 (버튼 바깥)
    const look = document.getElementById('rzone');
    let lookId = null, lx = 0, ly = 0;
    look.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
    }, { passive: false });
    look.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === lookId) {
        this.lookDX += (t.clientX - lx) * 1.5; this.lookDY += (t.clientY - ly) * 1.5;
        lx = t.clientX; ly = t.clientY;
      }
    }, { passive: false });
    const endLook = (e) => { for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null; };
    look.addEventListener('touchend', endLook);
    look.addEventListener('touchcancel', endLook);
  }

  // 매 프레임 한 번 호출. 이동 벡터 계산 및 한 프레임 입력 소비.
  poll() {
    let x = 0, y = 0;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    x += this.stick.x; y += this.stick.y;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    if (len < 0.12) { x = 0; y = 0; }
    this.move.x = x; this.move.y = y;

    const out = { move: this.move, lookDX: this.lookDX, lookDY: this.lookDY, dash: this.dashPressed,
      attack: this.attackPressed, attackHeld: this.mouseHeld || this.touchAttackHeld || this.keys.has('KeyJ') };
    this.lookDX = this.lookDY = 0;
    this.dashPressed = false;
    this.attackPressed = false;
    return out;
  }
}
