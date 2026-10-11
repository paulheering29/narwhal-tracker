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

OB='$ODesktopWrapperInclude=&$ODeterminePortalTop=&$ODynamicLayout=&$ODynamicLayoutCell=&$OEvalDOMScripts_Include=&$OGridInc=&$OHarnessStaticJSEnd=&$OHarnessStaticJSStart=&$OHarnessStaticScriptsClientValidation=&$OMobileAppNotify=&$OPMCHarnessStaticScripts=&$ORepeatingDynamicLayout=&$OSessionUser=&$OSurveyStaticScripts=&$OWorkformStyles=&$OpxButton=&$OpxDisplayText=&$OpxDropdown=&$OpxHidden=&$OpxIcon=&$OpxLayoutContainer=&$OpxLayoutHeader=&$OpxLink=&$OpxMenu=&$OpxNonTemplate=&$OpxSection=&$OpxTextInput=&$OpxVisible=&$OpyWorkFormStandardEnd=&$OpyWorkFormStandardStart=&$OpzDecimalInclude=&$OpzHarnessInlineScriptsEnd=&$OpzHarnessInlineScriptsStart=&$OpzRuntimeToolsBar=&$Opzpega_ui_harnesscontext=&$Ordlincludes=&$Ouiautomationscripts=&$OpxCheckbox='
q=lambda v: urllib.parse.quote(v,safe='')
# the status checkbox's own change action: post the value, then refresh the input section (this is what makes the ticks count)
tt=r0.replace('\\u003d','=').replace('\\u0027',"'")
m=re.search(r'df39d2775190b7de7eeafe73bd9afa7179597900_5":" data-change=\'(.*?)\' "',tt)
refresh_tok=re.search(r'pzuiactionzzz=([A-Za-z0-9%*=_+/-]+)',m.group(1)).group(1)
print('refresh token',refresh_tok[:24],len(refresh_tok))
def raw(url,body): return post(url,body,H)
def chg(prop,value,token,baseref,tmpl):
    return raw(purl,f"{prop}={q(value)}&{OB}&pzuiactionzzz={token}=&pyPropertyTarget={q(prop)}&updateDOM=true&BaseReference={q(baseref)}&ContextPage=&pzKeepPageMessages=true&"+("UITemplatingStatus=Y&PVClientVal=true" if tmpl=='Y' else "PVClientVal=true&UITemplatingStatus=N")+f"&inStandardsMode=true&pzHarnessID={hid}")
lk='&'.join(q(k).replace('%24','$')+'=' for k,_ in lookup)
gbl='D_LicenseLookupResultsPpxResults1colWidthGBL=&D_LicenseLookupResultsPpxResults1colWidthGBR=&D_LicenseLookupResultsBusinessPpxResults1colWidthGBL=&D_LicenseLookupResultsBusinessPpxResults1colWidthGBR='
def tail(stream): return f"&PreActivityContextPageList=%24NULL%24&pzKeepPageMessages=false&strPHarnessClass=SoV-License-NGLP-Work-License&strPHarnessPurpose=NGLPFindAProfessionalExternal&BaseReference=&StreamList={q(stream)}&bClientValidation=true&HeaderButtonSectionName=-1&ReadOnly=-1&PagesToRemove=&pzHarnessID={hid}&inStandardsMode=true"
chg('$PpyDisplayHarness$pProductIds','PC038',tk['NGLPLicenseLookupInput'],'','Y')
for i in range(1,5):
    chg(f'$PpyDisplayHarness$pEligibleStatusforRoster$l{i}$pSelectStatus','true',tk['NGLPRosterDownloadStatusSelect'],f'pyDisplayHarness.EligibleStatusforRoster({i})','N')
    flags='&'.join(f'$PpyDisplayHarness$pEligibleStatusforRoster$l{j}$pSelectStatus={"true" if j<=i else "false"}' for j in range(1,5))
    raw(purl,f"{lk}&{flags}&{gbl}&$PpyDisplayHarness$pProductIds=PC038&$PpyDisplayHarness$pSetProfessionType=&pzuiactionzzz={refresh_tok}&SectionIDList=GID_1%3AGID_2%3A&PreActivitiesList=&ActivityParams=%3D&{OB}"+tail(f'FindAProfessionalInput|Rule-HTML-Section||||Y|{uid(t,"FindAProfessionalInput")}|:'))
chg('$PpyDisplayHarness$pSetProfessionType','NGLP146',tk['NGLPRosterDownload'],'','Y')
dl=click_token(r0,'9e2aa9891a699fbff4304b97cccda738ebb71a2a_42')
raw(purl,f"pzuiactionzzz={dl}&PreActivitiesList=&ActivityParams=%3D&{OB}"+tail('NGLPRosterDownloadResults|Rule-HTML-Section||||Y|SID1789946217864|:'))
gu=f'{base}?pyActivity=%40baseclass.pzProcessURLInWindow&pyPreActivity=NGLPGenerateRosterDownload&pzPrimaryPageName=pyDisplayHarness&target=popup&pzHarnessID={hid}'
r=op.open(urllib.request.Request(gu,headers={'User-Agent':UA,'Referer':HOST+'/'}),timeout=90); d=r.read()
print(r.status,len(d)); open('roster.xlsx','wb').write(d)
