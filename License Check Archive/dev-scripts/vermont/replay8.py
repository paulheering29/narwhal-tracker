import re,sys,json
sys.path.insert(0,'.')
from vt import *
def enc(pairs):
    out=[]
    for k,v in pairs:
        if k=='pzuiactionzzz': out.append('pzuiactionzzz='+v)          # already percent-encoded, sent as issued
        else: out.append(urllib.parse.quote(k,safe='$')+'='+urllib.parse.quote(v,safe=''))
    return '&'.join(out)
u,b=get(HOST+'/prweb/PRServletCustom?UserIdentifier=LicenseLookupGuestUser')
t=b.decode('utf8','replace'); base=u.split('?')[0]
csrf=re.search(r'"activeCSRFToken":\s*"([0-9a-f]+)"',t).group(1)
tx=re.search(r'pzTransactionId=([0-9a-f]{32})',t).group(1)
hid=re.search(r'(HID[0-9A-F]{32})',t).group(1)
def uid(t,name): return re.search(r'\\?"section\\?":\\?"'+name+r'\\?",\\?"class\\?":\\?"[\w-]+\\?"(?:,\\?"RO\\?":\\?"\w+\\?")?,\\?"UID\\?":\\?"(SID\d+)',t).group(1)
def click_token(text,key):
    tt=text.replace('\\u003d','=').replace('\\u0027',"'")
    m=re.search(r'"'+key+r'":" data-click=\'(.*?)\' "',tt)
    return re.search(r'pzuiactionzzz=([A-Za-z0-9%*=_+/-]+)',m.group(1)).group(1)
def sec_tokens(text):
    out={}
    for m in re.finditer(r'secPostValueURL":"pzuiactionzzz\\u003d([^"]+)"',text):
        sec=re.findall(r'\\?"section\\?":\\?"(\w+)',text[:m.start()])[-1]; out[sec]=m.group(1)
    return out
H={'pzCTkn':csrf,'pzBFP':'{v2}288f37d7e5bece7d9d577d64d89da913'}
P='pzFromFrame=pyDisplayHarness&pzPrimaryPageName=pyDisplayHarness&AJAXTrackID=1'
def P_(url,pairs): return post(url,enc(pairs),H)
lookup=[(k,'') for k in ('$PpyDisplayHarness$pLookupNumber','$PpyDisplayHarness$pFirstName','$PpyDisplayHarness$pLastName','$PpyDisplayHarness$pBusinessEntity$pTradeName','$PpyDisplayHarness$pLicenseLookupVal')]
def common(stream,extra=()):
    return [('PreActivitiesList',''),('ActivityParams','='),('PreActivityContextPageList','$NULL$'),('pzKeepPageMessages','false'),('strPHarnessClass','SoV-License-NGLP-Work-License'),('strPHarnessPurpose','NGLPFindAProfessionalExternal'),('BaseReference',''),('StreamList',stream),('bClientValidation','true'),('HeaderButtonSectionName','-1'),('ReadOnly','-1'),('PagesToRemove',''),('pzHarnessID',hid),('inStandardsMode','true'),*extra]
r0=P_(f'{base}?pzTransactionId={tx}&{P}&eventSrcSection=SoV-License-NGLP-Work-License.FindAProfessionalInput',
  lookup+[('$PpyDisplayHarness$pProductIds',''),('$PpyDisplayHarness$pSetProfessionType',''),('pzuiactionzzz',click_token(t,'bf9d784e089c57beec877cbdf74910fa9764abd3_20')),('SectionIDList','GID_1')]+common(f'FindAProfessionalWrapper|Rule-HTML-Section||||Y|{uid(t,"FindAProfessionalWrapper")}|:',[('eventSrcSection','SoV-License-NGLP-Work-License.FindAProfessionalInput')]))
tk=sec_tokens(r0); purl=f'{base}?pzTransactionId={tx}&{P}'
def change(prop,value,token,baseref='',tmpl='Y'):
    return P_(purl,[(prop,value),('pzuiactionzzz',token+'='),('pyPropertyTarget',prop),('updateDOM','true'),('BaseReference',baseref),('ContextPage',''),('pzKeepPageMessages','true'),('UITemplatingStatus',tmpl),('PVClientVal','true'),('inStandardsMode','true'),('pzHarnessID',hid)])
change('$PpyDisplayHarness$pProductIds','PC038',tk['NGLPLicenseLookupInput'])          # the profession list belongs to the lookup section
for i in range(1,5):
    change(f'$PpyDisplayHarness$pEligibleStatusforRoster$l{i}$pSelectStatus','true',tk['NGLPRosterDownloadStatusSelect'],f'pyDisplayHarness.EligibleStatusforRoster({i})','N')
change('$PpyDisplayHarness$pSetProfessionType','NGLP146',tk['NGLPRosterDownload'])
dl=click_token(r0,'9e2aa9891a699fbff4304b97cccda738ebb71a2a_42')
P_(purl,[('pzuiactionzzz',dl)]+common('NGLPRosterDownloadResults|Rule-HTML-Section||||Y|SID1789945999999|:'))
gu=f'{base}?pyActivity=%40baseclass.pzProcessURLInWindow&pyPreActivity=NGLPGenerateRosterDownload&pzPrimaryPageName=pyDisplayHarness&target=popup&pzHarnessID={hid}'
r=op.open(urllib.request.Request(gu,headers={'User-Agent':UA,'Referer':HOST+'/'}),timeout=90); d=r.read()
print(r.status,len(d)); open('roster.xlsx','wb').write(d)
