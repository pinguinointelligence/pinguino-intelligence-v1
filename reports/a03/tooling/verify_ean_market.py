#!/usr/bin/env python3
"""Deterministic EAN x market page verifier (A04 rules, stdlib only).
usage: verify_ean_market.py URL EAN ISO2 [--agent NAME] [--slot ROLE] [--shipping-url URL]
EAN '-' = page facts only (title, page market, stabilizer signals, ingredients, technical-doc links).
Owner rules D-29..D-31: CONFIRMED_LOCAL needs (A) exact product identity and (B) market binding. On a single page:
identity = the exact EAN as a data token on a DIRECT (manufacturer/retailer) page — not inside a URL, not a search echo,
not glued into a retailer code; binding = country domain, country path, locale subdomain, one seller addressCountry, or an
owner-approved host declaration. Currency is reported as a supporting signal only and NEVER binds (D-31); a generic
.com needs an explicit US signal to bind to the US (D-30). Identity from ANOTHER authoritative page plus an attribute
match to the local listing is checked by identity_match.py. Prints one JSON object and stores it in $GELLATTI_EVIDENCE_DIR/verify/ (default ~/.cache/gellatti-evidence)."""
import sys, os, re, json, hashlib, subprocess, shutil, time, argparse
from urllib.parse import urlparse, urljoin
BASE=os.path.dirname(os.path.abspath(__file__))
WORK=os.environ.get('GELLATTI_EVIDENCE_DIR',os.path.join(os.path.expanduser('~'),'.cache','gellatti-evidence'))
CACHE=os.path.join(WORK,'vcache')+'/'; OUT=os.path.join(WORK,'verify')+'/'
os.makedirs(CACHE,exist_ok=True); os.makedirs(OUT,exist_ok=True)
C75=json.load(open(os.path.join(BASE,'countries75.json'))); M75=set(C75)
_HD=os.path.join(BASE,'host_market_declarations.json')
HOSTDECL=json.load(open(_HD)) if os.path.exists(_HD) else {}
# Egress country of the machine running the checks: its currency is never used to attribute a page (a shop may
# geo-convert prices). Set GELLATTI_EGRESS_CC (e.g. ES); check with: curl -s https://www.cloudflare.com/cdn-cgi/trace
EGRESS=os.environ.get('GELLATTI_EGRESS_CC','').upper()
BINDING={'CCTLD','PATH_LOCALE','SUBDOMAIN_LOCALE','ADDRESS_COUNTRY','HOST_DECLARATION'}   # D-29 B; currency never binds (D-31)
GENERIC={'com','net','org','shop','store','co','io','eu','info','biz','me','tv','ai','app','online','global','asia','link','market','coop'}
LANG={'en','fr','de','es','it','pt','nl','pl','sv','da','nb','no','fi','cs','sk','hu','ro','bg','hr','sl','el','et','lv','lt','tr','ar','he','ja','ko','zh','th','vi','id','ms'}
A3={'USA':'US','GBR':'GB','DEU':'DE','FRA':'FR','ESP':'ES','ITA':'IT','NLD':'NL','BEL':'BE','AUT':'AT','CHE':'CH','PRT':'PT','POL':'PL','IRL':'IE','SWE':'SE','NOR':'NO','DNK':'DK','FIN':'FI','AUS':'AU','NZL':'NZ','CAN':'CA'}
CUR_MARKET={'AED':'AE','ARS':'AR','AUD':'AU','BDT':'BD','BGN':'BG','BHD':'BH','BRL':'BR','CAD':'CA','CHF':'CH','CLP':'CL','CNY':'CN','COP':'CO','CRC':'CR','CZK':'CZ','DKK':'DK','DOP':'DO','DZD':'DZ','EGP':'EG','GBP':'GB','GHS':'GH','HKD':'HK','HUF':'HU','IDR':'ID','ILS':'IL','INR':'IN','ISK':'IS','JPY':'JP','KES':'KE','KRW':'KR','KWD':'KW','LKR':'LK','MAD':'MA','MXN':'MX','MYR':'MY','NGN':'NG','NOK':'NO','NZD':'NZ','OMR':'OM','PHP':'PH','PKR':'PK','PLN':'PL','QAR':'QA','RON':'RO','SAR':'SA','SEK':'SE','SGD':'SG','THB':'TH','TND':'TN','TRY':'TR','TWD':'TW','UYU':'UY','VND':'VN','ZAR':'ZA'}
AGGREGATOR=('openfoodfacts.','barcodelookup','upcitemdb','go-upc','ean-search','eandata','buycott','chompthis','cijene.hr','supercompare','pricerunner','idealo','ceneo','heureka','arukereso','kelkoo','pricespy','prisjakt','google.','chp.co.il','zap.co.il','skroutz.','bestprice.gr','compari.ro','pazaruvaj.','shopmania.','kieskeurig.','tweakers.net','glami.')
REGISTRY=('matinfo.no','dabas.com','validoo.','synkka.','gs1.','foodrepo.')   # national/industry product registers: identity yes, market binding not by themselves
MARKETPLACE=('amazon.','ebay.','allegro.','trendyol.','hktvmall.','noon.com','jumia.','lazada.','shopee.','tokopedia.','coupang.','rakuten.','mercadolibre.','mercadolivre.','aliexpress.','etsy.','wolt.com','hungerstation.','talabat.','glovoapp.','walmart.com/ip/seller','temu.','shein.')
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'
SIGNALS={'TARA':r'\btara\b|\bE\s?417\b|tarakernmehl|semi di tara|gomma di tara|goma (de )?tara|gomme (de )?tara|guma tara',
 'GUAR':r'\bguar\b|\bE\s?412\b|guarkernmehl|gomma di guar|goma guar|gomme (de )?guar|guma guar|guarkärn|guarkerne',
 'LBG':r'locust bean|carob (bean )?gum|\bE\s?410\b|johannisbrotkernmehl|caroube|carrub|garrof[ií]n|algarrobo|świętojańskiego|johannesbr[øö]d|johanneksenleip|alfarroba|sint-jansbrood',
 'XANTHAN':r'xanthan|\bE\s?415\b|ksantan|xantano|xanthane','CARRAGEENAN':r'carrag|\bE\s?407\b|karagen','PECTIN':r'pe[ck]tin|pectina|pectine|\bE\s?440\b',
 'GELATIN':r'gelatin|gélatine|gelatina|želatin|żelatyn','BLEND':r'stabili[sz]er|stabilisateur|stabilisator|stabilizzante|estabilizante|stabilizator|neutro\b|ice cream base|base per gelato|eisbindemittel|bindemittel|ijsbase'}
