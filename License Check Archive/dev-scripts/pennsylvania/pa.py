import json, urllib.request
URL='https://www.pals.pa.gov/api/Search/SearchForPersonOrFacilty'
def page(n, prof=37, lic=180):
    body={"OptPersonFacility":"Person","ProfessionID":prof,"LicenseTypeId":lic,"State":"","Country":"ALL","County":None,"IsFacility":0,"PersonId":None,"PageNo":n}
    req=urllib.request.Request(URL,data=json.dumps(body).encode(),method='POST',headers={'Content-Type':'application/json;charset=UTF-8','Accept':'application/json, text/plain, */*','Origin':'https://www.pals.pa.gov','Referer':'https://www.pals.pa.gov/','User-Agent':'Mozilla/5.0'})
    with urllib.request.urlopen(req,timeout=60) as r: return json.loads(r.read())
if __name__=='__main__':
    for n in (1,2,3):
        try:
            d=page(n); print(n, type(d).__name__, len(d), d[0]['LicenseNumber'] if d else None, d[-1]['LicenseNumber'] if d else None, d[0].get('TotalRecords') if d else None, d[0].get('Row') if d else None)
        except Exception as e: print(n,'ERR',e)
