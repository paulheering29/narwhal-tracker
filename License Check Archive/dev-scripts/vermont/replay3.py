exec(open('replay2.py').read().split("r1=change(")[0])
r1=change('$PpyDisplayHarness$pProductIds','PC038',tk['NGLPRosterDownload'])
# statuses: all four ticked, one at a time, as the page does
for i in range(1,5):
    prop=f'$PpyDisplayHarness$pEligibleStatusforRoster$l{i}$pSelectStatus'
    f=[(prop,'true'),('pzuiactionzzz',tk['NGLPRosterDownloadStatusSelect']),('pyPropertyTarget',prop),('updateDOM','true'),('BaseReference',f'pyDisplayHarness.EligibleStatusforRoster({i})'),('ContextPage',''),('pzKeepPageMessages','true'),('PVClientVal','true'),('UITemplatingStatus','N'),('inStandardsMode','true'),('pzHarnessID',hid)]
    rs=post(purl,f,H); print('status',i,len(rs),re.sub(r'\s+',' ',rs)[-420:])
rt=change('$PpyDisplayHarness$pSetProfessionType','NGLP146',tk['NGLPRosterDownload'])
print('type',len(rt))
# download click: the button's own token from the page
tt0=r0.replace('\\u003d','=').replace('\\u0027',"'")
m=re.search(r'"9e2aa9891a699fbff4304b97cccda738ebb71a2a_42":" data-click=\'(.*?)\' "',tt0)
print('download action found',bool(m))
dl_tok=urllib.parse.unquote(re.search(r'pzuiactionzzz=([A-Za-z0-9%*=_+/-]+)',m.group(1)).group(1))
f=[('pzuiactionzzz',dl_tok),('PreActivitiesList',''),('ActivityParams','='),('PreActivityContextPageList','$NULL$'),('pzKeepPageMessages','false'),('strPHarnessClass','SoV-License-NGLP-Work-License'),('strPHarnessPurpose','NGLPFindAProfessionalExternal'),('BaseReference',''),('StreamList',f'NGLPRosterDownloadResults|Rule-HTML-Section||||Y|SID1789945999999|:'),('bClientValidation','true'),('HeaderButtonSectionName','-1'),('ReadOnly','-1'),('PagesToRemove',''),('pzHarnessID',hid),('inStandardsMode','true')]
rd=post(purl,f,H); print('download click',len(rd))
gu=f'{base}?pyActivity=%40baseclass.pzProcessURLInWindow&pyPreActivity=NGLPGenerateRosterDownload&pzPrimaryPageName=pyDisplayHarness&target=popup&pzHarnessID={hid}'
r=op.open(urllib.request.Request(gu,headers={'User-Agent':UA,'Referer':HOST+'/'}),timeout=90)
data=r.read(); print(r.status, r.headers.get('content-type'), r.headers.get('content-disposition'), len(data), data[:4])
open('roster.xlsx','wb').write(data)
open('rd.html','w').write(rd); open('rt.html','w').write(rt)
import time
for attempt in range(3):
    time.sleep(2)
    r=op.open(urllib.request.Request(gu,headers={'User-Agent':UA,'Referer':HOST+'/'}),timeout=90); d=r.read(); print('retry',attempt,len(d))
# what does the server think? try a lookup-style check: reload the input section and see what is selected
