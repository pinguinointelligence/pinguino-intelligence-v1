import json, glob, math, os, statistics as st
from collections import defaultdict, Counter

BUNDLES = {
 'D3 Note10+ Chrome 2MP': 'bundle-samsung-chrome',
 'B10 Note10+ Chrome 1280': 'bundle-b10',
 'D1 iPhone Safari': 'bundle-iphone-safari',
 'D2 iPhone PWA': 'bundle-iphone-pwa',
 'I1 iPhone ChromeiOS': 'bundle-iphone',
 'R1 Realme Chrome': 'bundle-realme',
 'S0 Note10+ SamsungInternet': 'bundle-note10',
}
DIST = {'ean-12cm':12,'ean-18cm':18,'ean-25cm':25,'ean-30cm':30}
q=lambda a,p: (sorted(a)[min(len(a)-1,int(p*len(a)))] if a else None)
med=lambda a: (st.median(a) if a else None)
def gtin_ok(t):
    if not (len(t) in (8,12,13,14) and t.isdigit()): return False
    s=0;w=3
    for i in range(len(t)-2,-1,-1): s+=int(t[i])*w; w=1 if w==3 else 3
    return (10-s%10)%10==int(t[-1])

frames=[]  # per processed frame with candidate info
reads=[]   # per checksum-valid read
scene_rows=[]
for tag,d in BUNDLES.items():
    scenes=json.load(open(f'{d}/scenes.json')); run=json.load(open(f'{d}/manifest.json'))['run']
    declared=(scenes[0].get('declaredCode') or '').replace(' ','') or None
    for s in scenes:
        f=f"{d}/events/{s['sceneId']}{'#'+str(s['attempt']) if s['attempt']>1 else ''}.ndjson"
        if not os.path.exists(f): continue
        ev=[json.loads(l) for l in open(f)]
        if not ev: continue
        W=ev[0]['width']; H=ev[0]['height']
        # majority value for wrong-read labelling
        cnt=Counter()
        for e in ev:
            for dd in e['decodes']:
                for r in dd['results']:
                    if r['checksumValid']: cnt[r['text']]+=1
        legit=set()
        if s['sceneId']=='ean-two-codes': legit=set(t for t,_ in cnt.most_common(2))
        elif cnt: legit={cnt.most_common(1)[0][0]}
        if declared and s['sceneId'] in ('ean-12cm','ean-18cm','ean-25cm','ean-30cm','ean-approach-40cm','ean-enter-edge','ean-yaw-30','ean-yaw-60','ean-partial'): legit={declared}
        prev=None; first_hit=None
        widths=[]; mods=[]; laps=[]
        for i,e in enumerate(ev):
            c=(e.get('saliency') or {}).get('candidates') or []
            best=c[0] if c else None
            w=h=None; mod=None; cx=cy=None; ori=None; fill=None
            if best:
                p=best['quad']['points']; w=math.hypot(p[1]['x']-p[0]['x'],p[1]['y']-p[0]['y']); h=math.hypot(p[3]['x']-p[0]['x'],p[3]['y']-p[0]['y'])
                cx=sum(pt['x'] for pt in p)/4; cy=sum(pt['y'] for pt in p)/4; mod=best.get('moduleEstimatePx'); ori=best['orientationDeg']; fill=best['fillRatio']
            per={}
            anyvalid=False; anywrong=False; errgeom=0; any_lines=[]
            for dd in e['decodes']:
                ok=any(r['checksumValid'] for r in dd['results']); per[dd['variant']]=(ok, dd['durationMs'])
                errgeom+=dd['errorResultsWithGeometry']
                for r in dd['results']:
                    if r['checksumValid']:
                        anyvalid=True
                        wrong = (r['text'] not in legit) if legit else False
                        anywrong = anywrong or wrong
                        reads.append(dict(tag=tag, scene=s['sceneId'], variant=dd['variant'], line=r['lineCount'], wrong=wrong, mod=mod, w=w, plane=W))
            stab=None
            if best and prev and prev[0]:
                stab=abs(w-prev[0])/max(w,1) + math.hypot(cx-prev[1],cy-prev[2])/max(W,1)
            frames.append(dict(tag=tag, scene=s['sceneId'], dist=DIST.get(s['sceneId']), t=e['tCapture']-s['t0'], W=W, H=H, w=w, h=h, mod=mod, fill=fill, ori=ori, lap=e['quality']['laplacianVar'], mean=e['quality']['meanLuma'], clip=e['quality']['clippedHighRatio'], per=per, anyvalid=anyvalid, anywrong=anywrong, errgeom=errgeom, stab=stab, cand=bool(best)))
            if best: prev=(w,cx,cy); widths.append(w); laps.append(e['quality']['laplacianVar']);
            if best and mod: mods.append(mod)
            if anyvalid and first_hit is None: first_hit=e['tCapture']-s['t0']
        scene_rows.append(dict(tag=tag, scene=s['sceneId'], W=W, n=len(ev), w=med(widths), fill=(med(widths)/W if widths else None), mod=med(mods), lap=med(laps), first=first_hit, hits=sum(1 for e in ev if any(r['checksumValid'] for dd in e['decodes'] for r in dd['results']))))

