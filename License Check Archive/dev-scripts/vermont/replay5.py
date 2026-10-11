exec(open('replay2.py').read().split("r1=change(")[0])
r1=change('$PpyDisplayHarness$pProductIds','PC038',tk['NGLPRosterDownload'])

purl2=f'{base}?pzFromFrame=pyDisplayHarness&pzPrimaryPageName=pyDisplayHarness&AJAXTrackID=1'
rc=json.dumps({"cells":[{"pyPropertyTarget":"$PpyDisplayHarness$pSetProfessionType","StreamName":"NGLPRosterDownload","BaseReference":"","ContextPage":"","UITemplatingStatus":"Y","CellId":"4"}],"values":[{"entryHandle":"$PpyDisplayHarness$pSetProfessionType","value":""},{"entryHandle":"$PpyDisplayHarness$pProductIds","value":"PC038"}]},separators=(',',':'))
post(purl2,[('pyActivity','pzRunActionWrapper'),('PVClientVal','true'),('reloadCells',rc),('UITemplatingStatus','N'),('inStandardsMode','true'),('pzHarnessID',hid),('pzActivity','pzReloadCells'),('skipReturnResponse','true'),('pySubAction','runAct')],H)
for render,crit in (('EXPANDEDSubSectionLicenseLookupResultsBB~pzLayout_1','D_LicenseLookupResults_pxResults_LicenseLookupResults_1'),('EXPANDEDSubSectionLicenseLookupResultsBBBB~pzLayout_3','D_LicenseLookupResultsBusiness_pxResults_LicenseLookupResults_1')):
    ap=f'gridAction=REFRESHLIST&startIndex=1&pyPageSize=10&currentPageIndex=1&pyGridFilterCriteriaPage=pyFilterCriteria_{crit}&BaseReference=&isReportDef=false'
    g=post(purl2,[('pyActivity','ReloadSection'),('SectionIDList','GID_1789945078926:GID_1789945078929:'),('PreActivitiesList',''),('StreamName','LicenseLookupResults'),('RenderSingle',render),('StreamClass','Rule-HTML-Section'),('bClientValidation','true'),('PreActivity','pzdoGridAction'),('ActivityParams',ap),('BaseReference',''),('ReadOnly','0'),('Increment','true'),('UITemplatingStatus','N'),('inStandardsMode','true'),('pzHarnessID',hid),('PreDataTransform','')],H)
    print('grid refresh',len(g))
# statuses: all four ticked, one at a time, as the page does
for i in range(1,5):
    prop=f'$PpyDisplayHarness$pEligibleStatusforRoster$l{i}$pSelectStatus'
    f=[(prop,'true'),('pzuiactionzzz',tk['NGLPRosterDownloadStatusSelect']),('pyPropertyTarget',prop),('updateDOM','true'),('BaseReference',f'pyDisplayHarness.EligibleStatusforRoster({i})'),('ContextPage',''),('pzKeepPageMessages','true'),('PVClientVal','true'),('UITemplatingStatus','N'),('inStandardsMode','true'),('pzHarnessID',hid)]
    rs=post(purl,f,H); print('status',i,len(rs),re.sub(r'\s+',' ',rs)[-420:])
rt=change('$PpyDisplayHarness$pSetProfessionType','NGLP146',tk['NGLPRosterDownload'])
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
