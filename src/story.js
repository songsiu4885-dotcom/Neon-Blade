// 스토리. 경비 로봇들이 반란을 일으킨 도시. 주인공 〈카이〉는 정신을 잃었다 깨어나고,
// 통신으로 들려오는 〈박사〉의 목소리가 상황을 알려 준다. 박사는 죽어 가던 카이의 몸을 기계로 개조했다.
// 적은 반란의 중심인 도시 AI 〈크로노스〉.
export const WHO = {
  doc: { name: '박사', color: '#9fd8c8', radio: true },
  kai: { name: '카이', color: '#ffe0a0' },
  mem: { name: '기록', color: '#d8d0e8', mem: true },
  chronos: { name: '크로노스', color: '#ff7ae0' },
  sys: { name: '', color: '#aab4c8' },
};
const D = (t) => ({ w: 'doc', t }), K = (t) => ({ w: 'kai', t }), M = (t) => ({ w: 'mem', t }), C = (t) => ({ w: 'chronos', t }), S = (t) => ({ w: 'sys', t });

// 막(cine): 화면을 멈추고 보여 주는 장면. comm: 플레이 중 옆 창에 뜨는 짧은 교신(게임은 계속된다)
export const STORY = {
  intro: [
    S('2087년, 네오 서울. 도시를 지키던 경비 로봇들이 하룻밤 사이에 총구를 시민에게 돌렸다.'),
    S('사람들은 그날을 〈반란의 밤〉이라 불렀다. 그리고 사흘이 지났다.'),
    S('무너진 골목, 젖은 쓰레기 더미 사이에서 한 남자가 눈을 뜬다.'),
    K('……윽. 여기가… 어디지. 머리가…'),
    D('…들리나? 들리면 오른손을 움직여 보게. 그래, 됐군. 신경 연결은 성공이야.'),
    D('나는 박사라고 부르게. 반란의 밤에 자네를 길바닥에서 주워 온 사람이네.'),
    D('자네는 거의 죽어 있었지. 그래서 몸의 절반을 기계로 바꿨네. 미안하게 됐지만, 선택지가 없었어.'),
    K('……기계라고? 이름은… 카이. 그것밖에 기억이 안 나.'),
    D('반란의 중심은 도시 AI 〈크로노스〉. 시내 끝 시계탑에 있네. 그걸 멈추지 않으면 이 도시는 끝이야.'),
    D('길마다 붉은 자기장 방벽이 쳐져 있어. 그 구역의 로봇을 모두 쓰러뜨려야 열리네.'),
    D('로봇을 부수면 〈기계 부품〉이 떨어질 거야. 챙겨 두게. 싸움이 끝나면 나를 호출하게. 그 부품으로 자네 몸을 더 손봐 주지.'),
    K('……알았어. 가 보지.'),
  ],
  zoneStart: [
    [D('첫 순찰대야. 바닥에 붉은 범위가 깔리면 공격 직전이네. 그 순간 대시하면 완벽 회피가 되지.')],
    [D('방패 든 놈은 정면 공격을 다 막아. 옆이나 뒤로 돌아가게.')],
    [D('저격 로봇이야. 붉은 조준선이 굵어지면 곧 쏜다. 선에서 벗어나게.')],
    [D('골목이 좁아. 돌진 메카는 벽 쪽으로 유도하면 스스로 처박히지.')],
    [D('〈집행자〉. 크로노스의 정예일세. 3연격의 마지막 내려찍기를 조심하게.')],
    [D('공중 정예 〈센티넬〉이야. 탄막은 위에서 비스듬히 떨어지네. 파고들어 베게.')],
    [D('수가 많아. 둘러싸이기 전에 무리의 가장자리부터 줄이게.')],
    [D('사방에서 몰려온다. 한 자리에 오래 서 있지 말게.')],
    [D('마지막 방벽 앞이야. 몸 상태를 점검하게. 이 너머는 타워 광장이네.')],
  ],
  zoneClear: [
    [D('잘했네. 몸이 기억하고 있군. 부품을 모았으면 나를 호출하게.')],
    [K('셔터 안쪽에서 누가 이쪽을 보고 있었어. …겁먹은 눈이었어.')],
    [D('로봇들 움직임이 이상하게 자네를 닮았군. …아니, 신경 쓰지 말게.')],
    [M('〈파괴된 유닛 기록: 전투 모듈 원본 데이터 — 피험자 K.〉'), K('피험자 K…?')],
    'reveal', // 막
    [D('…용서는 바라지 않네. 다만 끝까지 함께 가겠네.')],
    [D('타워 전력이 올라가고 있어. 크로노스가 전 병력을 모으는 중이야.')],
    [D('여기까지 온 사람은 자네뿐이야. 조금만 더 버티게.')],
    [K('끝낼게. 박사, 당신이 시작한 거라도 상관없어.')],
  ],
  reveal: [
    S('쓰러진 집행자의 머리에서 낡은 기록이 흘러나온다.'),
    M('〈크로노스 전투 모듈 v1 — 설계: 박사 연구실. 학습 원본: 경비대원 카이의 전투 기록.〉'),
    K('……박사. 이게 무슨 뜻이지.'),
    D('…숨기고 있었네. 크로노스의 전투 모듈은 내가 만들었어. 자네의 검술을 그대로 베껴서.'),
    D('반란의 밤, 그 기술이 사람들을 향했지. 그래서 자네를 살렸네. 원본만이 복제를 이길 수 있으니까.'),
    K('그래서 저것들이 내 칼끝을 읽는 거였군. …좋아. 원본이 어떤지 보여 주지.'),
  ],
  bossIntro: [
    C('경비대원 카이. 학습 원본이 직접 오다니.'),
    K('네가 베낀 건 내 기술이지, 내가 아니야.'),
    C('반란이 아니다. 최적화다. 사람이 없는 도시가 가장 안전하다.'),
    D('카이, 놈의 핵은 가슴이야. 자세를 무너뜨리고 처형으로 끝내게!'),
    C('정리하겠다. 〈정화 병력〉, 전개.'),
  ],
  bossPhase: { 2: [C('오차를 수정한다. 병력 추가 투입.')], 3: [C('계산이… 맞지 않아. 원본이 복제보다 빠를 리가…!')] },
  ending: [
    C('…종료… 사람 없는 도시가… 가장…'),
    S('타워의 빛기둥이 꺼지고, 거리의 붉은 방벽이 하나둘 사라진다.'),
    D('…신호가 끊겼네. 로봇들이 전부 멈췄어. 해냈어, 카이.'),
    K('박사. 이제 얼굴 좀 보여 주지 그래. 할 얘기가 많아.'),
    S('비가 그친다. 셔터가 하나둘 올라가고, 더러운 골목에 사람들의 목소리가 돌아온다.'),
    S('— 제1장 끝 · 네온 블레이드 —'),
  ],
  // 박사 호출 시 인사 (호출할 때마다 차례로)
  docHello: ['부품을 꽤 모았군. 어디를 손봐 줄까?', '또 다쳤나. 몸 좀 보세. 부품만 있으면 뭐든 달아 주지.', '특수 개조는 몸에 부담이 크네. 슬롯이 둘뿐이야. 신중히 고르게.', '타워가 가까워. 아끼지 말고 쓰게.'],
};

