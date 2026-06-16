/**
 * 2026 지방선거 AI 정보 서비스 — HTTP 서버
 *
 * API Routes:
 *   GET  /api/health           서버 상태
 *   GET  /api/stats            전체 통계
 *   GET  /api/regions          시도 목록
 *   GET  /api/candidates       후보자 목록 (query: region_code, party, q)
 *   GET  /api/candidates/:id   단일 후보자
 *   POST /api/query            AI Q&A (RAG)
 *   POST /api/predict          지역별 예측 분석
 *   GET  /api/insight/:code    지역 개인화 인사이트
 *   GET  /api/schedule         선거 일정
 *   POST /api/events           이벤트 수집 (프론트→서버)
 *   GET  /api/metrics          이벤트 집계 (Admin)
 *   GET  /api/geo              IP 기반 지역 감지
 */

'use strict';
const http   = require('http');
const https  = require('https');
const net    = require('net');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const url    = require('url');

const PORT   = process.env.PORT || 3001;
const PUBLIC = path.join(__dirname, 'public');

// ── MIME 타입 ─────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.woff2':'font/woff2',
};

// ── 데이터 로드 ───────────────────────────────────────────────────────────
let candidatesCache = null;
let regionsCache    = null;

function getCandidates() {
  if (!candidatesCache) {
    candidatesCache = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'candidates.json'), 'utf8'));
  }
  return candidatesCache;
}

function getRegions() {
  if (!regionsCache) {
    regionsCache = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'regions.json'), 'utf8'));
  }
  return regionsCache;
}

// ── 이벤트 스토어 (메모리, Gate Condition: 이벤트 수집 완전성) ───────────
const eventStore = [];
const MAX_EVENTS = 50000;
const eventMetrics = {
  predict_submit:    0,
  session_start:     0,
  ai_query:          0,
  insight_render:    0,
  candidate_compare: 0,
  page_view:         0,
};

function recordEvent(event) {
  // dedup 키: session + event_name + minute + 속성 해시
  // ai_query처럼 같은 분에 여러 번 발화될 수 있는 이벤트는 properties를 포함해 구분
  const minuteKey = Math.floor(Date.now() / 60000);
  const propHash  = crypto.createHash('sha1')
    .update(JSON.stringify(event.properties || {}).slice(0, 200))
    .digest('hex').slice(0, 8);
  const dedupKey  = crypto.createHash('sha1')
    .update(`${event.event_name}:${event.session_id}:${minuteKey}:${propHash}`)
    .digest('hex').slice(0, 12);

  // 중복 체크 (최근 100개만)
  const recent = eventStore.slice(-100);
  if (recent.some(e => e.dedup_key === dedupKey)) return null;

  const stored = { ...event, dedup_key: dedupKey, server_ts: new Date().toISOString() };
  if (eventStore.length >= MAX_EVENTS) eventStore.shift();
  eventStore.push(stored);

  // 집계 카운터
  if (eventMetrics[event.event_name] !== undefined) eventMetrics[event.event_name]++;
  return stored;
}

// ── 스키마 검증 (Gate Condition: 필수 필드 누락률 0%) ────────────────────
const REQUIRED_CANDIDATE_FIELDS = ['id', 'name', 'district', 'region', 'region_code', 'party'];

function validateCandidateSchema(candidates) {
  const errors = [];
  candidates.forEach((c, i) => {
    REQUIRED_CANDIDATE_FIELDS.forEach(f => {
      if (!c[f]) errors.push(`[${i}] ${c.name || '?'}: ${f} 누락`);
    });
    if (!Array.isArray(c.policies)) errors.push(`[${i}] ${c.name}: policies 형식 오류`);
  });
  return errors;
}

// ── 레이턴시 측정 ─────────────────────────────────────────────────────────
const latencyBuckets = {
  '/api/query':      [],
  '/api/predict':    [],
  '/api/candidates': [],
};
const MAX_LATENCY_SAMPLES = 1000;

function recordLatency(route, ms) {
  if (!latencyBuckets[route]) return;
  const bucket = latencyBuckets[route];
  if (bucket.length >= MAX_LATENCY_SAMPLES) bucket.shift();
  bucket.push(ms);
}

function computePercentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil(p / 100 * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ── 응답 헬퍼 ─────────────────────────────────────────────────────────────
function json(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-cache',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e5) reject(new Error('Too Large')); });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

// ── IP 기반 지역 감지 ────────────────────────────────────────────────────
function detectRegionByIP(ip) {
  // 개발 환경에서는 서울 기본값
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
    return { code: '11', name: '서울특별시', short: '서울', detected_by: 'default' };
  }
  // 프로덕션에서는 외부 GeoIP 서비스 연동 가능
  return { code: '11', name: '서울특별시', short: '서울', detected_by: 'default' };
}

// ── AI 파이프라인 (지연 로드) ─────────────────────────────────────────────
let pipeline = null;
function getPipeline() {
  if (!pipeline) pipeline = require('./ai/pipeline');
  return pipeline;
}

// ── 가치관 매칭 상수 (POST /api/match) ───────────────────────────────────
const MATCH_KEYWORDS = {
  edu: {
    A: ['공교육','공립학교','교육재정','무상교육','국공립','교육예산','교육비무상'],
    B: ['사교육규제','사교육','학원비','과외금지','선행학습','사교육비'],
    C: ['직업교육','직업훈련','기술교육','진로교육','마이스터','취업','기능교육'],
  },
  eco: {
    A: ['복지확대','사회안전망','무상','복지','기초생활','보육','사회복지'],
    B: ['기업지원','감세','규제완화','투자유치','경제성장','친기업','세금감면'],
    C: ['균형발전','지역균형','분산','지방균형','지역개발','지역경제'],
  },
  env: {
    A: ['재생에너지','탄소중립','친환경','녹색','태양광','풍력','기후','탈탄소'],
    B: ['원전','원자력','핵에너지','에너지안보','핵발전'],
    C: ['개발성장','경제개발','건설','도시개발','산업단지','개발촉진'],
  },
  housing: {
    A: ['공공임대','임대주택','공공주택','임대','공공개발','저렴주거'],
    B: ['민간분양','분양','시장','민간주택','부동산시장','공급확대'],
    C: ['재개발','재건축','규제완화','정비사업','재정비','주거정비'],
  },
  welfare: {
    A: ['보편복지','전국민','기본소득','보편','전국민복지','보편적복지'],
    B: ['선별복지','취약계층','저소득','선별','집중지원','맞춤형복지'],
    C: ['민간복지','민간','바우처','민간위탁','민간참여','민간서비스'],
  },
};

const ANSWER_LABELS = {
  edu:     { A: '공교육 강화', B: '사교육 규제', C: '직업교육' },
  eco:     { A: '복지 확대', B: '기업지원·감세', C: '균형 발전' },
  env:     { A: '재생에너지·탄소중립', B: '원전유지·실용', C: '개발성장' },
  housing: { A: '공공임대 확대', B: '민간분양·시장', C: '재개발·규제완화' },
  welfare: { A: '보편복지', B: '선별복지', C: '민간복지' },
};

const FIELD_LABELS = {
  edu: '교육', eco: '경제', env: '환경', housing: '주거', welfare: '복지',
};

// ── 라우터 ────────────────────────────────────────────────────────────────
async function handleAPI(req, res) {
  const parsed  = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const qs      = parsed.query;
  const t0      = Date.now();

  // CORS preflight
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }); res.end(); return; }

  try {
    // ─── GET /api/health ──────────────────────────────────────────────────
    if (pathname === '/api/health' && req.method === 'GET') {
      const pipe = getPipeline();
      const s = await pipe.stats();
      return json(res, {
        status: 'ok',
        service: '2026 지방선거 AI 서비스',
        indexed_docs: s.index_docs,
        indexed_at:   s.indexed_at,
        uptime_s:     Math.floor(process.uptime()),
        ts:           new Date().toISOString(),
      });
    }

    // ─── GET /api/stats ───────────────────────────────────────────────────
    if (pathname === '/api/stats' && req.method === 'GET') {
      const s = await getPipeline().stats();
      const errors = validateCandidateSchema(getCandidates());
      const p95 = {};
      for (const [route, arr] of Object.entries(latencyBuckets)) {
        p95[route] = { p95: computePercentile(arr, 95), p99: computePercentile(arr, 99), samples: arr.length };
      }
      return json(res, {
        ...s,
        schema_errors: errors.length,
        schema_valid:  errors.length === 0,
        latency:       p95,
        events:        { total: eventStore.length, metrics: eventMetrics },
        gate_conditions: {
          field_missing_rate_0pct: errors.length === 0,
          api_latency_p95_le300ms: (p95['/api/query']?.p95 || 0) <= 300,
        },
      });
    }

    // ─── GET /api/regions ─────────────────────────────────────────────────
    if (pathname === '/api/regions' && req.method === 'GET') {
      return json(res, { data: getRegions(), source: '중앙선거관리위원회', source_url: 'https://www.nec.go.kr' });
    }

    // ─── GET /api/candidates ─────────────────────────────────────────────
    if (pathname === '/api/candidates' && req.method === 'GET') {
      let list = getCandidates();
      if (qs.region_code) list = list.filter(c => c.region_code === qs.region_code);
      if (qs.region)      list = list.filter(c => c.region.includes(qs.region) || c.region_code === qs.region);
      if (qs.party)       list = list.filter(c => c.party === qs.party || c.party_code === qs.party);
      if (qs.q)           list = list.filter(c =>
        c.name.includes(qs.q) || c.region.includes(qs.q) || c.party.includes(qs.q) ||
        c.district.includes(qs.q) || (c.tags || []).some(t => t.includes(qs.q))
      );
      const page  = parseInt(qs.page  || '1', 10);
      const limit = parseInt(qs.limit || '20', 10);
      const start = (page - 1) * limit;
      const paginated = list.slice(start, start + limit);
      recordLatency('/api/candidates', Date.now() - t0);
      return json(res, {
        data:  paginated,
        total: list.length,
        page,  limit,
        source: '중앙선거관리위원회',
        source_url: 'https://www.nec.go.kr',
        data_as_of: new Date().toISOString().split('T')[0],
      });
    }

    // ─── GET /api/candidates/compare ─────────────────────────────────────
    if (pathname === '/api/candidates/compare' && req.method === 'GET') {
      const ids = (qs.ids || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!ids.length) return json(res, { error: 'ids 파라미터가 필요합니다.' }, 400);
      const found = ids.map(id => getCandidates().find(c => c.id === id)).filter(Boolean);
      return json(res, { data: found, source: '중앙선거관리위원회' });
    }

    // ─── GET /api/candidates/:id ──────────────────────────────────────────
    const candMatch = pathname.match(/^\/api\/candidates\/(.+)$/);
    if (candMatch && req.method === 'GET') {
      const candidate = getCandidates().find(c => c.id === candMatch[1]);
      if (!candidate) return json(res, { error: '후보자를 찾을 수 없습니다.' }, 404);
      return json(res, { data: candidate, source: candidate.source, source_url: candidate.source_url });
    }

    // ─── POST /api/chat (alias → /api/query RAG) ─────────────────────────
    if (pathname === '/api/chat' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.question || !String(body.question).trim()) {
        return json(res, { error: 'query is required', code: 422 }, 422);
      }
      if (String(body.question).length > 500) {
        return json(res, { error: 'query too long', code: 400 }, 400);
      }
      const result = await getPipeline().query(String(body.question).trim(), {
        region_code: body.region_code,
        party:       body.party,
        top_k:       body.top_k,
      });
      recordLatency('/api/chat', Date.now() - t0);
      return json(res, result);
    }

    // ─── POST /api/query (RAG AI Q&A) ────────────────────────────────────
    if (pathname === '/api/query' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.question || !String(body.question).trim()) {
        return json(res, { error: 'query is required', code: 422 }, 422);
      }
      if (String(body.question).length > 500) {
        return json(res, { error: 'query too long', code: 400 }, 400);
      }
      const result = await getPipeline().query(String(body.question).trim(), {
        region_code: body.region_code,
        party:       body.party,
        top_k:       body.top_k,
      });
      recordLatency('/api/query', Date.now() - t0);
      return json(res, result);
    }

    // ── resolveRegionCode: 지역 이름→코드 변환 ───────────────────────────────
    function resolveRegionCode(params) {
      if (params.region_code) return String(params.region_code);
      if (!params.region) return null;
      const REGION_MAP = {
        '서울특별시': '11', '서울': '11',
        '부산광역시': '21', '부산': '21',
        '대구광역시': '22', '대구': '22',
        '인천광역시': '23', '인천': '23',
        '전남광주통합특별시': '24', '광주': '24',
        '대전광역시': '25', '대전': '25',
        '울산광역시': '26', '울산': '26',
        '세종특별자치시': '29', '세종': '29',
        '경기도': '31', '경기': '31',
        '강원특별자치도': '32', '강원': '32',
        '충청북도': '33', '충북': '33',
        '충청남도': '34', '충남': '34',
        '전북특별자치도': '35', '전북': '35',
        '경상북도': '37', '경북': '37',
        '경상남도': '38', '경남': '38',
        '제주특별자치도': '39', '제주': '39',
      };
      const name = params.region.trim();
      return REGION_MAP[name] || null;
    }

    // ─── POST|GET /api/predict ────────────────────────────────────────────
    if (pathname === '/api/predict' && (req.method === 'POST' || req.method === 'GET')) {
      const body = req.method === 'GET' ? qs : await readBody(req);
      const code = resolveRegionCode(body);
      if (!code) return json(res, {
        error: 'region_code(숫자) 또는 region(지역명) 파라미터가 필요합니다.',
        example_names: ['서울', '경기', '부산'],
      }, 400);
      const result = await getPipeline().predict(code);
      recordLatency('/api/predict', Date.now() - t0);
      return json(res, result);
    }

    // ─── GET /api/insight/:code ───────────────────────────────────────────
    const insightMatch = pathname.match(/^\/api\/insight\/(\d{2})$/);
    if (insightMatch && req.method === 'GET') {
      const result = await getPipeline().insight(insightMatch[1]);
      return json(res, result);
    }

    // ─── GET /api/schedule ────────────────────────────────────────────────
    if (pathname === '/api/schedule' && req.method === 'GET') {
      return json(res, {
        election_name: '제9회 전국동시지방선거',
        election_date: '2026-06-03',
        election_time: '06:00~18:00',
        early_voting:  [{ date: '2026-05-29', time: '06:00~18:00' }, { date: '2026-05-30', time: '06:00~18:00' }],
        voter_roll_inspection: { start: '2026-05-19', end: '2026-05-23' },
        candidate_registration: { start: '2026-05-12', end: '2026-05-13' },
        official_links: [
          { label: '투표소 찾기', url: 'https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&topMenuId=BI&secondMenuId=BIPP01' },
          { label: '내 선거구 확인', url: 'https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&topMenuId=BI&secondMenuId=BIGI05' },
          { label: '후보자 정보', url: 'https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&topMenuId=CP&secondMenuId=CPRI03' },
          { label: '정책공약마당', url: 'https://policy.nec.go.kr' },
        ],
        source: '중앙선거관리위원회',
        source_url: 'https://www.nec.go.kr',
      });
    }

    // ─── GET /api/geo ─────────────────────────────────────────────────────
    if (pathname === '/api/geo' && req.method === 'GET') {
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
              || req.socket?.remoteAddress || '127.0.0.1';
      const region = detectRegionByIP(ip);
      return json(res, { ip, ...region, source: 'IP Geolocation' });
    }

    // ─── POST /api/events ─────────────────────────────────────────────────
    if (pathname === '/api/events' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.event_name || !body.session_id) {
        return json(res, { error: 'event_name, session_id 필수' }, 400);
      }
      const stored = recordEvent({
        event_name: body.event_name,
        session_id: body.session_id,
        user_id:    body.user_id || 'anon',
        timestamp:  body.timestamp || new Date().toISOString(),
        properties: body.properties || {},
      });
      if (!stored) return json(res, { status: 'dedup', message: '중복 이벤트 제거됨' });
      return json(res, { status: 'ok', dedup_key: stored.dedup_key });
    }

    // ─── GET /api/metrics (Admin) ─────────────────────────────────────────
    if (pathname === '/api/metrics' && req.method === 'GET') {
      const sessionIds = [...new Set(eventStore.map(e => e.session_id))];
      const aiQueryUsers = new Map();
      const comparerIds  = new Set();

      eventStore.forEach(e => {
        if (e.event_name === 'ai_query') aiQueryUsers.set(e.session_id, (aiQueryUsers.get(e.session_id) || 0) + 1);
        if (e.event_name === 'candidate_compare') comparerIds.add(e.session_id);
      });

      const multiQueryUsers = [...aiQueryUsers.values()].filter(v => v >= 3).length;
      const total = sessionIds.length || 1;

      return json(res, {
        gate_conditions: {
          field_missing_rate:   validateCandidateSchema(getCandidates()).length === 0,
          latency_p95_le300ms:  computePercentile(latencyBuckets['/api/query'], 95) <= 300 || latencyBuckets['/api/query'].length === 0,
        },
        service_metrics: {
          total_sessions:         total,
          predict_submit_rate:    eventMetrics.predict_submit / total,
          ai_3plus_query_rate:    multiQueryUsers / total,
          candidate_compare_rate: comparerIds.size / total,
        },
        raw_metrics:  eventMetrics,
        total_events: eventStore.length,
        latency:      Object.fromEntries(Object.entries(latencyBuckets).map(([k, v]) => [k, { p95: computePercentile(v, 95), p99: computePercentile(v, 99) }])),
      });
    }

    // ─── POST /api/match (가치관 기반 후보 매칭) ─────────────────────────
    if (pathname === '/api/match' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers)) {
        return json(res, { error: 'answers is required', code: 422 }, 422);
      }

      const answers = body.answers;

      // 각 퀴즈 키 → 검색 키워드·레이블 매핑
      const searchTerms = {};
      for (const key of Object.keys(MATCH_KEYWORDS)) {
        const val = String(answers[key] || '').toUpperCase();
        if (MATCH_KEYWORDS[key][val]) {
          searchTerms[key] = {
            keywords:   MATCH_KEYWORDS[key][val],
            label:      ANSWER_LABELS[key][val],
            fieldLabel: FIELD_LABELS[key],
          };
        }
      }

      if (Object.keys(searchTerms).length === 0) {
        return json(res, { error: 'answers must contain at least one valid key (edu/eco/env/housing/welfare) with value A/B/C', code: 422 }, 422);
      }

      const allCandidates = getCandidates();

      const scored = allCandidates.map(c => {
        // 후보 전체 텍스트 (소문자화)
        const candidateText = [
          c.name, c.party, c.region, c.district,
          (c.tags   || []).join(' '),
          (c.career || []).join(' '),
          ...(c.policies || []).map(p =>
            `${p.category} ${p.title} ${p.summary} ${p.detail || ''}`
          ),
        ].join(' ').toLowerCase();

        let totalFields   = 0;
        let matchedFields = 0;
        const reasons     = [];

        for (const [, { keywords, label, fieldLabel }] of Object.entries(searchTerms)) {
          totalFields++;
          const matched = keywords.some(kw => candidateText.includes(kw.toLowerCase()));
          if (matched) {
            matchedFields++;
            // 실제 매칭된 공약 제목을 reason으로 활용
            const matchedPolicy = (c.policies || []).find(p => {
              const pt = `${p.category} ${p.title} ${p.summary} ${p.detail || ''}`.toLowerCase();
              return keywords.some(kw => pt.includes(kw.toLowerCase()));
            });
            reasons.push(matchedPolicy
              ? `${fieldLabel}: ${matchedPolicy.title}`
              : `${fieldLabel}: ${label} 관련 공약 보유`
            );
          }
        }

        const score = totalFields > 0 ? matchedFields / totalFields : 0;
        return { c, score, reasons };
      });

      const matches = scored
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score || b.reasons.length - a.reasons.length)
        .slice(0, 5)
        .map(({ c, score, reasons }) => ({
          id:       c.id,
          name:     c.name,
          party:    c.party,
          region:   c.region,
          district: c.district,
          score:    Math.round(score * 100) / 100,
          reasons,
        }));

      return json(res, { matches });
    }

    return json(res, { error: '존재하지 않는 API 경로입니다.' }, 404);

  } catch (e) {
    console.error('[API ERROR]', pathname, e.message);
    return json(res, { error: '서버 내부 오류', message: e.message }, 500);
  }
}

