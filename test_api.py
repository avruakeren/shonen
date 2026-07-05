import requests, json
url = 'http://127.0.0.1:5000/api/details/digimon-bb-sub-indo'
try:
    r = requests.get(url, timeout=10)
    print('Status:', r.status_code)
    print('Headers:', dict(r.headers))
    # Print first 500 chars of body
    body = r.text
    print('Body (first 500 chars):')
    print(body[:500])
except Exception as e:
    print('Error:', e)
