import { CHIPS, SLOTS, KIT, chipById } from './chips.js';
import { STORY, WHO } from './story.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- 박사 호출: 전투가 끝나면 오른쪽에 버튼이 뜨고, 기계 부품으로 몸을 개조한다 ----
// 기본 개조: 능력치 칩 / 특수 개조: 오버드라이브(폭주) 같은 특수 능력 칩
export class DoctorShop {
  constructor(ctx) {
    this.ctx = ctx; // { inv, audio, blocked(), pause(bool), onChange() }
    this.btn = $('callBtn');
    this.panel = $('shop');
    this.open = false;
    this.available = false;
    this.tab = 'basic';
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

  reset() { this.calls = 0; this.tab = 'basic'; this.setAvailable(false); this.hide(); }

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
    const inv = this.ctx.inv;
    if (id === 'kit') {
      if (inv.credits < KIT.price || inv.kits >= KIT.max) return this._deny();
      inv.credits -= KIT.price; inv.kits++;
    } else {
      const c = chipById(id);
      if (!c || inv.owned.includes(id) || inv.credits < c.price) return this._deny();
      inv.credits -= c.price; inv.owned.push(id);
      // 빈 슬롯이 있으면 바로 장착
      if (inv.equipped.filter((e) => chipById(e).kind === c.kind).length < SLOTS[c.kind]) inv.equipped.push(id);
    }
    this.ctx.audio.chip?.();
    this.ctx.onChange();
    this.render();
  }
  _deny() { this.ctx.audio.bump?.(); this.panel.querySelector('.sh-cr')?.animate([{ color: '#ff6b5a' }, { color: '' }], { duration: 500 }); }

  render() {
    const inv = this.ctx.inv, tab = this.tab;
    const items = CHIPS.filter((c) => c.kind === tab);
    let rows = '';
    if (tab === 'basic') {
      const full = inv.kits >= KIT.max;
      rows += `<div class="sh-it"><div><b>${KIT.name}</b><span>${KIT.desc} · 보유 ${inv.kits}/${KIT.max}</span></div><button data-id="kit" ${full || inv.credits < KIT.price ? 'disabled' : ''}>⚙ ${KIT.price}</button></div>`;
    }
    for (const c of items) {
      const own = inv.owned.includes(c.id);
      rows += `<div class="sh-it${own ? ' own' : ''}"><div><b>${esc(c.name)}</b><span>${esc(c.desc)}</span></div>` +
        (own ? '<button disabled>보유</button>' : `<button data-id="${c.id}" ${inv.credits < c.price ? 'disabled' : ''}>⚙ ${c.price}</button>`) + '</div>';
    }
    this.panel.className = 'on ' + tab;
    this.panel.innerHTML =
      `<div class="sh-box"><div class="sh-head"><b style="color:${WHO.doc.color}">박사 · 원격 개조</b><span class="sh-cr">⚙ 기계 부품 ${inv.credits}</span></div>` +
      `<p class="sh-greet">"${this.greet}"</p>` +
      `<div class="sh-tabs"><button data-tab="basic" class="${tab === 'basic' ? 'on' : ''}">기본 개조</button><button data-tab="special" class="${tab === 'special' ? 'on' : ''}">특수 개조</button></div>` +
      `<p class="sh-note">${tab === 'basic' ? `기본 칩 슬롯 ${SLOTS.basic}개 · 체력, 공격력, 방어 같은 능력치를 올린다` : `특수 칩 슬롯 ${SLOTS.special}개 · 싸우는 방식을 바꾸는 특수 능력`} · 산 칩은 배낭에서 바꿔 낄 수 있다</p>` +
      `<div class="sh-list">${rows}</div><button class="btn alt sh-close">통신 종료 (C)</button></div>`;
    this.panel.querySelectorAll('.sh-it button[data-id]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this._buy(b.dataset.id); }));
    this.panel.querySelectorAll('.sh-tabs button').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.tab = b.dataset.tab; this.ctx.audio.select?.(); this.render(); }));
    this.panel.querySelector('.sh-close').addEventListener('click', (e) => { e.stopPropagation(); this.hide(); });
  }
}

// ---- 배낭: 능력치 / 장착 칩 / 보유 칩 / 아이템 + 설정 ----
export const SETTINGS_DEFAULT = { master: 0.8, music: 0.6, sens: 1, shake: true, quality: 'high', help: true };