// ── 정적 파일 서빙 ───────────────────────────────────────────────────────
function serveStatic(req, res) {
  let urlPath = url.parse(req.url).pathname;
  // SPA 폴백: /api 이외의 경로는 index.html 반환 (클라이언트 라우팅)
  if (!path.extname(urlPath) || urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(PUBLIC, urlPath);
  if (!filePath.startsWith(PUBLIC)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') { res.writeHead(404); res.end('Not Found'); }
      else { res.writeHead(500); res.end('Server Error'); }
      return;
    }
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    const cc = ext === '.html' ? 'no-cache' : 'public, max-age=3600';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': cc });
    res.end(data);
  });
}

// ── 메인 서버 ─────────────────────────────────────────────────────────────
// httpServer: HTTP 파서 + 라우팅 담당 (직접 포트 listen 안 함)
const httpServer = http.createServer({ insecureHTTPParser: true }, (req, res) => {
  const u = url.parse(req.url).pathname;
  if (u.startsWith('/api/')) {
    handleAPI(req, res).catch(e => {
      console.error('[UNHANDLED]', e);
      res.writeHead(500); res.end('Internal Server Error');
    });
  } else {
    serveStatic(req, res);
  }
});

// tcpServer: TCP 레이어에서 요청라인의 비ASCII 문자를 percent-encode 후 httpServer로 넘김
// (curl이 한글을 raw UTF-8로 보낼 때 Node HTTP 파서가 400을 내는 문제 해결)
const server = net.createServer((socket) => {
  let buffer = Buffer.alloc(0);
  let handled = false;

  function onFirstData(chunk) {
    if (handled) return;
    buffer = Buffer.concat([buffer, chunk]);

    // HTTP 요청라인 끝(\r\n)이 도착할 때까지 버퍼링
    const crlfIdx = buffer.indexOf('\r\n');
    if (crlfIdx === -1) return;

    handled = true;
    socket.removeListener('data', onFirstData);

    // 요청라인만 추출 → URL 부분의 비ASCII(UTF-8) 바이트를 percent-encode
    const requestLineBuf = buffer.slice(0, crlfIdx);
    const requestLine = requestLineBuf.toString('latin1');
    const m = requestLine.match(/^([A-Z]+ )(.+?)( HTTP\/\d+\.\d+)$/);
    let sanitized;
    if (m) {
      const encodedUrl = m[2].replace(/[\x80-\xFF]/g, (ch) => {
        return '%' + Buffer.from(ch, 'latin1').toString('hex').toUpperCase().match(/.{2}/g).join('%');
      });
      sanitized = Buffer.concat([
        Buffer.from(m[1] + encodedUrl + m[3], 'latin1'),
        buffer.slice(crlfIdx),
      ]);
    } else {
      sanitized = buffer;
    }

    // HTTP 서버에 소켓 연결 후, 정제된 데이터를 스트림 앞에 삽입
    httpServer.emit('connection', socket);
    socket.unshift(sanitized);
  }

  socket.on('data', onFirstData);
  socket.on('error', () => {});
});

