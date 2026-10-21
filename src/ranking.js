// 무한 모드 랭킹: 이 브라우저(localStorage)에 상위 20개 기록을 남긴다.
const KEY = 'nb_rank';
export const RANK_MAX = 20;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sortRank = (a, b) => b.score - a.score || b.wave - a.wave || a.time - b.time;

export function loadRank() {
  try { const l = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(l) ? l.filter((r) => r && typeof r.score === 'number').sort(sortRank) : []; } catch { return []; }
}
// 기록을 넣고 몇 등인지 돌려준다 (순위 밖이면 0)
export function addRank(rec) {
  const list = loadRank();
  const entry = { name: String(rec.name).slice(0, 10), score: rec.score, wave: rec.wave, kills: rec.kills, time: Date.now() };
  list.push(entry); list.sort(sortRank);
  const place = list.indexOf(entry) + 1;
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, RANK_MAX))); } catch { return -1; }
  return place <= RANK_MAX ? place : 0;
}
// 등록하기 전에 이 점수가 몇 등쯤인지
export function previewPlace(score, wave) {
  const list = loadRank();
  const n = list.filter((r) => r.score > score || (r.score === score && r.wave >= wave)).length + 1;
  return n <= RANK_MAX ? n : 0;
}

export function rankTable(list, mark = -1) {
  if (!list.length) return '<p class="rk-empty">아직 기록이 없어요. 무한 모드에서 첫 기록을 남겨 보세요!</p>';
  return '<table class="rk-tb"><thead><tr><th>순위</th><th>이름</th><th>점수</th><th>웨이브</th></tr></thead><tbody>' +
    list.slice(0, RANK_MAX).map((r, i) => `<tr class="${i === mark ? 'me' : ''}${i < 3 ? ' top' + (i + 1) : ''}"><td>${i + 1}</td><td>${esc(r.name)}</td><td>${r.score}</td><td>${r.wave}</td></tr>`).join('') +
    '</tbody></table>';
}
