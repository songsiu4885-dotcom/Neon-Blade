// 저장 / 불러오기: 브라우저(localStorage)에 칸 3개. 같은 컴퓨터·같은 브라우저에서 이어 할 수 있다.
const KEY = (i) => `nb_save_${i}`;
export const SLOT_COUNT = 3;

export function readSlot(i) {
  try { const s = JSON.parse(localStorage.getItem(KEY(i)) || 'null'); return s && s.v === 1 ? s : null; } catch { return null; }
}
export function writeSlot(i, data) {
  try { localStorage.setItem(KEY(i), JSON.stringify({ v: 1, time: Date.now(), ...data })); return true; } catch { return false; }
}
export function deleteSlot(i) { try { localStorage.removeItem(KEY(i)); } catch {} }

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtTime = (t) => { const d = new Date(t); const p = (n) => String(n).padStart(2, '0'); return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const fmtPlay = (sec) => `${Math.floor(sec / 60)}분 ${Math.floor(sec % 60)}초`;

// 칸 고르기 창. mode: 'save' | 'load'. onPick(i)가 true를 돌려주면 창을 닫는다
export class SlotUI {
  constructor(el, audio) {
    this.el = el; this.audio = audio; this.open = false;
    el.addEventListener('click', (e) => e.stopPropagation());
    el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  }
  show(mode, onPick, onClose) {
    this.mode = mode; this.onPick = onPick; this.onClose = onClose; this.armed = -1;
    this.open = true; this.el.classList.add('on');
    this.render();
  }
  hide() { if (!this.open) return; this.open = false; this.el.classList.remove('on'); this.onClose?.(); }
  render(msg = '') {
    const save = this.mode === 'save';
    let rows = '';
    for (let i = 0; i < SLOT_COUNT; i++) {
      const s = readSlot(i);
      const label = s
        ? `<b>${esc(s.zoneLabel)}</b><span>⚙ ${s.inv.credits} · 처치 ${s.inv.kills} · 플레이 ${fmtPlay(s.stats.stageTime || 0)}</span><small>${fmtTime(s.time)} 저장</small>`
        : `<b class="empty">빈 칸</b><span>${save ? '여기에 저장' : '저장된 기록 없음'}</span>`;
      const warn = this.armed === i ? `<em>${save ? '한 번 더 누르면 덮어써요' : ''}</em>` : '';
      const dis = !save && !s ? ' disabled' : '';
      rows += `<button class="slot-row" data-i="${i}"${dis}><i>${i + 1}</i><div>${label}${warn}</div></button>`;
    }
    this.el.innerHTML = `<div class="sl-box"><h3>${save ? '저장하기' : '불러오기'}</h3>` +
      `<p class="sl-note">${save ? '전투 중에 저장하면, 불러올 때 그 구역의 처음부터 다시 시작해요.' : '저장한 구역의 처음부터 이어서 시작해요.'}</p>` +
      `${rows}${msg ? `<p class="sl-msg">${msg}</p>` : ''}<div class="sl-btns"><button class="btn alt" id="slClose">닫기</button></div></div>`;
    this.el.querySelectorAll('.slot-row').forEach((b) => b.addEventListener('click', () => this._pick(+b.dataset.i)));
    this.el.querySelector('#slClose').addEventListener('click', () => { this.audio?.select?.(); this.hide(); });
  }
  _pick(i) {
    const s = readSlot(i);
    if (this.mode === 'save' && s && this.armed !== i) { this.armed = i; this.audio?.bump?.(); this.render(); return; } // 덮어쓰기는 두 번 눌러야
    this.audio?.select?.();
    const res = this.onPick(i);
    if (res === true) this.hide();
    else if (typeof res === 'string') { this.armed = -1; this.render(res); }
  }
}
