# logs/traces.jsonl を 1 行ずつ人が読める形にする。使い方: tail -f logs/traces.jsonl | python3 scripts/trace-tail.py
import sys, json
def f(ps): return ", ".join(f"{p['fieldId']}={p['value']}" for p in ps) or "-"
for line in sys.stdin:
    try: t = json.loads(line)
    except Exception: continue
    g = t.get("gate", {})
    seg = [c["text"] + (f"<{c['hint']}>" if c.get("hint") else "") for c in t.get("segment", [])]
    jev = " | ".join(", ".join(f"{k}→{v['choice']}({v['confidence']:.2f})" for k, v in h["answers"].items()) for h in t.get("jev", []))
    print(f"「{t['text']}」 seg={seg} jev={jev or '-'} apply={f(g.get('apply', []))} pending={f(g.get('pending', []))} rejected={f(g.get('rejected', []))}", flush=True)