ING=['Ingredients','Ingredient list','Zutaten','Ingrédients','Ingredienti','Ingredientes','Ingrediënten','Składniki','Ingredienser','Ainesosat','Sastojci','Sestavine','Zloženie','Složení','Összetevők','Ingrediente','Koostisosad','Sastāvdaļas','Sudėtis','Innihald','Συστατικά','Съставки','İçindekiler','المكونات','原材料','成分','원재료','ส่วนประกอบ','Thành phần','Komposisi','Bahan-bahan','Sangkap','רכיבים']
DOCRX=re.compile(r'\.pdf(\?|#|$)|datasheet|data-sheet|/tds|scheda[-_ ]?tecnica|fiche[-_ ]?technique|datenblatt|spec(ification)?[-_ ]?sheet|ficha[-_ ]?t[eé]cnica|karta[-_ ]?techniczna|productspecificatie',re.I)
def curl(u,fn,doh=True):
    cmd=['curl','-sL','--compressed','-m','30','-A',UA,'-H','Accept-Language: en-US,en;q=0.8','-H','Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8','-o',fn,'-w','%{http_code}\t%{url_effective}\t%{content_type}']
    if doh: cmd+=['--doh-url','https://cloudflare-dns.com/dns-query']
    try: o=subprocess.run(cmd+[u],capture_output=True,text=True,timeout=45).stdout
    except Exception: o='ERR\t\t'
    p=(o.split('\t')+['','',''])[:3]; return p[0],p[1] or u,p[2]
