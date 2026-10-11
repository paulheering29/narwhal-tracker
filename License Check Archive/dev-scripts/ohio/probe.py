import json, time, collections, re
exec(open('states2.py').read().split("STATES = (")[0])          # run_with / rows_of definitions
def run_last(state, last, county='none'):
    import urllib.request
    call = json.loads(json.dumps(search)); d = call['data'][0]; d['state'] = state; d['county'] = county; d['lastName'] = last; call['tid'] = 5
    req = urllib.request.Request(URL, data=json.dumps([call]).encode(), method='POST', headers={
        'Content-Type': 'application/json', 'Origin': 'https://elicense.ohio.gov', 'Referer': 'https://elicense.ohio.gov/oh_verifylicense',
        'X-User-Agent': 'Visualforce-Remoting', 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=40) as r: return rows_of(json.loads(r.read())[0])

print('== does lastName match by prefix? (OH, last name "S" and "Sm")')
for last in ('S', 'Sm', 'Smith'):
    rs = run_last('OH', last); time.sleep(0.4)
    firsts = collections.Counter(re.sub(r'^\W*(\w).*', r'\1', x['Applicant']).upper() for x in rs)
    print(f'  "{last}": {len(rs) if rs is not None else None} records | first letters of "Applicant": {dict(firsts.most_common(4))}')

rows = json.load(open('all-states.json'))
C = collections.Counter
shape = lambda s: re.sub(r'[A-Za-z]+', 'W', str(s))
print('\n== formats')
print('Applicant shapes:', C(shape(x['Applicant']) for x in rows).most_common(5), '| Name shapes:', C(shape(x['Name']) for x in rows).most_common(3))
print('same Applicant/Name:', sum(1 for x in rows if x['Applicant'] == x['Name']), '/', len(rows), '| any comma-less Applicant:', sum(1 for x in rows if ',' not in x['Applicant']))
print('ExpirationDate shapes:', C(re.sub(r'\d', '9', str(x['ExpirationDate'])) for x in rows).most_common(4))
print('license patterns:', C(re.sub(r'\d', '9', str(x['license'])) for x in rows).most_common(5))
print('Type:', C(x['Type'] for x in rows), '| Board:', C(x['Board'] for x in rows))
print('status x has-expiry:', dict(C((x['Status'], bool(str(x['ExpirationDate']).strip())) for x in rows)))
print('status x number prefix:', dict(C((x['Status'], str(x['license'])[:4]) for x in rows)))
print('State values:', C(x['State'] for x in rows).most_common(4), '| City filled:', sum(1 for x in rows if str(x['City']).strip()))
print('RecNumber vs license same?', sum(1 for x in rows if str(x['RecNumber']) == str(x['license'])), '/', len(rows))
