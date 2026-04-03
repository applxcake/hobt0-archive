#!/usr/bin/env python3
"""
Test all Gemini models and report response times.
Usage: python3 gemini_model_tester.py <API_KEY>
"""

import urllib.request
import urllib.error
import json
import time
import sys
import ssl

# List of Gemini models to test
GEMINI_MODELS = [
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-1.5-pro",
    "gemini-1.5-pro-latest",
    "gemini-2.0-flash",
    "gemini-2.0-flash-exp",
    "gemini-1.0-pro",
    "gemini-3.0-flash",
    "gemini-3.0-flash-preview",
    "gemini-3.0-flash-exp",
]

TEST_PROMPT = 'Return JSON:{"summary":"hi","tags":["a","b","c"],"time":1}'
TEST_URL = "https://example.com"

def test_model(api_key: str, model: str):
    """Test a single model and return response time and status."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    
    payload = {
        "contents": [{
            "role": "user",
            "parts": [{"text": f"{TEST_PROMPT}\n\nURL: {TEST_URL}"}]
        }],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.3,
        }
    }
    
    data = json.dumps(payload).encode('utf-8')
    ctx = ssl.create_default_context()
    
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    
    start_time = time.time()
    try:
        response = urllib.request.urlopen(req, timeout=30, context=ctx)
        elapsed = time.time() - start_time
        
        resp_data = json.loads(response.read().decode('utf-8'))
        text = resp_data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        
        try:
            json.loads(text)
            return {
                "model": model,
                "status": "✓ WORKING",
                "response_time": f"{elapsed:.2f}s",
                "time_ms": elapsed * 1000,
                "error": None
            }
        except json.JSONDecodeError:
            return {
                "model": model,
                "status": "⚠ JSON ERROR",
                "response_time": f"{elapsed:.2f}s",
                "time_ms": elapsed * 1000,
                "error": "Invalid JSON response"
            }
            
    except urllib.error.HTTPError as e:
        elapsed = time.time() - start_time
        try:
            error_data = json.loads(e.read().decode('utf-8'))
            error_msg = error_data.get("error", {}).get("message", f"HTTP {e.code}")
        except:
            error_msg = f"HTTP {e.code}"
        
        return {
            "model": model,
            "status": "✗ FAILED",
            "response_time": f"{elapsed:.2f}s",
            "time_ms": elapsed * 1000,
            "error": error_msg[:100]
        }
        
    except Exception as e:
        return {
            "model": model,
            "status": "✗ ERROR",
            "response_time": "N/A",
            "time_ms": 999999,
            "error": str(e)[:100]
        }

def main():
    if len(sys.argv) < 2:
        print("Usage: python gemini_model_tester.py <API_KEY>")
        print("\nExample:")
        print("  python gemini_model_tester.py AIzaSy...")
        sys.exit(1)
    
    api_key = sys.argv[1]
    
    print("=" * 70)
    print("GEMINI MODEL TESTER")
    print("=" * 70)
    print(f"Testing {len(GEMINI_MODELS)} models...\n")
    
    results = []
    for model in GEMINI_MODELS:
        print(f"Testing {model}...", end=" ", flush=True)
        result = test_model(api_key, model)
        results.append(result)
        print(f"{result['status']} ({result['response_time']})")
        if result['error']:
            print(f"  └─ {result['error'][:60]}")
    
    print("\n" + "=" * 70)
    print("RESULTS SUMMARY")
    print("=" * 70)
    
    # Sort by response time (only working ones)
    working = [r for r in results if "WORKING" in r['status']]
    failed = [r for r in results if "WORKING" not in r['status']]
    
    if working:
        print("\n✓ WORKING MODELS (sorted by speed):\n")
        working.sort(key=lambda x: x['time_ms'])
        for i, r in enumerate(working, 1):
            print(f"  {i}. {r['model']:<25} {r['response_time']:>8}  {r['status']}")
        print(f"\n  FASTEST: {working[0]['model']} ({working[0]['response_time']})")
    
    if failed:
        print("\n✗ FAILED MODELS:\n")
        for r in failed:
            print(f"  • {r['model']:<25} {r['status']:>12}")
            if r['error']:
                print(f"    └─ {r['error'][:50]}")
    
    print("\n" + "=" * 70)
    
    # Recommendation
    if working:
        fastest = working[0]
        print(f"\nRECOMMENDATION:")
        print(f"  Use model: {fastest['model']}")
        print(f"  Response time: {fastest['response_time']}")
        print(f"\n  Update your .env.local:")
        print(f'  VITE_GEMINI_MODEL="{fastest["model"]}"')
    else:
        print("\n⚠ No working models found!")
        print("  Check your API key or wait for quota reset.")
    
    print()

if __name__ == "__main__":
    main()
