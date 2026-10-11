exec(open('replay5.py').read().split("tk=sec_tokens(r0)")[0])
import html as H2
def pv_token(text, name, nth=-1):
    """the postvalue token of the nearest wrapper before the field called `name`"""
    idx=[m.start() for m in re.finditer(re.escape(name)+r"['\"]", text)]
    idx=[i for i in idx if 'name=' in text[max(0,i-8):i]]
    i=idx[nth]
    prev=[m for m in re.finditer(r'data-postvalue-url="([^"]+)"',text[:i])]
    return urllib.parse.unquote(H2.unescape(prev[-1].group(1)).replace('pzuiactionzzz=','',1)).rstrip('=') if prev else None
for name in ['$PpyDisplayHarness$pProductIds','$PpyDisplayHarness$pSetProfessionType','$PpyDisplayHarness$pEligibleStatusforRoster$l1$pSelectStatus']:
    idx=[m.start() for m in re.finditer(re.escape(name)+r"['\"]", r0)]
    print(name[-30:], len(idx), [ (pv_token(r0,name,k) or '')[-14:] for k in range(len(idx))])
print('postvalue attrs in r0:', [m.group(1)[-24:] for m in re.finditer(r'data-postvalue-url="([^"]+)"',r0)])
