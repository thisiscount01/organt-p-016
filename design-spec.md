# NOVA BREAK — 비주얼 디자인 스펙 v1.0

> 게임 비주얼 디자이너 확정 | 2026-06-15  
> VFX · UI · 사운드 · 모션 팀 공통 기준. 이 문서가 유일한 색·연출 출처입니다.

---

## 1. 아트 방향: SPACE (우주)

**선택 근거**
1. "NOVA" = 항성 폭발 — 테마가 타이틀에서 즉시 읽힌다.
2. 불릿헬 핵심 조건: 어두운 배경 → 투사체·이펙트 최대 대비 확보.
3. 성운(보라) · 플라즈마(청록) · 항성폭발(금-주황) 색 언어 → 이벤트마다 고유 식별색 자연 배분.
4. 동시 다발 이펙트에서도 계층 가독성 유지 (배경 ≪ 픽업 ≪ 플레이어 ≪ NOVA).
5. 장르 레퍼런스(Ikaruga, R-Type, Galaga)에서 검증된 어두운-배경 가독성 구조.

**시각 키워드**: Deep Space · Plasma Burst · Neon Nebula · Cold Star · UV Shockwave

---

## 2. 색 팔레트 — 단일 출처 토큰

> **규칙**: CSS 변수(`style.css :root`)와 JS 상수(`public/tokens.js`)가 동일값의 유일한 출처.  
> hover/active 변형은 `color-mix(in srgb, <token> 80%, #000 20%)` — 추가 하드코딩 금지.

### 이벤트·요소별 Hex 확정표

| 요소 | 역할 | Hex | 비고 |
|------|------|-----|------|
| **배경 베이스** | 최하단 캔버스 배경 | `#080C1E` | 딥 스페이스 블랙 |
| **배경 성운 미드** | 패럴랙스 2레이어 | `#0F1535` | 성운 미드톤 |
| **배경 원거리** | 패럴랙스 3레이어 | `#1B2254` | 원거리 성운 힌트 |
| **플레이어 바디** | 기본 선체 색 | `#4DBBF7` | 셀레스트 블루 (주인공 식별) |
| **플레이어 하이라이트** | 엣지·조명 | `#A8E6FF` | 하이라이트 |
| **플레이어 쉴드** | 오라·쉴드 링 | `#2196F3` | 쉴드 이펙트 |
| **피격 플래시** | 임팩트 0–100ms | `#FFFFFF` | 화이트 아웃 |
| **피격 레드** | 피격 100–400ms | `#FF3D3D` | 데미지 레드 |
| **에너지 오브 코어** | 픽업 중심 | `#00FFC8` | 민트시안 (수집 유도색) |
| **에너지 오브 글로우** | 픽업 글로우링 | `#80FFE5` | 소프트 민트 |
| **에너지 오브 링** | 궤도 링 | `#00E5A0` | 오비트 링 |
| **보스 경고 레드** | 맥동 경고 | `#FF0033` | 강렬한 알람 레드 |
| **보스 경고 앰버** | 에코 링 | `#FF6600` | 앰버 에코 |
| **보스 비네팅** | 화면 오버레이 | `#1A0000` | 어두운 레드 (알파 조합) |
| **NOVA 코어** | 폭발 핵심 | `#FFFDE7` | 화이트-골드 |
| **NOVA 에너지링** | 1차 확산링 | `#FFD600` | 황금 에너지 |
| **NOVA 플레임** | 외곽 화염 | `#FF6D00` | 딥 오렌지 |
| **NOVA 충격파** | 트레일·충격파 | `#E040FB` | UV 자외선 에너지 |

---

## 3. CSS 변수 (`public/style.css :root` 전체 교체)

