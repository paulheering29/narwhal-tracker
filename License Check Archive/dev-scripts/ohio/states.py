import json, time, urllib.request, sys, collections, re
body = json.load(open('body.json'))
search = body[1]                       # findLicensesForOwner only; fetchmetadata is not needed
URL = 'https://elicense.ohio.gov/apexremote'
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15'

def run(state):
    call = json.loads(json.dumps(search)); call['data'][0]['state'] = state; call['tid'] = 5
    req = urllib.request.Request(URL, data=json.dumps([call]).encode(), method='POST', headers={
        'Content-Type': 'application/json', 'Origin': 'https://elicense.ohio.gov', 'Referer': 'https://elicense.ohio.gov/oh_verifylicense',
        'X-User-Agent': 'Visualforce-Remoting', 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=40) as r: return json.loads(r.read())[0]

# 1) Ohio alone: same as the pasted request?
r = run('OH'); print('OH alone: statusCode', r['statusCode'], '| records', len(r['result']) if isinstance(r.get('result'), list) else r.get('result'))

STATES = ('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY '
          'PR VI GU AS MP AA AE AP').split()
allrows, summary, problems = [], {}, {}
for st in STATES:
    try:
        r = run(st)
        res = r.get('result')
        if isinstance(res, list):
            summary[st] = len(res)
            for x in res: x['_searchState'] = st
            allrows += res
        else:
            problems[st] = (r.get('statusCode'), str(res)[:140] if res is not None else str(r.get('message'))[:140])
    except Exception as e:
        problems[st] = ('EXC', str(e)[:140])
    time.sleep(0.4)
json.dump(allrows, open('all-states.json', 'w'))
print('states searched:', len(STATES), '| with results:', sum(1 for v in summary.values() if v), '| total records:', len(allrows))
print('counts (non-zero):', {k: v for k, v in sorted(summary.items(), key=lambda kv: -kv[1]) if v})
print('largest single result:', max(summary.values()) if summary else 0, '(150 would suggest a cap)')
print('problems:', problems if problems else 'none')
print('unique license numbers:', len({str(x.get('license')) for x in allrows}), '| unique LicenseId:', len({x.get('LicenseId') for x in allrows}))
