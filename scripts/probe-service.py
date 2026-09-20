"""Measure real responses during a manually triggered rollout/drain; no mutations."""
import argparse
import concurrent.futures
import json
import statistics
import time
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('url', help='Example: http://192.168.100.11:30080')
parser.add_argument('--seconds', type=int, default=60)
args = parser.parse_args()
latencies, failures = [], []
def request(path):
    start = time.perf_counter()
    try:
        with urllib.request.urlopen(args.url.rstrip('/') + path, timeout=3) as response:
            payload = response.read()
            if path.startswith('/api/'):
                json.loads(payload)
            return time.perf_counter() - start, None
    except Exception as exc:
        return None, f'{path}: {type(exc).__name__}'

deadline = time.monotonic() + args.seconds
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    while time.monotonic() < deadline:
        for latency, error in pool.map(request, ['/', '/api/resume']):
            if error:
                failures.append(error)
            else:
                latencies.append(latency * 1000)
        time.sleep(.5)
total = len(latencies) + len(failures)
print(json.dumps({'requests': total, 'successes': len(latencies), 'failures': len(failures),
                  'success_percent': round(100 * len(latencies) / total, 2) if total else 0,
                  'mean_ms': round(statistics.mean(latencies), 2) if latencies else None,
                  'max_ms': round(max(latencies), 2) if latencies else None,
                  'error_examples': failures[:5]}, indent=2))