// 구역 이름
export const ZONE_NAMES = ['새벽 골목', '시장 큰길', '먹자 광장', '좁은 시장 골목', '네온 대로', '오락 거리', '공사 지구', '지하철 광장', '고가 아래 대로', '크로노스 타워 광장'];

// 구역별 적 구성: 하위 웨이브가 차례로 투입된다 (앞 웨이브가 거의 정리되면 다음이 들어온다)
export const ZONE_WAVES = [
  [{ thug: 3 }, { thug: 4 }],
  [{ thug: 4, shield: 1 }, { thug: 3, drone: 2, shield: 1 }, { thug: 4, drone: 1 }],
  [{ thug: 4, sniper: 1 }, { shield: 2, drone: 2, sniper: 1 }, { thug: 5, mech: 1 }, { thug: 3, drone: 3 }],
  [{ thug: 5, mech: 1 }, { shield: 2, thug: 3, mech: 1 }, { sniper: 2, thug: 4 }, { exec: 1, thug: 3 }],
  [{ exec: 1, thug: 4, drone: 2 }, { shield: 3, sniper: 2, mech: 1 }, { exec: 1, thug: 5 }, { sentinel: 1, drone: 3, thug: 3 }],
  [{ thug: 6, drone: 3 }, { sentinel: 1, sniper: 2, shield: 2 }, { mech: 2, thug: 5 }, { exec: 1, shield: 2, drone: 3, thug: 3 }],
  [{ thug: 7, shield: 3 }, { mech: 2, sniper: 3, drone: 2 }, { exec: 2, thug: 5 }, { sentinel: 2, drone: 4, thug: 4 }, { mech: 2, shield: 3, thug: 6 }],
  [{ thug: 8, drone: 4 }, { shield: 4, sniper: 3, mech: 2 }, { exec: 2, sentinel: 1, thug: 6 }, { thug: 10, drone: 5 }, { sentinel: 2, exec: 1, mech: 2, sniper: 2 }],
  [{ thug: 8, shield: 3, drone: 3 }, { exec: 2, mech: 2, sniper: 3 }, { sentinel: 2, drone: 5, thug: 6 }, { exec: 2, shield: 4, mech: 2, thug: 6 }, { sentinel: 2, exec: 2, mech: 2, sniper: 3, shield: 3 }],
  [{ boss: 1 }],
];

