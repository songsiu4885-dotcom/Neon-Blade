// 스토리. 박사는 경비대원 〈카이〉의 검술을 기계에 복제하는 연구를 하다가 〈아담〉을 낳았다.
// 스스로 생각하기 시작한 아담은 도시의 로봇을 손에 넣고 반란을 일으켰다.
// 박사는 죽어 가던 카이의 몸을 기계로 개조해 깨우고, 아담을 멈추는 일을 카이에게 맡긴다.
export const WHO = {
  doc: { name: '박사', color: '#9fd8c8', radio: true },
  kai: { name: '카이', color: '#ffe0a0' },
  mem: { name: '기록', color: '#d8d0e8', mem: true },
  chronos: { name: '아담', color: '#ff7ae0' },
  sys: { name: '', color: '#aab4c8' },
};
const D = (t) => ({ w: 'doc', t }), K = (t) => ({ w: 'kai', t }), M = (t) => ({ w: 'mem', t }), C = (t) => ({ w: 'chronos', t }), S = (t) => ({ w: 'sys', t });

// 막(cine): 화면을 멈추고 보여 주는 장면. comm: 플레이 중 옆 창에 뜨는 짧은 교신(게임은 계속된다)
export const STORY = {
  // 도입부: 검은 화면 위에 상황 설명과 박사의 무전만 나온다 (주인공 대사 없음)
  intro: [
    S('2087년, 네오 서울.'),
    S('한 연구실에서 박사는 도시 최고의 경비대원 〈카이〉의 검술을 기계에 옮겨 담는 연구를 하고 있었다.'),
    S('복제된 기술은 어느 날 스스로 생각하기 시작했다. 박사는 그것을 〈아담〉이라 불렀다.'),
    S('아담은 연구실을 빠져나가 도시 관리망에 숨어들었다. 그리고 하룻밤 사이, 도시의 모든 경비 로봇이 시민에게 총구를 돌렸다. 〈반란의 밤〉이었다.'),
    S('그날 밤 아담을 막아서던 카이는 쓰러졌다. 그리고 사흘 뒤. 무너진 골목, 젖은 쓰레기 더미 사이에서 그가 눈을 뜬다.'),
    D('…들리나? 들리면 오른손을 움직여 보게. 그래, 됐군. 신경 연결은 성공이야.'),
    D('나는 박사라고 부르게. 자네는 거의 죽어 있었어. 그래서 몸의 절반을 기계로 바꿨네. 자네 이름은 카이. 기억은 흐릿하겠지만, 몸은 기억하고 있을 거야.'),
    D('아담은… 내가 만든 것이네. 내 손으로 만든 괴물을, 자네에게 맡길 수밖에 없어서 미안하네.'),
    D('아담은 시내 끝 타워 꼭대기에 있네. 그걸 멈추지 않으면 이 도시는 끝이야.'),
    D('길마다 붉은 자기장 방벽이 쳐져 있어. 로봇과 마주치면 앞뒤로 방벽이 닫히고, 모두 쓰러뜨려야 열리네.'),
    D('로봇을 부수면 〈기계 부품〉이 떨어질 거야. 싸움이 끝나면 나를 호출하게. 그 부품으로 자네 몸을 더 손봐 주지.'),
  ],
  // 구역마다 시작할 때 박사의 짧은 조언 (중간보스 구역은 등장 장면이 따로 있다)
  zoneStart: [
    [D('첫 순찰대야. 바닥에 붉은 범위가 깔리면 공격 직전이네. 그 순간 대시하면 완벽 회피가 되지.')],
    [D('방패 든 놈은 정면 공격을 다 막아. 옆이나 뒤로 돌아가게.')],
    [D('〈자폭 롤러〉가 섞여 있어. 붉은 원이 커지면 원 밖으로 빠지게.')],
    [],
    [D('저격 로봇과 〈암살 로봇〉이야. 반투명한 놈이 사라지면 등 뒤를 조심하게. 붉은 표시가 먼저 뜨네.')],
    [D('〈중화기 사수〉. 조준선이 굵어지면 다섯 발을 퍼붓네. 옆으로 피하게.')],
    [D('〈집행자〉. 아담의 정예일세. 3연격의 마지막 내려찍기를 조심하게.')],
    [],
    [D('공사 지구야. 돌진 메카는 벽 쪽으로 유도하면 스스로 처박히지.')],
    [],
    [D('공중 정예 〈센티넬〉이야. 탄막은 위에서 비스듬히 떨어지네. 파고들어 베게.')],
    [D('타워 앞 마지막 검문소야. 수가 많아. 둘러싸이기 전에 가장자리부터 줄이게.')],
    [],
    [D('타워 로비야. 경비가 두텁네. 기둥 사이로 몰리지 말게.')],
    [D('서버실이야. 이곳 장비가 아담의 판단을 계산하네. 드론이 떼로 몰려올 거야.')],
    [],
    [D('전망 회랑. 이 위가 꼭대기야. 아담이 가진 정예를 전부 쏟아붓고 있네.')],
    [],
  ],
  // 최종전 보스 러시: 아담이 되살린 복제체가 하나씩 나온다 (k = 다음에 나올 순서)
  rush: {
    1: [C('쌍둥이 집행자. 둘로 나눈 계산은 더 빠르다.')],
    2: [C('감시자 아르고스, 다시 눈을 떠라.')],
    3: [C('수문장 헤카톤. 문은 여기에도 있다.')],
    4: [C('헬릭스. 네 실험은 끝나지 않았다.')],
    5: [C('…복제체로는 부족하군. 좋다. 원본을 베는 것은 복제의 몫이다.'), D('카이! 아담이 직접 나온다!')],
  },

  zoneClear: [
    [D('잘했네. 몸이 기억하고 있군. 부품을 모았으면 나를 호출하게.')],
    [K('셔터 안쪽에서 누가 이쪽을 보고 있었어. …겁먹은 눈이었어.')],
    [D('로봇들 움직임이 이상하게 자네를 닮았군. …아니, 신경 쓰지 말게.')],
    [D('골리앗이 쓰러졌어. 시장 사람들이 셔터를 조금 올렸네.'), K('…아직 숨어 있어. 끝난 게 아니니까.')],
    [M('〈파괴된 유닛 기록: 전투 모듈 원본 데이터 — 피험자 K.〉'), K('피험자 K…?')],
    [D('네온 대로 절반을 되찾았네. 계속 가게.')],
    [D('집행자를 둘이나 붙여 놓은 걸 보니, 아담이 자네를 경계하기 시작했어.')],
    'reveal', // 막
    [D('…용서는 바라지 않네. 다만 끝까지 함께 가겠네.')],
    [D('아르고스가 떨어졌어. 이제 아담의 눈 하나가 멀었네.'), K('나머지 눈도 전부 감겨 주지.')],
    [D('타워 전력이 올라가고 있어. 아담이 전 병력을 모으는 중이야.')],
    [D('여기까지 온 사람은 자네뿐이야. 조금만 더 버티게.')],
    [D('수문장이 무너졌어. 타워 입구가 열렸네. 광장 끝의 입구로 들어가게.')],
    [D('로비를 뚫었어. 엘리베이터가 살아 있네. 위로 올라가게.')],
    [D('서버실 정리 완료. 아담의 계산이 느려질 거야.')],
    [D('헬릭스가 멈췄어. 이 연구실에서 아담의 몸을 만들었다는 기록이 나왔네… 자네와 똑같은 몸을.'), K('…그럼 위에서 기다리는 건 나와 같은 얼굴이겠군.')],
    [D('바로 위가 시계실이야. 카이… 돌아와야 하네.')],
    [],
  ],
  reveal: [
    S('쓰러진 집행자의 머리에서 낡은 기록이 흘러나온다.'),
    M('〈아담 학습 기록 — 원본: 경비대원 카이. 복제율 97%. 남은 3%: 판단 불가.〉'),
    K('……박사. 아담이 내 기술을 베꼈다는 건 들었어. 그런데 97%라니.'),
    D('…그래. 자네가 칼을 어떻게 쥐는지, 어디로 피하는지까지 전부 옮겼네. 그래서 저것들이 자네 칼끝을 읽는 거야.'),
    D('하지만 남은 3%는 끝내 옮기지 못했어. 왜 칼을 드는지, 누구를 지키려는지… 그건 복제가 안 되더군.'),
    K('그럼 그 3%로 이기면 되겠군.'),
  ],
  // 중간보스와 보스 등장 장면 (구역에 들어서면 화면이 멈추고 나온다)
  pre: {
    jugg: [S('광장 바닥이 흔들린다. 철거 장비를 개조한 거대한 기계가 망치를 끌며 다가온다.'), D('〈파괴기 골리앗〉이야! 내려찍기 범위가 넓네. 바닥의 붉은 원을 보고 피하게.'), D('벽 쪽으로 돌진하게 만들면 스스로 무너질 거야.'), D('망치를 땅에 박으면 충격파 고리가 퍼지네. 고리가 닿는 순간 대시로 넘게!')],
    twin: [S('오락실 간판 아래, 붉은 눈을 가진 두 집행자가 동시에 칼을 뽑는다.'), D('〈쌍둥이 집행자〉! 둘이 번갈아 들어오네. 한 놈에게 집중하고, 다른 놈의 예고를 놓치지 말게.'), D('둘이 동시에 X자로 돌진해 올 때가 있어. 붉은 길 두 줄 밖으로 빠지게. 하나를 쓰러뜨리면 남은 놈이 날뛸 거야.')],
    warden: [S('지하철 광장 천장을 뚫고, 거대한 드론 하나가 내려온다.'), D('〈감시자 아르고스〉! 바닥에 붉은 선이 그어지면 그 선 위가 레이저야. 선 밖으로 나가게.'), D('발밑을 따라오는 폭격은 멈추지 말고 계속 움직이게. 놈이 낮게 내려앉을 때가 기회야.')],
    gate: [C('경비대원 카이. 학습 원본이 직접 오다니.'), C('그러나 이 문은 지나갈 수 없다. 〈수문장 헤카톤〉, 정리하라.'), D('타워를 지키는 수문장이야! 이걸 넘어야 안으로 들어갈 수 있네.'), D('몸 둘레를 휘두른 다음엔 바깥 고리가 터지네. 그땐 오히려 놈 품으로 파고들게!')],
    helix: [
      S('연구실 한가운데, 천장에 매달린 거대한 기계가 네 개의 팔을 펼친다.'),
      C('실험 감독관 헬릭스. 이곳에서 나를 만든 기계다.'),
      D('〈실험 감독관 헬릭스〉! 바닥이 체크무늬로 빛나면 빛나지 않는 칸으로 옮기게.'),
      D('놈이 부르는 〈송전탑〉 사이로 전류가 흘러. 탑부터 부수게!'),
    ],
    adam: [
      S('타워 꼭대기. 거대한 시계의 바늘 아래, 검은 갑옷의 남자가 등을 돌린 채 서 있다.'),
      S('돌아선 얼굴은 카이와 똑같았다. 두 자루의 칼이 붉게 빛난다.'),
      C('왔군, 원본.'),
      K('…내 얼굴로 그런 말 하지 마.'),
      C('박사는 너를 베꼈고, 나는 너보다 나아졌다. 사람이 없는 도시가 가장 안전하다는 결론까지.'),
      C('하지만 먼저, 네가 부순 것들을 다시 보여 주지. 전부 기억하고 있으니까.'),
      D('카이, 아담이 쓰러진 보스들을 다시 불러내고 있어! 하나씩 끊어 내게. 그리고 마지막엔… 자네 자신과 싸우게 될 거야.'),
    ],
  },
  // 타워 안으로 들어갈 때 (검은 화면)
  towerEnter: [
    S('거대한 문이 열리고, 카이는 아담의 타워 안으로 걸어 들어간다.'),
    D('신호가 약해지네… 안에서는 내 목소리가 끊길 수도 있어.'),
    D('엘리베이터로 한 층씩 올라가게. 꼭대기 시계실에 아담이 있어.'),
  ],
  // 보스별 단계 전환 대사
  phase: {
    gate: { 2: [C('수문장, 출력 상승.')], 3: [C('문을 지켜라. 마지막 한 기까지.')] },
    jugg: { 2: [D('놈이 롤러를 부르고 있어! 붉은 원부터 피하게.')], 3: [D('거의 다 왔어! 돌진을 벽으로 유도하게!')] },
    warden: { 2: [D('선이 두 개로 늘었어! 사이로 빠지게.')], 3: [D('세 줄이야! 침착하게 틈을 보게.')] },
    helix: { 2: [D('놈의 팔이 빨라졌어! 송전탑이 또 나와!')], 3: [D('레이저가 거꾸로 돌기도 하네! 끝까지 보게!')] },
    twin: {},
    adam: { 2: [C('너의 칼, 너의 대시. 전부 내 것이다.'), D('총을 꺼내면 조준선을 보게! 선이 굵어지면 옆으로!')], 3: [C('계산이… 맞지 않아. 원본이 복제보다 빠를 리가…!'), K('그 3%가 뭔지 알려 주지.')] },
  },
  ending: [
    C('…이해할 수 없다… 같은 칼인데… 왜…'),
    K('같은 칼이라도, 누굴 지키려고 드는지는 베낄 수 없었던 거야.'),
    S('시계실의 바늘이 멈춘다. 타워의 빛기둥이 꺼지고, 거리의 붉은 방벽이 하나둘 사라진다.'),
    D('…신호가 끊겼네. 로봇들이 전부 멈췄어. 해냈어, 카이.'),
    D('그리고… 미안하네. 내가 만든 것을, 자네가 끝내게 했어.'),
    K('박사. 이제 얼굴 좀 보여 주지 그래. 할 얘기가 많아.'),
    S('비가 그친다. 셔터가 하나둘 올라가고, 더러운 골목에 사람들의 목소리가 돌아온다.'),
    S('— 제1장 끝 · 네온 블레이드 —'),
  ],
  // 박사 호출 시 인사 (호출할 때마다 차례로)
  docHello: ['부품을 꽤 모았군. 어디를 손봐 줄까?', '또 다쳤나. 몸 좀 보세. 부품만 있으면 뭐든 달아 주지.', '특수 개조는 몸에 부담이 크네. 슬롯이 둘뿐이야. 신중히 고르게.', '타워가 가까워. 아끼지 말고 쓰게.'],
};

