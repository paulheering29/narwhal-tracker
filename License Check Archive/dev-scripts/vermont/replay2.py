import re,sys,json,pickle
sys.path.insert(0,'.')
from vt import *
exec(open('replay1.py').read().split("r=post(url,fields,H)")[0])   # session + tab-click setup
r0=post(url,fields,H)
def sec_tokens(t):
    out={}
    for m in re.finditer(r'secPostValueURL":"pzuiactionzzz\\u003d([^"]+)"',t):
        sec=re.findall(r'\\?"section\\?":\\?"(\w+)',t[:m.start()])[-1]
        out[sec]=urllib.parse.unquote(m.group(1))
    return out
tk=sec_tokens(r0); print({k:v[-8:] for k,v in tk.items()})
purl=f'{base}?pzTransactionId={tx}&pzFromFrame=pyDisplayHarness&pzPrimaryPageName=pyDisplayHarness&AJAXTrackID=1'
def change(prop,value,token,baseref=''):
    f=[(prop,value),('pzuiactionzzz',token),('pyPropertyTarget',prop.replace('$P','$P')),('updateDOM','true'),('BaseReference',baseref),('ContextPage',''),('pzKeepPageMessages','true'),('UITemplatingStatus','Y'),('PVClientVal','true'),('inStandardsMode','true'),('pzHarnessID',hid)]
    return post(purl,f,H)
r1=change('$PpyDisplayHarness$pProductIds','PC038',tk['NGLPRosterDownload'])
print('product resp',len(r1)); print(re.sub(r'\s+',' ',r1)[:300])
open('r1.html','w').write(r1)
