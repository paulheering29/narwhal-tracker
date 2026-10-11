import json, time, collections
exec(open('states.py').read().split("# 1) Ohio alone")[0])   # reuse body/run() definitions

def rows_of(r):
    res = r.get('result')
    if isinstance(res, list): return res
    if isinstance(res, dict) and isinstance(res.get('v'), list): return res['v']     # Salesforce's wrapper for larger payloads
    return None

def run_with(state, county='none'):
    call = json.loads(json.dumps(search)); call['data'][0]['state'] = state; call['data'][0]['county'] = county; call['tid'] = 5
    import urllib.request
    req = urllib.request.Request(URL, data=json.dumps([call]).encode(), method='POST', headers={
        'Content-Type': 'application/json', 'Origin': 'https://elicense.ohio.gov', 'Referer': 'https://elicense.ohio.gov/oh_verifylicense',
        'X-User-Agent': 'Visualforce-Remoting', 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=40) as r: return json.loads(r.read())[0]

STATES = ('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR VI GU AS MP AA AE AP').split()
allrows, counts, bad = [], {}, {}
for st in STATES:
    try:
        rs = rows_of(run_with(st))
        if rs is None: bad[st] = 'unexpected shape'
        else:
            counts[st] = len(rs)
            for x in rs: x['_searchState'] = st
            allrows += rs
    except Exception as e: bad[st] = str(e)[:100]
    time.sleep(0.4)
json.dump(allrows, open('all-states.json', 'w'))
print('total records:', len(allrows), '| states with results:', sum(1 for v in counts.values() if v), '| problems:', bad or 'none')
print('non-zero counts:', dict(sorted(((k, v) for k, v in counts.items() if v), key=lambda kv: -kv[1])))
print('unique license numbers:', len({str(x.get('license')) for x in allrows}))
print('status values:', collections.Counter(x.get('Status') for x in allrows).most_common(6))

# Is Ohio's 150 a cap? Split it by county and see if the pieces add up to more than 150.
oh = [x for x in allrows if x['_searchState'] == 'OH']
by_county = collections.Counter(x['County'] for x in oh)
print('\nOH counties in the 150:', len(by_county), '| top:', by_county.most_common(4))
tot = 0; checked = []
for county, inside in by_county.most_common(5):
    rs = rows_of(run_with('OH', county)); n = len(rs) if rs is not None else None
    checked.append((county, inside, n)); time.sleep(0.4)
print('top counties -> (county, in the 150, when asked for on its own):', checked)
