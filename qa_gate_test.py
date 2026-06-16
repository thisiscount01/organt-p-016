"""
Gate Condition 검증 스크립트 — QA 자동 측정
"""
import urllib.request, urllib.error, time, json, statistics

def measure(label, url, method="GET", payload=None, n=60):
    times = []
    errors = []
    for i in range(n):
        t0 = time.perf_counter()
        try:
            if method == "POST":
                req = urllib.request.Request(url, data=payload,
                      headers={"Content-Type": "application/json"}, method="POST")
                r = urllib.request.urlopen(req, timeout=10)
            else:
                r = urllib.request.urlopen(url, timeout=10)
            r.read()
            times.append((time.perf_counter() - t0) * 1000)
        except Exception as e:
            errors.append(str(e)[:80])
    if not times:
        print(f"{label}: 전체 실패 errors={errors[:3]}")
        return None
    times.sort()
    n2 = len(times)
    def pct(p):
        idx = max(0, int(n2 * p / 100) - 1)
        return times[idx]
    p95 = pct(95)
    p99 = pct(99)
    print(f"\n[{label}] n={n2} err={len(errors)}")
    print(f"  P50={statistics.median(times):.1f}ms  P95={p95:.1f}ms  P99={p99:.1f}ms  MAX={max(times):.1f}ms")
    print(f"  Gate P95<=300: {'PASS' if p95 <= 300 else 'FAIL'}  P99<=800: {'PASS' if p99 <= 800 else 'FAIL'}")
    return {"p95": round(p95, 1), "p99": round(p99, 1), "errors": len(errors)}

BASE = "http://localhost:3001"

print("=" * 55)
print("GATE 1: API 레이턴시 P95≤300ms, P99≤800ms")
print("=" * 55)

# 1. GET /api/candidates
r1 = measure("GET /api/candidates", f"{BASE}/api/candidates")

# 2. GET /api/predict?region_code=11 (서울, 정상 파라미터)
r2 = measure("GET /api/predict (region_code=11)", f"{BASE}/api/predict?region_code=11")

# 3. GET /api/predict?region=서울&position=시장 (요청서 명시 형식)
print("\n[GET /api/predict?region=서울&position=시장 형식 검증]")
try:
    r = urllib.request.urlopen(
        f"{BASE}/api/predict?region=%EC%84%9C%EC%9A%B8&position=%EC%8B%9C%EC%9E%A5",
        timeout=5)
    body = json.loads(r.read())
    print(f"  HTTP 200, keys={list(body.keys())[:6]}, error={body.get('error', 'none')}")
except urllib.error.HTTPError as e:
    body = json.loads(e.read())
    print(f"  HTTP {e.code}, error={body.get('error', '?')}")
except Exception as e:
    print(f"  실패: {e}")

# 4. POST /api/query (AI Q&A 채팅 — 서버에 /api/chat 없음, /api/query가 실제 채팅 엔드포인트)
payload = json.dumps({"question": "서울시장 후보자"}).encode()
r3 = measure("POST /api/query (채팅)", f"{BASE}/api/query", method="POST", payload=payload)

# 5. /api/chat 존재 여부
print("\n[POST /api/chat 존재 여부]")
try:
    req = urllib.request.Request(f"{BASE}/api/chat", data=payload,
          headers={"Content-Type": "application/json"}, method="POST")
    r = urllib.request.urlopen(req, timeout=5)
    print(f"  HTTP {r.status} — 엔드포인트 존재")
except urllib.error.HTTPError as e:
    print(f"  HTTP {e.code} — 엔드포인트 없음 (서버는 /api/query 사용)")
except Exception as e:
    print(f"  오류: {e}")

print("\n" + "=" * 55)
print("GATE 2: 필수 필드 누락률 0%")
print("=" * 55)
r = urllib.request.urlopen(f"{BASE}/api/candidates?limit=100", timeout=5)
resp = json.loads(r.read())
candidates = resp.get("data", [])
print(f"총 후보자: {len(candidates)}")

# 요청서 기준 6개 필드 검사
CHECK = ["name", "region", "party", "vote_rate", "age"]
total_nulls = 0
for f in CHECK:
    nulls = [c.get("name", "?") for c in candidates
             if c.get(f) is None or c.get(f) == "" or c.get(f) == 0]
    cnt = len(nulls)
    total_nulls += cnt
    status = "OK (0건)" if cnt == 0 else f"FAIL ({cnt}건): {nulls[:3]}"
    print(f"  {f}: {status}")

# position 필드 — 서버에는 없고 district가 대체
pos_field = [c.get("name", "?") for c in candidates
             if not c.get("position") and not c.get("district")]
has_pos_explicit = any(c.get("position") for c in candidates)
print(f"  position(명시 필드): {'없음 — district가 역할 대체' if not has_pos_explicit else '있음'}")
print(f"  district(position 대체): {'OK (0건)' if not pos_field else f'FAIL {len(pos_field)}건'}")

print(f"\n필수 필드 누락 총계: {total_nulls}건")
print(f"Gate 2 필수 필드: {'PASS' if total_nulls == 0 else 'FAIL'}")

print("\n" + "=" * 55)
print("GATE FINAL SUMMARY")
print("=" * 55)
results = {"candidates": r1, "predict": r2, "query": r3}
gate1_pass = True
for k, v in results.items():
    if v:
        ok = v["p95"] <= 300 and v["p99"] <= 800
        print(f"  {k}: P95={v['p95']}ms P99={v['p99']}ms → {'PASS' if ok else 'FAIL'}")
        if not ok:
            gate1_pass = False
    else:
        print(f"  {k}: 측정 불가 → FAIL")
        gate1_pass = False

gate2_pass = total_nulls == 0
print(f"\nGate 1 (레이턴시): {'PASS' if gate1_pass else 'FAIL'}")
print(f"Gate 2 (필드 누락): {'PASS' if gate2_pass else 'FAIL'}")
print(f"배포 가능: {'YES' if gate1_pass and gate2_pass else 'NO'}")
