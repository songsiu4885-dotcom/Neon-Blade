import { STATS, statById, statLevel, statPrice, statMaxed } from './chips.js';
import { STORY, WHO } from './story.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- 박사 호출: 전투가 끝나면 오른쪽에 버튼이 뜨고, 기계 부품으로 스탯을 올린다 (같은 스탯을 여러 번 올릴 수 있다) ----
export class DoctorShop {
  constructor(ctx) {
    this.ctx = ctx; // { inv, audio, blocked(), pause(bool), onChange() }
    this.btn = $('callBtn');
    this.panel = $('shop');
    this.open = false;
    this.available = false;
    this.calls = 0;
    const call = (e) => { e.stopPropagation(); e.preventDefault?.(); if (this.available && !this.open) this.show(); };
    this.btn.addEventListener('click', call);
    this.btn.addEventListener('touchstart', call, { passive: false });
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyC') {
        if (this.open) this.hide();
        else if (this.available && !this.ctx.blocked()) this.show();
      }
      if (e.code === 'Escape' && this.open) this.hide();
    });
  }

  reset() { this.calls = 0; this.setAvailable(false); this.hide(); }

  setAvailable(on) {
    if (on === this.available) return;
    this.available = on;
    this.btn.classList.toggle('on', on);
    if (on) this.btn.animate([{ transform: 'translateY(-50%) translateX(30px)', opacity: 0 }, { transform: 'translateY(-50%)', opacity: 1 }], { duration: 350, easing: 'ease-out' });
  }

  show() {
    this.open = true;
    this.ctx.pause(true);
    this.panel.className = 'on';
    this.greet = esc(STORY.docHello[this.calls % STORY.docHello.length]);
    this.calls++;
    this.render();
    this.ctx.audio.select?.();
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.panel.className = '';
    this.ctx.pause(false);
  }

  _buy(id) {
    const inv = this.ctx.inv, st = statById(id), lv = statLevel(inv.stats, id), price = st && statPrice(st, lv);
    if (!st || statMaxed(st, lv) || inv.credits < price) return this._deny();
    inv.credits -= price;
    inv.stats[id] = lv + 1;
    this.ctx.audio.chip?.();
    this.ctx.onChange();
    this.render();
    this.panel.querySelector(`[data-row="${id}"]`)?.animate([{ background: '#9fd8c855' }, { background: '' }], { duration: 450 });
  }
  _deny() { this.ctx.audio.bump?.(); this.panel.querySelector('.sh-cr')?.animate([{ color: '#ff6b5a' }, { color: '' }], { duration: 500 }); }

  render() {
    const inv = this.ctx.inv;
    let rows = '';
    for (const st of STATS) {
      const lv = statLevel(inv.stats, st.id), maxed = statMaxed(st, lv), price = statPrice(st, lv);
      rows += `<div class="sh-it${maxed ? ' own' : ''}" data-row="${st.id}"><div><b>${esc(st.name)} <em>Lv ${lv}${st.max != null ? ' / ' + st.max : ''}</em></b><span>단계마다 ${esc(st.unit)}</span></div>` +
        (maxed ? '<button disabled>최대</button>' : `<button data-id="${st.id}" ${inv.credits < price ? 'disabled' : ''}>⚙ ${price}</button>`) + '</div>';
    }
    const keep = this.panel.scrollTop;
    this.panel.className = 'on';
    this.panel.innerHTML =
      `<div class="sh-box"><div class="sh-head"><b style="color:${WHO.doc.color}">박사 · 원격 강화</b><span class="sh-cr">⚙ 기계 부품 ${inv.credits}</span></div>` +
      `<p class="sh-greet">"${this.greet}"</p>` +
      `<p class="sh-note">같은 스탯을 여러 번 올릴 수 있어요 · 올릴수록 필요한 부품이 늘어나요</p>` +
      `<div class="sh-list">${rows}</div><button class="btn alt sh-close">통신 종료 (C)</button></div>`;
    this.panel.scrollTop = keep;
    this.panel.querySelectorAll('.sh-it button[data-id]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this._buy(b.dataset.id); }));
    this.panel.querySelector('.sh-close').addEventListener('click', (e) => { e.stopPropagation(); this.hide(); });
  }
}

// ---- 배낭: 능력치 / 올린 스탯 + 설정 ----
export const SETTINGS_DEFAULT = { master: 0.8, music: 0.6, sens: 1, shake: true, quality: 'auto', help: true, rainFx: true, rainSound: true, autoCam: true };

