"""Gate Condition 검증 — 레이턴시 P95/P99 측정"""
import urllib.request, json, time

url = "http://localhost:3001/api/query"
queries = [
    "서울시장 후보 누구야?",
    "경기도 지사 공약은?",
    "투표소 어디야?",
    "대전 후보자 비교",
    "부산 선거 결과는?",
    "강원도 환경 정책",
    "제주 탄소중립 공약",
    "사전투표 날짜 언제야?",
    "경북 원전 공약",
    "세종 행정수도 공약",
    "충남 에너지 전환",
    "대구 교통 공약",
    "인천 경제자유구역",
    "울산 수소산업",
    "전북 새만금 개발",
    "충북 반도체 공약",
    "경남 방산 산업",
    "광주 AI 공약",
    "대전 과학기술",
    "강원 관광 정책",
]

times = []
for q in queries:
    data = json.dumps({"question": q}).encode()
    t0 = time.time()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req) as r:
        r.read()
    ms = (time.time() - t0) * 1000
    times.append(ms)

times_sorted = sorted(times)
n = len(times_sorted)

def percentile(arr, p):
    idx = max(0, int(len(arr) * p / 100) - 1)
    return arr[idx]

p95 = percentile(times_sorted, 95)
p99 = percentile(times_sorted, 99)
print(f"N={n}, min={min(times):.1f}ms, max={max(times):.1f}ms, avg={sum(times)/n:.1f}ms")
print(f"P95={p95:.1f}ms (gate: ≤300ms) → {'PASS' if p95<=300 else 'FAIL'}")
print(f"P99={p99:.1f}ms (gate: ≤800ms) → {'PASS' if p99<=800 else 'FAIL'}")
print(f"Individual times: {[round(t,1) for t in times]}")