export class Backpack {
  constructor(ctx) {
    this.ctx = ctx; // { inv, onChange(), useKit(), pause(bool), applySettings(s), settings, stats(), restart() }
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

  _toggleEquip(id) {
    const inv = this.ctx.inv, c = chipById(id);
    const i = inv.equipped.indexOf(id);
    if (i >= 0) inv.equipped.splice(i, 1);
    else {
      if (inv.equipped.filter((e) => chipById(e).kind === c.kind).length >= SLOTS[c.kind]) {
        this.el.querySelector(`.slots.${c.kind}`)?.animate([{ outline: '1px solid #ff6b5a' }, { outline: '1px solid transparent' }], { duration: 600 });
        this.ctx.audio.bump?.();
        return;
      }
      inv.equipped.push(id);
    }
    this.ctx.audio.select?.();
    this.ctx.onChange();
    this.render();
  }

  render() {
    const inv = this.ctx.inv, st = this.ctx.stats();
    const slotRow = (kind) => {
      const eq = inv.equipped.filter((e) => chipById(e).kind === kind);
      let h = '';
      for (let i = 0; i < SLOTS[kind]; i++) {
        const c = eq[i] && chipById(eq[i]);
        h += c ? `<button class="slot full" data-id="${c.id}" title="눌러서 해제"><b>${esc(c.name)}</b><small>${esc(c.desc)}</small></button>` : '<div class="slot">빈 슬롯</div>';
      }
      return `<div class="slots ${kind}">${h}</div>`;
    };
    const ownedList = inv.owned.length ? inv.owned.map((id) => {
      const c = chipById(id), on = inv.equipped.includes(id);
      return `<button class="pchip ${c.kind}${on ? ' on' : ''}" data-id="${id}"><small>${c.kind === 'basic' ? '기본' : '특수'}${on ? ' · 장착 중' : ''}</small><b>${esc(c.name)}</b><span>${esc(c.desc)}</span></button>`;
    }).join('') : '<p class="empty">아직 칩이 없다. 전투가 끝난 뒤 박사를 호출하면 기계 부품으로 개조할 수 있다.</p>';
    this.el.innerHTML =
      `<div class="pk-box"><div class="pk-head"><b>배낭</b><span>⚙ 기계 부품 ${inv.credits}</span></div>` +
      `<div class="pk-cols"><div class="pk-stats"><h4>능력치</h4>${st.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}` +
      `<h4>아이템</h4><div class="pk-kit"><span>${KIT.name} × ${inv.kits}</span><button class="btn" id="useKit" ${inv.kits ? '' : 'disabled'}>사용 (Q)</button></div></div>` +
      `<div class="pk-chips"><h4>기본 칩 슬롯 (${inv.equipped.filter((e) => chipById(e).kind === 'basic').length}/${SLOTS.basic})</h4>${slotRow('basic')}` +
      `<h4>특수 칩 슬롯 (${inv.equipped.filter((e) => chipById(e).kind === 'special').length}/${SLOTS.special})</h4>${slotRow('special')}` +
      `<h4>보유 칩 · 눌러서 장착/해제</h4><div class="pk-owned">${ownedList}</div></div></div>` +
      `<p class="pk-foot">Tab / I 로 열고 닫기 · 배낭을 여는 동안 게임이 멈춰요</p></div>`;
    this.el.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this._toggleEquip(b.dataset.id); }));
    this.el.querySelector('#useKit')?.addEventListener('click', (e) => { e.stopPropagation(); this.ctx.useKit(); this.render(); });
  }

  _renderSettings() {
    const s = this.ctx.settings;
    this.setEl.innerHTML =
      `<h4>설정</h4>` +
      `<label>전체 볼륨<input type="range" min="0" max="1" step="0.05" data-k="master" value="${s.master}"></label>` +
      `<label>음악 볼륨<input type="range" min="0" max="1" step="0.05" data-k="music" value="${s.music}"></label>` +
      `<label>시점 감도<input type="range" min="0.3" max="2.5" step="0.1" data-k="sens" value="${s.sens}"></label>` +
      `<label class="row">화면 흔들림<input type="checkbox" data-k="shake" ${s.shake ? 'checked' : ''}></label>` +
      `<label class="row">조작 안내 표시<input type="checkbox" data-k="help" ${s.help ? 'checked' : ''}></label>` +
      `<label class="row">그래픽 품질<select data-k="quality"><option value="high"${s.quality === 'high' ? ' selected' : ''}>높음</option><option value="low"${s.quality === 'low' ? ' selected' : ''}>낮음 (빠름)</option></select></label>` +
      `<div class="set-btns"><button class="btn alt" id="setRestart">처음부터</button></div>`;
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
  }
}
