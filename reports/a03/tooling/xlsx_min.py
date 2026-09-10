import zipfile, re, sys
from xml.etree import ElementTree as ET
NS='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
RNS='{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
class X:
    def __init__(self,f):
        self.z=zipfile.ZipFile(f); self.shared=[]
        if 'xl/sharedStrings.xml' in self.z.namelist():
            for si in ET.fromstring(self.z.read('xl/sharedStrings.xml')).findall(NS+'si'):
                self.shared.append(''.join(t.text or '' for t in si.iter(NS+'t')))
        rels={}
        for rel in ET.fromstring(self.z.read('xl/_rels/workbook.xml.rels')): rels[rel.get('Id')]=rel.get('Target')
        wb=ET.fromstring(self.z.read('xl/workbook.xml')); self.sheets={}
        self.order=[]
        for sh in wb.find(NS+'sheets'):
            base=rels[sh.get(RNS+'id')].split('/')[-1]
            m=[n for n in self.z.namelist() if n.endswith('/'+base) and 'worksheets' in n]
            self.sheets[sh.get('name')]=m[0] if m else None
            self.order.append(sh.get('name'))
    def rows(self,name,limit=None):
        root=ET.fromstring(self.z.read(self.sheets[name])); out=[]
        for row in root.iter(NS+'row'):
            d={}
            for c in row.findall(NS+'c'):
                col=re.match(r'([A-Z]+)',c.get('r')).group(1)
                t=c.get('t'); v=c.find(NS+'v'); isn=c.find(NS+'is')
                if t=='inlineStr' and isn is not None: val=''.join(x.text or '' for x in isn.iter(NS+'t'))
                elif v is None: val=''
                elif t=='s': val=self.shared[int(v.text)]
                else: val=v.text or ''
                if str(val).strip(): d[col]=str(val).strip()
            if d: out.append(d)
            if limit and len(out)>=limit: break
        return out