out=[]
out.append("# Phase 0 corpus — correlations for the adaptive policy\n")
out.append(f"Frames with evidence: {len(frames)}; checksum-valid reads: {len(reads)}; bundles: {len(BUNDLES)}\n")

out.append("\n## 1. Candidate size vs distance (median over the scene, native analysis plane)\n")
out.append("| bundle | plane W | 12 cm w/fill/mod | 18 cm | 25 cm | 30 cm | first hit ms 12/18/25/30 |")
out.append("|---|---|---|---|---|---|---|")
for tag in BUNDLES:
    cells=[]; firsts=[]
    W=None
    for sid in ('ean-12cm','ean-18cm','ean-25cm','ean-30cm'):
        r=next((x for x in scene_rows if x['tag']==tag and x['scene']==sid), None)
        if r: W=r['W']; cells.append(f"{r['w']:.0f}px / {r['fill']:.2f} / {r['mod']}" if r['w'] else "no candidate"); firsts.append(f"{r['first']:.0f}" if r['first'] is not None else "—")
        else: cells.append("—"); firsts.append("—")
    out.append(f"| {tag} | {W} | " + " | ".join(cells) + " | " + "/".join(firsts) + " |")

out.append("\n## 2. Decode success by estimated module width (px on the analysis plane), all barcode scenes, frames with a candidate\n")
out.append("Success = at least one checksum-valid read by that variant in that frame. `any` = any variant.\n")
bins=[(0,1.5),(1.5,2),(2,2.5),(2.5,3),(3,4),(4,6),(6,99)]
out.append("| module px | frames | cheap | harder (when run) | roi | rectified (when run) | any | wrong-read frames |")
out.append("|---|---|---|---|---|---|---|---|")
for lo,hi in bins:
    fs=[f for f in frames if f['cand'] and f['mod'] is not None and lo<=f['mod']<hi and f['scene'].startswith('ean')]
    if not fs: continue
    def rate(v):
        r=[f['per'][v][0] for f in fs if v in f['per']]
        return f"{100*sum(r)/len(r):.0f}% (n={len(r)})" if r else "—"
    out.append(f"| {lo}–{hi if hi<99 else '∞'} | {len(fs)} | {rate('full_cheap')} | {rate('full_harder')} | {rate('roi_cheap')} | {rate('rectified_cheap')} | {100*sum(f['anyvalid'] for f in fs)/len(fs):.0f}% | {100*sum(f['anywrong'] for f in fs)/len(fs):.1f}% |")

