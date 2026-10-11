import re, json, urllib.request, urllib.parse, http.cookiejar, html as H
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15'
HOST='https://secure.professionals.vermont.gov'
jar=http.cookiejar.CookieJar()
op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def get(url):
    r=op.open(urllib.request.Request(url,headers={'User-Agent':UA}),timeout=60); return r.geturl(), r.read()
def post(url,fields,headers):
    body=fields if isinstance(fields,str) else urllib.parse.urlencode(fields)
    h={'User-Agent':UA,'Content-Type':'application/x-www-form-urlencoded','X-Requested-With':'XMLHttpRequest','Origin':HOST,'Referer':HOST+'/','Accept':'*/*'}; h.update(headers)
    r=op.open(urllib.request.Request(url,data=body.encode(),headers=h),timeout=60); return r.read().decode('utf8','replace')
def tokens(t):
    t=t.replace('\\u003d','=').replace('\\u0026','&')
    return [(m.start(),m.group(1)) for m in re.finditer(r'pzuiactionzzz=([A-Za-z0-9%*=_+/-]+)',t)]
