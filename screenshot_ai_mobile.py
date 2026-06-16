from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--no-sandbox'])
    ctx = browser.new_context(
        viewport={'width': 375, 'height': 812},
        user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 16) AppleWebKit/605.1.15 Mobile/15E148',
        ignore_https_errors=True
    )
    page = ctx.new_page()
    page.goto('http://localhost:3001', timeout=30000, wait_until='domcontentloaded')
    time.sleep(4)
    # Navigate to AI page via mobile nav (bottom nav)
    page.locator('#mobile-nav a[data-page="ai"]').click()
    time.sleep(1)
    page.screenshot(path='public/ss_mobile_ai.png')
    print("Mobile AI screenshot saved")

    # Guide page
    page.locator('#mobile-nav a[data-page="guide"]').click()
    time.sleep(1)
    page.screenshot(path='public/ss_mobile_guide.png')
    print("Mobile Guide screenshot saved")

    # Compare page
    page.locator('#mobile-nav a[data-page="compare"]').click()
    time.sleep(1)
    page.screenshot(path='public/ss_mobile_compare.png')
    print("Mobile Compare screenshot saved")

    ctx.close()
    browser.close()
print("Done")