def fetch(u):
    fn=CACHE+hashlib.sha1(u.encode()).hexdigest()[:16]
    code,eff,ct=curl(u,fn,True)
    if code in('000','ERR',''): code,eff,ct=curl(u,fn,False)
    raw=open(fn,'rb').read() if os.path.exists(fn) else b''
    if raw[:4]==b'%PDF' and shutil.which('pdftotext'):
        txt=subprocess.run(['pdftotext','-q',fn,'-'],capture_output=True,text=True,timeout=60).stdout
    else: txt=raw.decode('utf-8','ignore')
    return code,eff,ct,txt,hashlib.sha256(raw).hexdigest(),len(raw)
def currencies(h):
    c=set(re.findall(r'"priceCurrency"\s*:\s*"([A-Z]{3})"',h))
    c|=set(re.findall(r'(?:og|product):price:currency"\s+content="([A-Z]{3})"',h))
    c|=set(re.findall(r'content="([A-Z]{3})"\s+(?:property|name)="(?:og|product):price:currency"',h))
    for cur,rate in re.findall(r'Shopify\.currency\s*=\s*\{\s*"active"\s*:\s*"([A-Z]{3})"\s*,\s*"rate"\s*:\s*"([\d.]+)"',h):
        c.add(cur if float(rate)==1.0 else 'CONVERTED:'+cur)
    return c
def page_market(eff,h):
    p=urlparse(eff); host=(p.hostname or '').lower(); lab=host.split('.'); last=lab[-1]
    if last=='uk': return 'GB','CCTLD'
    if last not in GENERIC and len(last)==2: return last.upper(),'CCTLD'
    segs=[s for s in p.path.split('/') if s]
    if segs:
        s0=segs[0]; m=re.fullmatch(r'([a-z]{2})[-_]([A-Za-z]{2})',s0)
        if m and m.group(2).upper() in M75 and m.group(1) in LANG: return m.group(2).upper(),'PATH_LOCALE'
        m=re.fullmatch(r'([A-Za-z]{2})[-_]([a-z]{2})',s0)
        if m and m.group(1).lower() not in LANG and m.group(1).upper() in M75 and m.group(2) in LANG: return m.group(1).upper(),'PATH_LOCALE'
        if re.fullmatch(r'[A-Z]{2}',s0) and s0 in M75: return s0,'PATH_LOCALE'
        if len(segs)>1 and re.fullmatch(r'[a-z]{2}',s0) and s0 not in LANG and s0.upper() in M75 and segs[1].lower() in LANG: return s0.upper(),'PATH_LOCALE'
    if len(lab)>2 and (lab[0]=='uk' or (len(lab[0])==2 and lab[0] not in LANG and lab[0].upper() in M75)):
        return ('GB' if lab[0]=='uk' else lab[0].upper()),'SUBDOMAIN_LOCALE'
    if h:
        ac={A3.get(x.upper(),x.upper()) for x in re.findall(r'"addressCountry"\s*:\s*"([A-Za-z]{2,3})"',h)}&M75
        if len(ac)==1: return ac.pop(),'ADDRESS_COUNTRY'
        cur=currencies(h)
        if not any(x.startswith('CONVERTED') for x in cur):
            cm={CUR_MARKET[x] for x in cur if x in CUR_MARKET and CUR_MARKET[x]!=EGRESS}
            if len(cm)==1: return cm.pop(),'CURRENCY_ONLY'
    base=host[4:] if host.startswith('www.') else host
    if base in HOSTDECL: return HOSTDECL[base]['market'],'HOST_DECLARATION'
    return None,'GENERIC_TLD'
