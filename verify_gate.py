"""
Gate Condition 전수 검증 — Playwright Python
"""
import subprocess, time, sys

srv = subprocess.Popen(['node', 'server.js'],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(3)

from playwright.sync_api import sync_playwright

results = {}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    console_errors = []
    page.on('console', lambda m: console_errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: console_errors.append(str(e)))

    # ── 홈 로드
    page.goto('http://localhost:3001/', wait_until='networkidle', timeout=20000)
    title = page.title()
    results['title_ok'] = '지방선거' in title

    # loading overlay 숨김 대기 (최대 8초)
    try:
        page.locator('#page-loading.hidden').wait_for(timeout=8000)
        results['loading_hidden'] = True
    except:
        # display:none 으로도 처리될 수 있음
        style = page.evaluate("() => document.getElementById('page-loading')?.className || ''")
        results['loading_hidden'] = 'hidden' in str(style)

    # 통계 박스 (데이터 도착 후 갱신)
    time.sleep(1)
    stat_total = page.locator('#stat-total').inner_text()
    results['stats_loaded'] = stat_total not in ['-', '']
    results['stat_total'] = stat_total

    # 당선자 그리드 — .cand-card 로 대기
    try:
        page.locator('#winners-grid .cand-card').first.wait_for(timeout=6000)
        winner_cards = page.locator('#winners-grid .cand-card').count()
        results['winner_cards'] = winner_cards
        results['winners_loaded'] = winner_cards > 0
    except:
        results['winner_cards'] = 0
        results['winners_loaded'] = False

    # 지역 인사이트 배너
    insight_title = page.locator('#insight-title').inner_text()
    results['insight_shows_region'] = '서울' in insight_title or '지역' not in insight_title

    # 후보자 탭
    page.click('[data-page="candidates"]')
    time.sleep(1)
    cand_cards = page.locator('.cand-card').count()
    results['cand_cards'] = cand_cards
    results['cands_loaded'] = cand_cards > 0

    # 검색 필터 동작
    page.select_option('#filter-party', '더불어민주당')
    time.sleep(0.4)
    filtered = page.locator('.cand-card').count()
    results['party_filter_works'] = filtered > 0 and filtered < cand_cards

    # AI 탭
    page.click('[data-page="ai"]')
    time.sleep(0.5)

    # 추천 질문 클릭
    page.locator('.sq-btn').first.click()
    time.sleep(2.5)
    msgs_count = page.locator('.msg').count()
    results['sq_btn_fires'] = msgs_count >= 2

    # 직접 입력 + 응답
    page.fill('#chat-input', '경기도 당선자는 누구인가요?')
    page.click('#chat-send')
    time.sleep(2.5)
    all_msgs = page.locator('.msg').count()
    results['ai_responds'] = all_msgs >= 3

    # 출처 태그 표시
    source_tags = page.locator('.source-tag').count()
    results['source_tags_shown'] = source_tags > 0

    # disclaimer 표시
    disclaimer_els = page.locator('.disclaimer-text').count()
    results['disclaimer_shown'] = disclaimer_els > 0

    # confidence bar
    conf_bars = page.locator('.confidence-bar').count()
    results['confidence_bar_shown'] = conf_bars > 0

    page.screenshot(path='verify_gate_ai.png')

    # 비교 탭
    page.click('[data-page="compare"]')
    time.sleep(0.5)
    compare_select = page.locator('#compare-region').count()
    results['compare_select_exists'] = compare_select > 0

    # 지역 선택 (서울이 이미 기본 선택돼 있어야 함)
    left_content = page.locator('#compare-left').inner_text()
    results['compare_preloaded'] = len(left_content.strip()) > 20

    # vote-bar
    vote_bars = page.locator('.vote-bar').count()
    results['vote_bar_shown'] = vote_bars > 0

    # 안내 탭
    page.click('[data-page="guide"]')
    time.sleep(1)
    sched_items = page.locator('#schedule-list li').count()
    link_items  = page.locator('#official-links a').count()
    results['schedule_items'] = sched_items
    results['official_links'] = link_items
    results['guide_schedule_ok'] = sched_items >= 4
    results['guide_links_ok']    = link_items >= 3

    # 홈 스크린샷
    page.click('[data-page="home"]')
    time.sleep(0.5)
    page.screenshot(path='verify_gate_home.png', full_page=False)

    results['console_errors'] = len(console_errors) == 0
    if console_errors:
        print('  ⚠ console errors:', console_errors[:3])

    browser.close()

srv.terminate()

print('\n=== GATE VERIFICATION RESULTS ===')
for k, v in results.items():
    if isinstance(v, bool):
        print(f"  {'✅' if v else '❌'} {k}: {v}")
    else:
        print(f"  ℹ  {k}: {v}")

fails = [k for k, v in results.items() if isinstance(v, bool) and not v]
print(f'\n총 FAIL: {len(fails)}')
if fails:
    print('FAIL 항목:', fails)
    sys.exit(1)
else:
    print('→ 전부 PASS')
    sys.exit(0)