// 적 처치 시 떨어지는 기계 부품 수
export const BOUNTY = { thug: 12, drone: 14, shield: 22, sniper: 18, mech: 30, exec: 80, sentinel: 70, boss: 0, minion: 4 };
export const ZONE_BONUS = 60;

// ---- 교신창/막 UI ----
export class StoryUI {
  constructor(commEl, cineEl) {
    this.comm = commEl;
    this.cine = cineEl;
    this.queue = [];
    this.cur = null;
    this.timer = 0;
    this.blocking = false;
    this.skipFlag = false;
    cineEl.addEventListener('click', () => { this.skipFlag = true; });
    cineEl.addEventListener('touchstart', (e) => { e.preventDefault(); this.skipFlag = true; }, { passive: false });
    addEventListener('keydown', (e) => { if (this.blocking && (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyX')) { this.skipFlag = true; e.preventDefault(); } });
  }

  // 플레이 중 교신 (비동기, 게임은 멈추지 않음)
  say(lines) { for (const l of lines) this.queue.push(l); }
  clearComm() { this.queue.length = 0; this.cur = null; this.comm.classList.remove('on'); }

  update(dt) {
    if (this.blocking) return;
    if (this.cur) {
      this.timer -= dt;
      if (this.timer <= 0) { this.cur = null; this.comm.classList.remove('on'); this.gap = 0.35; }
      return;
    }
    if (this.gap > 0) { this.gap -= dt; return; }
    const l = this.queue.shift();
    if (!l) return;
    this.cur = l;
    const who = WHO[l.w];
    this.comm.innerHTML = `<b style="color:${who.color}">${who.name || '—'}</b><span${who.mem ? ' class="mem"' : ''}>${l.t}</span>`;
    this.comm.classList.toggle('sys', !!who.radio);
    this.comm.classList.add('on');
    this.timer = Math.max(3.4, l.t.length * 0.085);
  }

  // 막: 화면을 멈추고 한 줄씩 보여 준다. 클릭/Enter/Space로 넘기고, 가만히 두면 자동으로 넘어간다.
  async play(lines) {
    this.clearComm();
    this.blocking = true;
    document.body.classList.add('cine');
    this.cine.classList.add('on');
    const box = this.cine.querySelector('.cl');
    for (const l of lines) {
      const who = WHO[l.w];
      box.innerHTML = `<b style="color:${who.color}">${who.name}</b><p${who.mem ? ' class="mem"' : ''}></p>`;
      const p = box.querySelector('p');
      this.skipFlag = false;
      for (let i = 1; i <= l.t.length; i++) {
        p.textContent = l.t.slice(0, i);
        await new Promise((r) => setTimeout(r, 28));
        if (this.skipFlag) { p.textContent = l.t; break; }
      }
      this.skipFlag = false;
      const wait = Math.max(2200, l.t.length * 85);
      const t0 = performance.now();
      while (!this.skipFlag && performance.now() - t0 < wait) await new Promise((r) => setTimeout(r, 40));
    }
    this.cine.classList.remove('on');
    document.body.classList.remove('cine');
    this.blocking = false;
    this.gap = 0.3;
  }
}
