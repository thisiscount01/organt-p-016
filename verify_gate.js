/**
 * Gate Condition 전수 검증 스크립트
 * 실행: node verify_gate.js
 */
'use strict';

const server = require('./server');

setTimeout(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];

  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));

  try {
    // ── 1. 홈 로드
    await page.goto('http://localhost:3001/', { waitUntil: 'networkidle', timeout: 15000 });
    const title = await page.title();
    console.log('[HOME] title:', title.slice(0, 50));

    // ── 2. 통계 박스
    const statTotal   = await page.$eval('#stat-total',   el => el.textContent).catch(() => '?');
    const statWinners = await page.$eval('#stat-winners', el => el.textContent).catch(() => '?');
    console.log('[HOME] stat-total:', statTotal, '| stat-winners:', statWinners);

    // ── 3. 인사이트 배너
    const insightTitle = await page.$eval('#insight-title', el => el.textContent).catch(() => '?');
    console.log('[HOME] insight-title:', insightTitle);

    // ── 4. 후보자 탭
    await page.click('[data-page="candidates"]');
    await page.waitForTimeout(1000);
    const candCards = await page.$$('.card');
    console.log('[CANDS] card count:', candCards.length);

    // ── 5. AI 탭 + 질문
    await page.click('[data-page="ai"]');
    await page.waitForTimeout(500);
    await page.fill('#chat-input', '서울 당선자는 누구인가요?');
    await page.click('#chat-send');
    await page.waitForTimeout(2500);

    const allMsgs = await page.$$('.msg');
    console.log('[AI] total messages:', allMsgs.length);
    const lastBotText = await page.$$eval('.msg.bot', els => {
      const last = els[els.length - 1];
      return last ? last.textContent.replace(/\s+/g, ' ').slice(0, 100) : '';
    }).catch(() => '');
    console.log('[AI] last bot msg:', lastBotText);

    // ── 6. 출처 표시 확인
    const sourceBadge = await page.$('.source-badge, .answer-sources, [class*="source"]');
    console.log('[AI] source badge exists:', !!sourceBadge);

    // ── 7. 비교 탭
    await page.click('[data-page="compare"]');
    await page.waitForTimeout(500);
    const compareRegionEl = await page.$('#compare-region');
    console.log('[COMPARE] region-select exists:', !!compareRegionEl);

    // ── 8. 안내 탭
    await page.click('[data-page="guide"]');
    await page.waitForTimeout(800);
    const schedCount   = await page.$eval('#schedule-list', el => el.children.length).catch(() => 0);
    const linksCount   = await page.$eval('#official-links', el => el.children.length).catch(() => 0);
    console.log('[GUIDE] schedule items:', schedCount, '| official links:', linksCount);

    // ── 9. 스크린샷 (홈)
    await page.click('[data-page="home"]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'verify_gate_v2.png', fullPage: false });
    console.log('[SCREENSHOT] verify_gate_v2.png');

    // ── 10. AI 탭 스크린샷
    await page.click('[data-page="ai"]');
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'verify_gate_ai.png', fullPage: false });
    console.log('[SCREENSHOT] verify_gate_ai.png');

    // ── 결과 요약
    console.log('\n=== GATE SUMMARY ===');
    console.log('콘솔 에러:', errors.length === 0 ? 'NONE (PASS)' : errors.slice(0, 3).join(' | '));
    console.log('홈 로드:', title.includes('지방선거') ? 'PASS' : 'FAIL');
    console.log('통계 박스:', statTotal !== '-' ? 'PASS' : 'FAIL (not loaded)');
    console.log('AI 응답:', allMsgs.length >= 2 ? 'PASS' : 'FAIL (no response)');
    console.log('투표 안내 일정:', schedCount > 0 ? 'PASS' : 'FAIL');
    console.log('투표 안내 링크:', linksCount > 0 ? 'PASS' : 'FAIL');

  } catch (e) {
    console.error('[ERROR]', e.message);
  }

  await browser.close();
  process.exit(0);
}, 1500);