out.append("\n## 3. Decode success by candidate width as a fraction of the plane width (fill)\n")
fbins=[(0,0.08),(0.08,0.12),(0.12,0.18),(0.18,0.25),(0.25,0.35),(0.35,0.5),(0.5,1.01)]
out.append("| fill | frames | cheap | harder | roi | any |")
out.append("|---|---|---|---|---|---|")
for lo,hi in fbins:
    fs=[f for f in frames if f['cand'] and f['fill'] is not None and lo<=f['fill']<hi and f['scene'].startswith('ean')]
    if not fs: continue
    def rate(v):
        r=[f['per'][v][0] for f in fs if v in f['per']]
        return f"{100*sum(r)/len(r):.0f}% (n={len(r)})" if r else "—"
    out.append(f"| {lo:.2f}–{hi:.2f} | {len(fs)} | {rate('full_cheap')} | {rate('full_harder')} | {rate('roi_cheap')} | {100*sum(f['anyvalid'] for f in fs)/len(fs):.0f}% |")

out.append("\n## 4. Sharpness (frame Laplacian variance, normalised by the bundle's median over candidate frames) vs success\n")
out.append("| relative sharpness | frames | any-variant success | note |")
out.append("|---|---|---|---|")
medlap={tag: med([f['lap'] for f in frames if f['tag']==tag and f['cand']]) for tag in BUNDLES}
rbins=[(0,0.25),(0.25,0.5),(0.5,0.75),(0.75,1.0),(1.0,1.5),(1.5,99)]
for lo,hi in rbins:
    fs=[f for f in frames if f['cand'] and f['scene'].startswith('ean') and medlap[f['tag']] and lo<=f['lap']/medlap[f['tag']]<hi]
    if not fs: continue
    out.append(f"| {lo}–{hi if hi<99 else '∞'} × median | {len(fs)} | {100*sum(f['anyvalid'] for f in fs)/len(fs):.0f}% | |")
out.append("\nPer-bundle: 12 cm scene Laplacian vs 25 cm scene Laplacian (focus-limit signature)\n")
out.append("| bundle | lap 12 cm | lap 25 cm | ratio | 12 cm hits |")
out.append("|---|---|---|---|---|")
for tag in BUNDLES:
    a=next((x for x in scene_rows if x['tag']==tag and x['scene']=='ean-12cm'),None); b=next((x for x in scene_rows if x['tag']==tag and x['scene']=='ean-25cm'),None)
    if a and b and a['lap'] and b['lap']: out.append(f"| {tag} | {a['lap']:.0f} | {b['lap']:.0f} | {a['lap']/b['lap']:.2f} | {a['hits']}/{a['n']} |")

out.append("\n## 5. Glare: clipped-highlight ratio vs success (glare scene only, all bundles)\n")
out.append("| clippedHighRatio | frames | any-variant success |")
out.append("|---|---|---|")
for lo,hi in [(0,0.005),(0.005,0.02),(0.02,0.05),(0.05,0.1),(0.1,1.01)]:
    fs=[f for f in frames if f['scene']=='ean-glare' and f['cand'] and lo<=f['clip']<hi]
    if fs: out.append(f"| {lo}–{hi} | {len(fs)} | {100*sum(f['anyvalid'] for f in fs)/len(fs):.0f}% |")

out.append("\n## 6. lineCount of checksum-valid reads: correct vs wrong (all bundles, scenes with a reference value)\n")
out.append("| lineCount | correct reads | wrong reads | P(wrong) |")
out.append("|---|---|---|---|")
for lc in range(1,11):
    c=sum(1 for r in reads if r['line']==lc and not r['wrong']); w=sum(1 for r in reads if r['line']==lc and r['wrong'])
    if c+w: out.append(f"| {lc}{'+' if lc==10 else ''} | {c} | {w} | {100*w/(c+w):.1f}% |")