```css
:root {
  /* ── 하위호환 기존 변수 ── */
  --clr-bg:      #080C1E;
  --clr-primary: #4DBBF7;
  --clr-accent:  #FF3D3D;
  --clr-warn:    #FF0033;
  --clr-hp:      #FF3D3D;
  --clr-gold:    #FFD600;
  --clr-text:    #E0F0FF;
  --clr-dim:     rgba(77,187,247,0.10);
  --font:        'Segoe UI', 'Noto Sans KR', sans-serif;

  /* ── NOVA BREAK 이벤트 토큰 ── */
  --bg-base:     #080C1E;
  --bg-nebula:   #0F1535;
  --bg-distant:  #1B2254;

  --player-body:      #4DBBF7;
  --player-highlight: #A8E6FF;
  --player-shield:    #2196F3;
  --player-hit-flash: #FFFFFF;
  --player-hit-red:   #FF3D3D;

  --orb-core: #00FFC8;
  --orb-glow: #80FFE5;
  --orb-ring: #00E5A0;

  --boss-warn-red:   #FF0033;
  --boss-warn-amber: #FF6600;
  --boss-vignette:   #1A0000;

  --nova-core:      #FFFDE7;
  --nova-ring1:     #FFD600;
  --nova-flame:     #FF6D00;
  --nova-shockwave: #E040FB;
}
```

## 4. JS 상수 (`public/tokens.js` 신규 생성)

```js
// NOVA BREAK Design Tokens — single source of truth
export const COLOR = {
  BG_BASE:    '#080C1E', BG_NEBULA: '#0F1535', BG_DISTANT: '#1B2254',
  PLAYER_BODY: '#4DBBF7', PLAYER_HIGHLIGHT: '#A8E6FF', PLAYER_SHIELD: '#2196F3',
  PLAYER_HIT_FLASH: '#FFFFFF', PLAYER_HIT_RED: '#FF3D3D',
  ORB_CORE: '#00FFC8', ORB_GLOW: '#80FFE5', ORB_RING: '#00E5A0',
  BOSS_WARN_RED: '#FF0033', BOSS_WARN_AMBER: '#FF6600', BOSS_VIGNETTE: '#1A0000',
  NOVA_CORE: '#FFFDE7', NOVA_RING1: '#FFD600', NOVA_FLAME: '#FF6D00', NOVA_SHOCKWAVE: '#E040FB',
};

export const SFX_EVENT = {
  NOVA_EXPLODE: 'nova_explode', BOSS_WARN: 'boss_warn',
  ORB_PICKUP: 'orb_pickup',    PLAYER_HIT: 'player_hit',
  PLAYER_SHOOT: 'player_shoot', ENEMY_DIE: 'enemy_die',
};

export const TIMING = {
  PLAYER_HIT_FLASH_MS: 100,  // 화이트 플래시
  PLAYER_HIT_RED_MS:   300,  // 레드 피격 (100~400ms)
  ORB_PULSE_MS:        1200, // 오브 맥동 주기
  BOSS_WARN_PULSES:    3,    // 경고 맥동 횟수
  NOVA_EXPAND_MS:      600,  // 폭발 확산
  NOVA_FADE_MS:        400,  // 폭발 페이드아웃
};
```

---

## 5. z-order (렌더 레이어)

```
Layer 0: 배경 (bg-base/nebula/distant + 별 파티클)
Layer 1: 픽업 오브
Layer 2: 적 유닛
Layer 3: 플레이어
Layer 4: 투사체
Layer 5: VFX (NOVA 폭발·피격·파티클)  ← VFX 팀 전담
Layer 6: 보스 경고 오버레이           ← VFX 팀 전담
Layer 7: UI / HUD
```

---

## 6. 팀별 계약

| 팀 | 참조 | 규칙 |
|----|------|------|
| VFX | `COLOR.*` (tokens.js) | Layer 5–6 전담, COLOR 상수만 |
| UI | `--` CSS 변수 | color-mix 계산, 하드코딩 금지 |
| 사운드 | `SFX_EVENT.*` | VFX 이벤트와 동기 트리거 |
| 모션 | `TIMING.*` | 애니메이션 커브 기준값 |
| 프론트엔드 | tokens.js 전체 | Canvas에서 COLOR 상수 직접 사용 |

---

*v1.0 확정 — 게임 비주얼 디자이너 | 2026-06-15*
