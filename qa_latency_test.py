import subprocess, json

BASE = "https://election-2026-ai.onrender.com"
queries = [
  "서울시장 후보 알려줘",
  "부산시장은 누가 출마했어",
  "경기도지사 후보 공약은",
  "인천시장 후보 정당은",
  "대전시장 후보 누구야",
  "광주시장 선거 현황은",
  "울산시장 후보 알려줘",
  "세종시장 후보 공약은",
  "제주도지사 후보는",
  "충남도지사 후보 정당은",
  "강원도지사 후보 누구야",
  "전북도지사 선거 현황은",
  "경남도지사 후보 알려줘",
  "경북도지사 공약은",
  "전남도지사 후보 정당은",
  "충북도지사 후보 누구야",
  "서울 강남구청장 후보는",
  "부산 해운대구청장 후보는",
  "2026 지방선거 투표일은",
  "지방선거 투표 방법 알려줘"
]

latencies = []
for i, q in enumerate(queries):
    cmd = [
        "curl", "-s",
        "-w", "\n###TIME###%{time_total}",
        "-X", "POST", f"{BASE}/api/query",
        "-H", "Content-Type: application/json",
        "-d", json.dumps({"question": q})
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    out = result.stdout
    parts = out.rsplit("\n###TIME###", 1)
    t_sec = float(parts[1].strip()) if len(parts) > 1 else 0.0
    ms = int(t_sec * 1000)
    latencies.append(ms)
    print(f"[{i+1:02d}] {ms:5d}ms | {q}")

s = sorted(latencies)
n = len(s)
p95 = s[int(n * 0.95) - 1]
p99 = s[min(int(n * 0.99), n - 1)]
print()
print(f"정렬: {s}")
print(f"P95: {p95}ms")
print(f"P99: {p99}ms")