export class Backpack {
  constructor(ctx) {
    this.ctx = ctx; // { inv, pause(bool), applySettings(s), settings, stats(), restart(), save(), lobby() }
    this.el = $('pack');
    this.setEl = $('settings');
    this.gear = $('gearBtn');
    this.btn = $('packBtn');
    this.isOpen = false;
    const toggle = (e) => { e.stopPropagation(); e.preventDefault?.(); this.toggle(); };
    this.btn.addEventListener('click', toggle);
    this.btn.addEventListener('touchstart', toggle, { passive: false });
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'KeyI') { e.preventDefault(); this.toggle(); }
      if (e.code === 'Escape' && this.isOpen) this.close();
    });
    const gear = (e) => { e.stopPropagation(); e.preventDefault?.(); this.toggleSettings(); };
    this.gear.addEventListener('click', gear);
    this.gear.addEventListener('touchstart', gear, { passive: false });
    this._renderSettings();
  }

  // 배낭 아래 톱니바퀴: 누를 때마다 설정 창을 열고 닫는다
  toggleSettings(force) {
    const on = force ?? !this.setEl.classList.contains('on');
    this.setEl.classList.toggle('on', on);
    this.gear.classList.toggle('on', on);
    this.ctx.audio.select?.();
  }

  toggle() { this.isOpen ? this.close() : this.openPack(); }
  openPack() {
    if (this.ctx.blocked()) return;
    this.isOpen = true;
    document.exitPointerLock?.();
    this.el.classList.add('on'); this.gear.classList.add('show'); this.btn.classList.add('on');
    this.setEl.classList.remove('on'); this.gear.classList.remove('on');
    this.ctx.pause(true);
    this.render();
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.remove('on'); this.setEl.classList.remove('on'); this.btn.classList.remove('on');
    this.gear.classList.remove('show', 'on');
    this.ctx.pause(false);
  }

  render() {
    const inv = this.ctx.inv, st = this.ctx.stats();
    const ups = STATS.filter((x) => statLevel(inv.stats, x.id));
    const upList = ups.length ? ups.map((x) => {
      const lv = statLevel(inv.stats, x.id);
      return `<div class="pchip on"><small>Lv ${lv}${x.max != null ? ' / ' + x.max : ''}</small><b>${esc(x.name)}</b><span>단계마다 ${esc(x.unit)}</span></div>`;
    }).join('') : '<p class="empty">아직 올린 스탯이 없다. 전투가 끝난 뒤 박사를 호출(C)하면 기계 부품으로 스탯을 올릴 수 있다.</p>';
    this.el.innerHTML =
      `<div class="pk-box"><div class="pk-head"><b>배낭</b><span>⚙ 기계 부품 ${inv.credits}</span></div>` +
      `<div class="pk-cols"><div class="pk-stats"><h4>능력치</h4>${st.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>` +
      `<div class="pk-chips"><h4>올린 스탯</h4><div class="pk-owned">${upList}</div></div></div>` +
      `<p class="pk-foot">Tab / I 로 열고 닫기 · 배낭을 여는 동안 게임이 멈춰요 · 톱니바퀴 = 설정</p></div>`;
  }

  _renderSettings() {
    const s = this.ctx.settings;
    this.setEl.innerHTML =
      `<h4>설정</h4>` +
      `<label>전체 볼륨<input type="range" min="0" max="1" step="0.05" data-k="master" value="${s.master}"></label>` +
      `<label>음악 볼륨<input type="range" min="0" max="1" step="0.05" data-k="music" value="${s.music}"></label>` +
      `<label>시점 감도<input type="range" min="0.3" max="2.5" step="0.1" data-k="sens" value="${s.sens}"></label>` +
      `<label class="row">화면 흔들림<input type="checkbox" data-k="shake" ${s.shake ? 'checked' : ''}></label>` +
      `<label class="row">비 내리는 효과<input type="checkbox" data-k="rainFx" ${s.rainFx ? 'checked' : ''}></label>` +
      `<label class="row">빗소리<input type="checkbox" data-k="rainSound" ${s.rainSound ? 'checked' : ''}></label>` +
      `<label class="row">카메라 자동 회전 (적 찾기)<input type="checkbox" data-k="autoCam" ${s.autoCam !== false ? 'checked' : ''}></label>` +
      `<label class="row">조작 안내 표시<input type="checkbox" data-k="help" ${s.help ? 'checked' : ''}></label>` +
      `<label class="row">그래픽 품질<select data-k="quality"><option value="auto"${s.quality === 'auto' ? ' selected' : ''}>자동 (권장)</option><option value="high"${s.quality === 'high' ? ' selected' : ''}>높음</option><option value="mid"${s.quality === 'mid' ? ' selected' : ''}>중간</option><option value="low"${s.quality === 'low' ? ' selected' : ''}>낮음 (빠름)</option></select></label>` +
      `<div class="set-btns"><button class="btn" id="setSave">저장하기</button><button class="btn alt" id="setLobby">로비로 나가기</button><button class="btn alt" id="setRestart">처음부터</button></div>`;
    this.setEl.querySelectorAll('[data-k]').forEach((el) => {
      const ev = el.type === 'range' ? 'input' : 'change';
      el.addEventListener(ev, () => {
        const k = el.dataset.k;
        s[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value;
        this.ctx.applySettings(s);
      });
      el.addEventListener('click', (e) => e.stopPropagation());
      el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    });
    this.setEl.querySelector('#setRestart').addEventListener('click', (e) => { e.stopPropagation(); this.close(); this.ctx.restart(); });
    this.setEl.querySelector('#setSave').addEventListener('click', (e) => { e.stopPropagation(); this.ctx.save(); });
    const lobby = this.setEl.querySelector('#setLobby');
    lobby.addEventListener('click', (e) => { // 실수로 누르지 않게 두 번 눌러야 나간다
      e.stopPropagation();
      if (!lobby.dataset.armed) { lobby.dataset.armed = '1'; lobby.textContent = '한 번 더 누르면 나가요 (저장 안 한 진행은 사라져요)'; this.ctx.audio.bump?.(); return; }
      this.ctx.lobby();
    });
  }
}
