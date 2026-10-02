# 네온 블레이드

비 오는 네온 도시를 검 한 자루로 뚫고 나가는 3인칭 3D 사이버펑크 액션 게임입니다. (Vite + three.js)

로봇들이 반란을 일으킨 도시에서 기억을 잃고 깨어난 주인공 카이가, 무전으로 들려오는 박사의 도움을 받아 10개 구역을 돌파하고 도시 AI 크로노스를 쓰러뜨립니다.

## 조작
| | PC | 모바일 |
|---|---|---|
| 이동 | WASD | 왼쪽 화면 터치 |
| 시점 | 마우스 | 오른쪽 화면 드래그 |
| 공격 | 좌클릭 / J (꾹 누르면 차지) | 공격 버튼 |
| 대시 | Space | 대시 버튼 |
| 박사 호출(전투 후) | C | 오른쪽 버튼 |
| 수리 키트 | Q | - |
| 배낭 / 설정 | Tab 또는 오른쪽 위 배낭 버튼 | 배낭 버튼 |

## 실행
```
npm install
npm run dev      # 개발 서버
npm run build    # dist/ 로 빌드
```

`main` 브랜치에 올리면 GitHub Pages로 자동 배포됩니다. (`.github/workflows/deploy.yml`)

## 출처
- 캐릭터 모델 **Vanguard** (`public/models/Soldier.glb`): [Mixamo](https://www.mixamo.com/) (Adobe). three.js 예제에 포함된 파일을 색과 장식만 바꿔 사용했습니다. 이 모델의 권리는 Adobe에 있으며, 이 저장소는 비영리 학교 전시용입니다.
- 3D 엔진: [three.js](https://threejs.org/) (MIT License)
- 효과음과 배경음은 코드로 합성했고, 도시와 나머지 캐릭터는 직접 만들었습니다.