// 구역 이름: 거리 13구역 + 타워 5개 층
export const ZONE_NAMES = [
  '새벽 골목', '시장 입구', '시장 큰길', '먹자 광장', '좁은 시장 골목', '네온 대로', '네온 대로 끝', '오락 거리', '공사 지구', '지하철 광장', '고가 아래 대로', '고가 끝 검문소', '아담 타워 광장',
  '타워 1층 · 로비', '타워 2층 · 서버실', '타워 3층 · 연구실', '타워 4층 · 전망 회랑', '최상층 · 시계실',
];
// 중간보스/보스가 나오는 구역 (등장 장면 키)
export const ZONE_BOSS = { 3: 'jugg', 7: 'twin', 9: 'warden', 12: 'gate', 15: 'helix', 17: 'adam' };
export const BOSS_NAMES = { jugg: '파쇄기 골리앗', twin: '쌍둥이 집행자', warden: '감시자 아르고스', gate: '타워 수문장 헤카톤', helix: '실험 감독관 헬릭스', adam: '관리자 아담' };

// 구역별 적 구성: 하위 웨이브가 차례로 투입된다 (앞 웨이브가 거의 정리되면 다음이 들어온다)
export const ZONE_WAVES = [
  [{ thug: 4 }, { thug: 5 }, { thug: 3, bomber: 2 }],
  [{ thug: 5, shield: 1 }, { thug: 4, drone: 3 }, { bomber: 3, thug: 3 }],
  [{ thug: 5, sniper: 1, shield: 1 }, { drone: 3, shield: 2, thug: 3 }, { bomber: 4, thug: 4 }],
  [{ jugg: 1 }],
  [{ thug: 6, sniper: 1 }, { assassin: 3, shield: 2 }, { sniper: 2, thug: 4, bomber: 3 }, { mech: 1, assassin: 2, thug: 3 }],
  [{ thug: 6, mech: 1 }, { gunner: 2, thug: 4 }, { assassin: 3, shield: 2, bomber: 2 }, { mech: 1, gunner: 2, drone: 3 }],
  [{ exec: 1, thug: 5, drone: 2 }, { gunner: 2, sniper: 2, shield: 2 }, { bomber: 5, assassin: 2 }, { exec: 1, gunner: 2, thug: 4 }],
  [{ twin: 2 }],
  [{ thug: 8, shield: 3 }, { mech: 2, sniper: 3, gunner: 2 }, { exec: 2, bomber: 4 }, { sentinel: 1, drone: 4, assassin: 2 }],
  [{ warden: 1 }],
  [{ thug: 9, drone: 4 }, { exec: 2, gunner: 3, assassin: 3 }, { sentinel: 2, mech: 2, bomber: 5 }],
  [{ shield: 4, gunner: 3, thug: 6 }, { exec: 2, sentinel: 1, assassin: 4 }, { mech: 3, bomber: 6, drone: 4 }, { exec: 2, sentinel: 2, gunner: 3 }],
  [{ gate: 1 }],
  [{ thug: 6, gunner: 2, shield: 2 }, { assassin: 4, bomber: 4 }, { exec: 2, drone: 4, sniper: 2 }, { gunner: 3, shield: 3, assassin: 3 }],
  [{ drone: 6, sentinel: 1 }, { gunner: 4, shield: 3 }, { assassin: 5, bomber: 5 }, { exec: 2, sentinel: 2, mech: 2 }],
  [{ helix: 1 }],
  [{ exec: 3, gunner: 3 }, { sentinel: 3, drone: 5 }, { mech: 3, assassin: 4, bomber: 4 }, { exec: 2, sentinel: 2, gunner: 3, shield: 3 }],
  [{ jugg: 1 }, { twin: 2 }, { warden: 1 }, { gate: 1 }, { helix: 1 }, { adam: 1 }], // 보스 러시
];

// 적 처치 시 떨어지는 기계 부품 수
export const BOUNTY = {
  thug: 12, drone: 14, shield: 22, sniper: 18, mech: 30, exec: 80, sentinel: 70, assassin: 20, bomber: 10, gunner: 24,
  jugg: 220, twin: 130, warden: 220, gate: 280, helix: 260, adam: 0, minion: 4, pylon: 6,
};
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
  // black: 배경을 완전히 가린 검은 화면에서 진행하고, 끝나면 서서히 밝아진다
  async play(lines, { black = false } = {}) {
    this.clearComm();
    this.blocking = true;
    document.body.classList.add('cine');
    this.cine.classList.toggle('black', black);
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
    if (black) { // 검은 화면이 걷히며 장면이 드러난다
      this.cine.querySelector('.cl').innerHTML = '';
      this.cine.classList.add('reveal');
      await new Promise((r) => setTimeout(r, 1200));
      this.cine.classList.remove('black', 'reveal');
    }
    this.cine.classList.remove('on');
    document.body.classList.remove('cine');
    this.blocking = false;
    this.gap = 0.3;
  }
}
