"""
Playwright 검증: 오버레이 해제 타이밍 + 후보자 카드 수
"""
import time
from playwright.sync_api import sync_playwright

def verify():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # 오버레이 초기 상태 감지 (domcontentloaded 직후 가능한 빨리)
        page.goto('http://localhost:3001', wait_until='domcontentloaded')

        # 1) 오버레이 초기 class 확인 ('hidden' 없으면 정상 노출 중)
        overlay_class = page.locator('#page-loading').get_attribute('class') or ''
        overlay_init_shown = 'hidden' not in overlay_class
        print(f'[1] 오버레이 초기 class: "{overlay_class}" → 초기 노출 중: {overlay_init_shown}')

        # 2) fetch 완료 후 오버레이 숨김 대기
        #    .hidden 클래스가 붙으면 display:none(=DOM 상 hidden) → state='attached' 로 기다림
        try:
            page.wait_for_selector('#page-loading.hidden', state='attached', timeout=45000)
            overlay_hidden = True
        except Exception as e:
            overlay_hidden = False
            print(f'    오버레이 숨김 실패: {e}')
        # 최종 class 재확인
        final_class = page.locator('#page-loading').get_attribute('class') or ''
        print(f'[2] fetch 완료 후 오버레이 class: "{final_class}" → 숨김 확인: {overlay_hidden}')

        # 3) 후보자 탭 이동 후 #page-candidates 내 카드 수
        page.click('[data-page="candidates"]')
        time.sleep(1)
        try:
            page.wait_for_selector('#page-candidates .cand-card', timeout=5000)
        except Exception:
            pass
        cand_page_cards = page.locator('#page-candidates .cand-card').count()
        print(f'[3] 후보자 탭 (#page-candidates) 카드 수: {cand_page_cards}')

        # 스크린샷
        page.screenshot(path='/tmp/verify_result.png')
        print('[4] 스크린샷 저장: /tmp/verify_result.png')

        browser.close()

        # 합격 판정
        ok = True
        if not overlay_hidden:
            print('FAIL: 오버레이 fetch 후 미숨김'); ok = False
        if cand_page_cards < 16:
            print(f'FAIL: 카드 {cand_page_cards}개 (≥16 기대)'); ok = False

        if ok:
            print(f'\n✅ 모든 검증 통과 — 오버레이 fetch 완료 후 정상 해제, 후보자 카드 {cand_page_cards}개')
        else:
            raise SystemExit(1)

verify()
