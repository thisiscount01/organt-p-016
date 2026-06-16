from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--no-sandbox'])

    # Desktop 1280
    ctx = browser.new_context(viewport={'width': 1280, 'height': 800}, ignore_https_errors=True)
    page = ctx.new_page()
    console_msgs = []
    page.on('console', lambda msg: console_msgs.append(f"[{msg.type}] {msg.text}"))

    try:
        print("Loading desktop...")
        resp = page.goto('http://localhost:3001', timeout=90000, wait_until='domcontentloaded')
        print(f"HTTP status: {resp.status if resp else 'N/A'}")
        time.sleep(6)
        page.screenshot(path='public/ss_desktop_initial.png')
        print("initial screenshot saved")

        # wait for stats
        try:
            page.wait_for_selector('.stat-num', timeout=20000)
            time.sleep(2)
        except:
            pass
        page.screenshot(path='public/ss_desktop_loaded.png')
        print("loaded screenshot saved")
        page.screenshot(path='public/ss_desktop_full.png', full_page=True)
        print("full page saved")
    except Exception as e:
        print(f"Desktop error: {e}")
        try:
            page.screenshot(path='public/ss_desktop_err.png')
        except:
            pass

    print("Console:", console_msgs[:10])
    ctx.close()

    # Navigate to AI page
    ctx3 = browser.new_context(viewport={'width': 1280, 'height': 800}, ignore_https_errors=True)
    page3 = ctx3.new_page()
    try:
        page3.goto('http://localhost:3001', timeout=90000, wait_until='domcontentloaded')
        time.sleep(6)
        # click AI nav
        page3.click('[data-page="ai"]')
        time.sleep(1)
        page3.screenshot(path='public/ss_desktop_ai.png')
        print("AI page screenshot saved")
        # candidates
        page3.click('[data-page="candidates"]')
        time.sleep(1)
        page3.screenshot(path='public/ss_desktop_candidates.png')
        print("Candidates page screenshot saved")
    except Exception as e:
        print(f"Nav error: {e}")
    ctx3.close()

    # Mobile 375
    ctx2 = browser.new_context(
        viewport={'width': 375, 'height': 812},
        user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 16 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
        ignore_https_errors=True
    )
    page2 = ctx2.new_page()
    try:
        print("Loading mobile...")
        page2.goto('http://localhost:3001', timeout=90000, wait_until='domcontentloaded')
        time.sleep(6)
        page2.screenshot(path='public/ss_mobile_home.png')
        print("mobile screenshot saved")
        page2.screenshot(path='public/ss_mobile_full.png', full_page=True)
        print("mobile full saved")
    except Exception as e:
        print(f"Mobile error: {e}")
    ctx2.close()

    browser.close()
    print("All done.")