def source_type(url):
    s=url.lower()
    if any(a in s for a in AGGREGATOR): return 'AGGREGATOR'
    if any(g in s for g in REGISTRY): return 'PRODUCT_REGISTER'
    if any(m in s for m in MARKETPLACE): return 'MARKETPLACE'
    return 'DIRECT'
def variants(e):
    v={e}
    if len(e)==12: v|={'0'+e,'00'+e}
    if len(e)==13: v.add('0'+e)
    if len(e)==13 and e.startswith('0'): v.add(e[1:])
    if len(e)==14 and e.startswith('0'): v.add(e[1:])
    if len(e)==8: v.add('000000'+e)
    return v
BND=set(' "\'<>\n\t\r,;:()[]{}\\')
def hits(h,e):
    n=echo=emb=0; ctx=''
    for m in re.finditer(r'(?<!\d)('+'|'.join(sorted(variants(e),key=len,reverse=True))+r')(?!\d)',h):
        L=m.start()
        while L>0 and h[L-1] not in BND: L-=1
        R=m.end()
        while R<len(h) and h[R] not in BND: R+=1
        if re.search(r'[/?=&%]',h[L:R]) or re.search(r'(query|search|searchTerm|term|q)"?\s*[:=]\s*"?$',h[max(0,m.start()-30):m.start()]): echo+=1; continue
        if h[L:R]!=m.group(1): emb+=1; continue
        n+=1
        if not ctx: ctx=re.sub(r'\s+',' ',h[max(0,m.start()-80):m.end()+25])[:140]
    return n,echo,emb,ctx
def visible(h):
    t=re.sub(r'(?is)<(script|style|noscript)[^>]*>.*?</\1>',' ',h); t=re.sub(r'(?s)<[^>]+>',' ',t)
    t=re.sub(r'&nbsp;|&#160;',' ',t); return re.sub(r'\s+',' ',t)
def facts(h,eff):
    v=visible(h); lv=v.lower()
    sig={k:len(re.findall(rx,v,re.I)) for k,rx in SIGNALS.items()}
    ing=''
    for mkr in ING:
        i=lv.find(mkr.lower())
        if i>=0: ing=v[i:i+260]; break
    jl=re.findall(r'"ingredients"\s*:\s*"([^"]{5,400})"',h)
    nut=bool(re.search(r'NutritionInformation|"nutrition"\s*:',h)) or bool(re.search(r'\b\d+[.,]?\d*\s?(kcal|kJ)\b',v))
    docs=[]
    for href in re.findall(r'href=["\']([^"\'#]+)["\']',h):
        if DOCRX.search(href):
            a=urljoin(eff,href)
            if a not in docs: docs.append(a)
        if len(docs)>=6: break
    t=re.search(r'(?is)<title[^>]*>(.*?)</title>',h)
    return dict(title=re.sub(r'\s+',' ',t.group(1)).strip()[:120] if t else '',signals={k:x for k,x in sig.items() if x},
                ingredients_snippet=(jl[0] if jl else ing)[:260],nutrition_marker=nut,technical_doc_links=docs)
