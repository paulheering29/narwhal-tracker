import re,sys,json
sys.path.insert(0,'.')
from vt import *
u,b=get(HOST+'/prweb/PRServletCustom?UserIdentifier=LicenseLookupGuestUser')
t=b.decode('utf8','replace')
base=u.split('?')[0]
csrf=re.search(r'"activeCSRFToken":\s*"([0-9a-f]+)"',t).group(1)
tx=re.search(r'pzTransactionId=([0-9a-f]{32})',t).group(1)
hid=re.search(r'(HID[0-9A-F]{32})',t).group(1)
uids={m.group(1):m.group(2) for m in re.finditer(r'\\?"section\\?":\\?"(\w+)\\?",\\?"class\\?":\\?"[\w-]+\\?"(?:,\\?"RO\\?":\\?"\w+\\?")?,\\?"UID\\?":\\?"(SID\d+)',t)}
# the tab click's token, from its data-click in the section store
tt=t.replace('\\u003d','=').replace('\\u0027',"'")
m=re.search(r'"bf9d784e089c57beec877cbdf74910fa9764abd3_20":" data-click=\'(.*?)\' "',tt)
tab_tok=re.search(r'pzuiactionzzz=([A-Za-z0-9%*=_+/-]+)',m.group(1)).group(1)
print('tab token',tab_tok[:30],len(tab_tok))
H={'pzCTkn':csrf,'pzBFP':'{v2}288f37d7e5bece7d9d577d64d89da913'}
url=f'{base}?pzTransactionId={tx}&pzFromFrame=pyDisplayHarness&pzPrimaryPageName=pyDisplayHarness&AJAXTrackID=1&eventSrcSection=SoV-License-NGLP-Work-License.FindAProfessionalInput'
fields=[('$PpyDisplayHarness$pLookupNumber',''),('$PpyDisplayHarness$pFirstName',''),('$PpyDisplayHarness$pLastName',''),('$PpyDisplayHarness$pBusinessEntity$pTradeName',''),('$PpyDisplayHarness$pLicenseLookupVal',''),
('$PpyDisplayHarness$pProductIds',''),('$PpyDisplayHarness$pSetProfessionType',''),('pzuiactionzzz',urllib.parse.unquote(tab_tok)),
('SectionIDList','GID_1789945067818:GID_1789945067821:'),('PreActivitiesList',''),('ActivityParams','='),('PreActivityContextPageList','$NULL$'),('pzKeepPageMessages','false'),
('strPHarnessClass','SoV-License-NGLP-Work-License'),('strPHarnessPurpose','NGLPFindAProfessionalExternal'),('BaseReference',''),
('StreamList',f'FindAProfessionalWrapper|Rule-HTML-Section||||Y|{uids["FindAProfessionalWrapper"]}|:'),('bClientValidation','true'),('HeaderButtonSectionName','-1'),('ReadOnly','-1'),('PagesToRemove',''),('pzHarnessID',hid),('inStandardsMode','true'),('eventSrcSection','SoV-License-NGLP-Work-License.FindAProfessionalInput')]
r=post(url,fields,H)
print(len(r)); open('r0.html','w').write(r)
print('Roster' in r, 'PC038' in r, 'Behavior Analysts' in r)
import pickle; pickle.dump(dict(base=base,csrf=csrf,tx=tx,hid=hid,uids=uids,cookies=[(c.name,c.value) for c in jar]),open('sess.pkl','wb'))