server.listen(PORT, async () => {
  console.log(`[서버] 2026 지방선거 AI 서비스 → http://localhost:${PORT}`);
  console.log(`[서버] 데이터 출처: 중앙선거관리위원회 (www.nec.go.kr)`);

  // 스키마 검증
  const errors = validateCandidateSchema(getCandidates());
  if (errors.length) {
    console.error('[서버] 스키마 오류 발생!', errors);
  } else {
    console.log(`[서버] ✓ 스키마 검증 통과 — ${getCandidates().length}명 후보자`);
  }

  // AI 파이프라인 워밍업 — 백그라운드 실행 (첫 요청을 막지 않음)
  const pipe = getPipeline();
  pipe.reindex()
    .then(async () => {
      const s = await pipe.stats();
      console.log(`[서버] ✓ AI 인덱스 완료 — ${s.index_docs}개 문서`);
      // 자동 갱신 스케줄 (30분)
      pipe.scheduleAutoRefresh();
      console.log('[서버] ✓ 30분 자동 갱신 스케줄 등록');
    })
    .catch(e => console.error('[서버] AI 인덱스 초기화 실패:', e.message));

  // Render 무료 플랜 슬립 방지: 14분마다 self-ping
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
  if (RENDER_URL) {
    const selfPing = () => {
      const mod = RENDER_URL.startsWith('https') ? require('https') : require('http');
      mod.get(`${RENDER_URL}/api/health`, res => { res.resume(); }).on('error', () => {});
    };
    setInterval(selfPing, 14 * 60 * 1000);
    console.log(`[서버] ✓ 슬립 방지 핑 등록 → ${RENDER_URL}`);
  }
});

// ── Render 콜드스타트 방지 keep-alive ──────────────────────────────
const SELF_URL = process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL;
if (SELF_URL) {
  const keepAliveHttps = require('https');
  const keepAliveHttp  = require('http');
  setInterval(() => {
    const pingUrl = `${SELF_URL}/api/schedule`;
    const mod = pingUrl.startsWith('https') ? keepAliveHttps : keepAliveHttp;
    mod.get(pingUrl, res => {
      console.log(`[keep-alive] ping → ${res.statusCode}`);
      res.resume();
    }).on('error', err => console.warn('[keep-alive] ping 실패:', err.message));
  }, 10 * 60 * 1000); // 10분
  console.log('[서버] ✓ keep-alive 활성화 →', SELF_URL);
}

module.exports = server;