def main():
    ap=argparse.ArgumentParser(); ap.add_argument('url'); ap.add_argument('ean'); ap.add_argument('iso2')
    ap.add_argument('--agent',default=''); ap.add_argument('--slot',default=''); ap.add_argument('--shipping-url',default='')
    a=ap.parse_args(); iso=a.iso2.upper(); e=re.sub(r'\D','',a.ean) if a.ean!='-' else ''
    code,eff,ct,h,sha,size=fetch(a.url)
    mk,how=page_market(eff,h); src=source_type(eff)
    r=dict(url=a.url,final_url=eff,http=code,content_type=ct[:40],bytes=size,sha256=sha[:20],market=iso,ean=e,page_market=mk or '',
           market_by=how,source_type=src,agent=a.agent,slot=a.slot,checked_utc=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()))
    ok=code=='200' and size>2000
    r.update(facts(h,eff) if ok else dict(title='',signals={},ingredients_snippet='',nutrition_marker=False,technical_doc_links=[]))
    r['currencies']=sorted(currencies(h)) if ok else []
    if not e: vc='PAGE_FACTS_ONLY' if ok else 'SOURCE_NOT_READABLE'
    elif not ok: vc='SOURCE_NOT_READABLE'
    else:
        n,echo,emb,ctx=hits(h,e); r.update(clean_hits=n,echo_hits=echo,embedded_hits=emb,ean_context=ctx)
        if n>0:
            if src=='AGGREGATOR': vc='EAN_ON_AGGREGATOR'
            elif src=='PRODUCT_REGISTER': vc='EAN_ON_PRODUCT_REGISTER'
            elif mk==iso and how in BINDING: vc='EAN_ON_MARKET_PAGE' if src=='DIRECT' else 'EAN_ON_MARKETPLACE_MARKET_PAGE'
            elif mk==iso and how=='CURRENCY_ONLY': vc='EAN_ON_PAGE_BOUND_ONLY_BY_CURRENCY'
            elif mk is None: vc='EAN_ON_GENERIC_TLD_PAGE'
            else: vc='EAN_ON_FOREIGN_MARKET_PAGE'
        elif echo: vc='EAN_ONLY_ECHOED_FROM_URL_OR_QUERY'
        elif emb: vc='EAN_EMBEDDED_IN_RETAILER_CODE'
        elif mk==iso and how in BINDING: vc='MARKET_PAGE_WITHOUT_EAN'
        else: vc='PAGE_WITHOUT_EAN'
    r['verification_class']=vc; r['evidence_class']='CONFIRMED' if vc=='EAN_ON_MARKET_PAGE' else ('PAGE_FACTS' if vc=='PAGE_FACTS_ONLY' else 'LEAD')
    bound=bool(ok) and mk==iso and how in BINDING
    ident=bool(e) and bool(ok) and r.get('clean_hits',0)>0 and src in ('DIRECT','PRODUCT_REGISTER')
    r.update(market_binding_signal=(how if mk==iso else ('NONE' if mk is None else 'OTHER_MARKET:'+mk)), market_binding_confirmed=bound,
             identifier_confirmed=ident, exact_product_identity_confirmed=ident, local_availability_confirmed=ident and bound and src=='DIRECT',
             identity_basis=('GTIN_ON_THIS_PAGE' if ident else 'NOT_PROVEN_ON_THIS_PAGE (identity_match.py: GTIN on another source + attribute match)'))
    r['needs_browser']=code in('403','429','503','000','ERR') or (code=='200' and size<=2000)
    if a.shipping_url:
        sc,seff,_,sh,_,ssz=fetch(a.shipping_url); sv=visible(sh) if sc=='200' else ''
        names=[x for x in (C75.get(iso,{}).get('en',''),) if x]
        found=''
        for nm in names:
            i=sv.lower().find(nm.lower())
            if i>=0: found=sv[max(0,i-90):i+len(nm)+60]; break
        r.update(shipping_url=a.shipping_url,shipping_http=sc,shipping_mentions_market=bool(found),shipping_context=found[:170],
                 shipping_same_host=(urlparse(seff).hostname or '').replace('www.','')==(urlparse(eff).hostname or '').replace('www.',''))
        r['cross_border_candidate']=bool(e) and r.get('clean_hits',0)>0 and src=='DIRECT' and bool(found) and r['shipping_same_host']
    key=hashlib.sha1(f"{a.url}|{e}|{iso}|{a.slot}".encode()).hexdigest()[:16]
    json.dump(r,open(OUT+key+'.json','w'),ensure_ascii=False)
    print(json.dumps(r,ensure_ascii=False))
if __name__=='__main__': main()
