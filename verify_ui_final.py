"""Playwright 브라우저 E2E — 홈·AI Q&A·후보 비교 시나리오"""
import subprocess, time
subprocess.Popen(["node", "server.js"])
time.sleep(2)

from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 800})

    # 홈 페이지
    page.goto("http://localhost:3001/")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.screenshot(path="final_home.png")
    print(f"[홈] title: {page.title()}")

    # AI Q&A 탭으로 이동 (data-page="ai" 링크 클릭)
    page.click('[data-page="ai"]')
    page.wait_for_selector('#chat-input', state='visible', timeout=5000)
    time.sleep(0.3)

    # AI 채팅 입력창
    page.fill('#chat-input', '서울시장 후보는 누구인가요?')
    page.click('#chat-send')
    time.sleep(2)
    page.screenshot(path="final_ai.png")
    print("[AI Q&A] 스크린샷 저장")

    # 후보자 탭
    page.click('[data-page="candidates"]')
    time.sleep(0.5)
    page.screenshot(path="final_candidates.png")
    print("[후보자] 스크린샷 저장")

    browser.close()

print("✅ 브라우저 E2E 검증 완료")