c=sum(1 for r in reads if r['line']>=10 and not r['wrong']); w=sum(1 for r in reads if r['line']>=10 and r['wrong'])
out.append(f"| ≥10 | {c} | {w} | {100*w/max(1,c+w):.1f}% |")
out.append("\nWrong reads by variant: " + ", ".join(f"{v}: {sum(1 for r in reads if r['variant']==v and r['wrong'])}/{sum(1 for r in reads if r['variant']==v)}" for v in ('full_cheap','full_harder','roi_cheap','rectified_cheap')))
out.append("\nWrong reads by module bin: " + ", ".join(f"{lo}–{hi}: {sum(1 for r in reads if r['mod'] is not None and lo<=r['mod']<hi and r['wrong'])}/{sum(1 for r in reads if r['mod'] is not None and lo<=r['mod']<hi)}" for lo,hi in bins))

out.append("\n## 7. Candidate stability (frame-to-frame |Δwidth|/width + |Δcentre|/planeWidth) vs success, barcode scenes\n")
out.append("| stability score | frames | any-variant success |")
out.append("|---|---|---|")
for lo,hi in [(0,0.02),(0.02,0.05),(0.05,0.1),(0.1,0.2),(0.2,9)]:
    fs=[f for f in frames if f['stab'] is not None and f['scene'].startswith('ean') and lo<=f['stab']<hi]
    if fs: out.append(f"| {lo}–{hi if hi<9 else '∞'} | {len(fs)} | {100*sum(f['anyvalid'] for f in fs)/len(fs):.0f}% |")

out.append("\n## 8. Partial-decode evidence (zxing returnErrors with geometry) before the first hit\n")
pre=[];rest=[]
byscene=defaultdict(list)
for f in frames: byscene[(f['tag'],f['scene'])].append(f)
for key,fs in byscene.items():
    if not key[1].startswith('ean'): continue
    fs.sort(key=lambda x:x['t'])
    fh=next((i for i,f in enumerate(fs) if f['anyvalid']), None)
    if fh is None: continue
    pre+= [f['errgeom']>0 for f in fs[max(0,fh-5):fh]]
    rest+=[f['errgeom']>0 for f in fs[:max(0,fh-5)]]
out.append(f"frames with error-with-geometry: 5 frames before first hit {100*sum(pre)/max(1,len(pre)):.0f}% (n={len(pre)}) vs earlier frames {100*sum(rest)/max(1,len(rest)):.0f}% (n={len(rest)})")

out.append("\n## 9. Variant cost by plane (p50 ms, barcode scenes, pre-throttle = first 150 s of the run)\n")
out.append("| bundle | plane | saliency | cheap | harder | roi | rectified | main capture (from ticks, whole run) |")
out.append("|---|---|---|---|---|---|---|---|")
for tag,d in BUNDLES.items():
    fs=[f for f in frames if f['tag']==tag and f['scene'].startswith('ean')]
    scenes=json.load(open(f'{d}/scenes.json'))
    c2l=[t['captureToLumaMs'] for s in scenes for t in (s.get('frameTicks') or []) if t.get('processed') and t.get('captureToLumaMs') is not None]
    def cost(v):
        a=[f['per'][v][1] for f in fs if v in f['per']]; return f"{q(a,.5):.1f}" if a else "—"
    sal=[]
    for s in scenes:
        f=f"{d}/events/{s['sceneId']}{'#'+str(s['attempt']) if s['attempt']>1 else ''}.ndjson"
        if os.path.exists(f) and s['sceneId'].startswith('ean'):
            for l in open(f):
                e=json.loads(l)
                if e.get('saliency'): sal.append(e['saliency']['durationMs'])
    out.append(f"| {tag} | {fs[0]['W']}×{fs[0]['H']} | {q(sal,.5):.1f} | {cost('full_cheap')} | {cost('full_harder')} | {cost('roi_cheap')} | {cost('rectified_cheap')} | {q(c2l,.5):.1f} / {q(c2l,.95):.1f} |")

open('P1_corpus_analysis.md','w').write("\n".join(out)+"\n")
print("\n".join(out))
