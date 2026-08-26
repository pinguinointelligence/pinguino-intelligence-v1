import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { AppShell } from '@/features/shell/AppShell';
import { Button } from '@/components/ui/Button';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { StatusChip } from '@/components/shared/StatusChip';
import { cn } from '@/lib/cn';
import { AdminCatalogSection } from '@/features/admin/AdminCatalogSection';
import { AdminCommunitySection } from '@/features/admin/AdminCommunitySection';
import { AdminInvitesSection } from '@/features/admin/AdminInvitesSection';
import { AdminPartnersSection } from '@/features/admin/AdminPartnersSection';
import { AdminUsersSection } from '@/features/admin/AdminUsersSection';
import {
  adminProductRequestAction,
  approveProductRequest,
  getAdminDirectory,
  getAdminCatalog,
  getAdminOverview,
  getAdminOperations,
  getSignedRequestEvidence,
  listAdminProductRequests,
  type AdminProductRequest,
  type ProductRequestStatus,
} from '@/services/adminControl';

const NAV = [
  ['overview','OVERVIEW'],['product-requests','PRODUCT REQUESTS'],['catalog','CATALOG & COUNTRIES'],
  ['users','USERS'],['revenue','SUBSCRIPTIONS & REVENUE'],['partners','PARTNERS'],
  ['community','COMMUNITY & CONTENT'],['operations','OPERATIONS'],['audit','AUDIT LOG'],
  ['settings','ADMIN SETTINGS'],
] as const;
type Section = typeof NAV[number][0];
const validSection = (value: string | undefined): Section =>
  NAV.some(([id]) => id === value) ? value as Section : 'overview';

const table = 'w-full min-w-[760px] border-collapse text-left text-xs';
const th = 'border-b border-ink/15 px-3 py-3 font-semibold uppercase tracking-[0.1em] text-stone-500';
const td = 'border-b border-ink/8 px-3 py-3 align-top text-stone-700';

export function AdminWorkspacePage() {
  const { section } = useParams();
  const active = validSection(section);
  return (
    <AppShell maxWidthClass="max-w-[1600px]">
      <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="border-b border-ink/10 bg-[#f3ede3] px-4 py-5 lg:min-h-[calc(100vh-64px)] lg:border-r lg:border-b-0">
          <SectionLabel>Gellatti Operations</SectionLabel>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500">STAGING · CONTROLLED</p>
          <nav className="mt-6 grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1" aria-label="Admin">
            {NAV.map(([id,label]) => <Link key={id} to={`/admin/${id}`} className={cn(
              'min-h-10 border-l px-3 py-2.5 text-[11px] font-semibold tracking-[0.08em] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40',
              active===id?'border-ink bg-white text-ink':'border-transparent text-stone-600 hover:border-ink/25 hover:bg-white/60',
            )}>{label}</Link>)}
          </nav>
        </aside>
        <main className="min-w-0 bg-white px-5 py-7 sm:px-8 lg:px-10">
          <AdminSection section={active} />
        </main>
      </div>
    </AppShell>
  );
}

function AdminSection({ section }: { section: Section }) {
  if (section==='overview') return <Overview />;
  if (section==='product-requests') return <ProductRequests />;
  if (section==='users') return <AdminUsersSection />;
  if (section==='revenue') return <Directory section="FINANCE" />;
  if (section==='partners') return <AdminPartnersSection />;
  if (section==='community') return <AdminCommunitySection />;
  if (section==='audit') return <Directory section="AUDIT" />;
  if (section==='catalog') return <AdminCatalogSection />;
  if (section==='operations') return <Operations />;
  return <AdminSettings />;
}

function Heading({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return <header className="border-b border-ink/10 pb-6"><SectionLabel>{eyebrow}</SectionLabel><h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-ink">{title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">{detail}</p></header>;
}

function Overview() {
  const query=useQuery({queryKey:['admin-overview'],queryFn:getAdminOverview,refetchInterval:30000});
  const data=query.data;
  const metrics=data ? [
    ['Nowi użytkownicy · dziś / 7d / 30d',`${data.users.today} / ${data.users.days7} / ${data.users.days30}`],['Aktywne subskrypcje',data.subscriptions.active],
    ['Nowe płatne / renewals',`${data.subscriptions.newPaid} / ${data.subscriptions.renewals}`],['Failed / cancellations',`${data.subscriptions.failedPayments} / ${data.subscriptions.cancellations}`],
    ['Refunds',data.subscriptions.refunds],['Gross / net revenue',`${(data.subscriptions.grossRevenueCents/100).toFixed(2)} € / ${((data.subscriptions.grossRevenueCents-data.subscriptions.refundCents)/100).toFixed(2)} €`],
    ['Zgłoszenia · czekają na Admina',data.productRequests.waitingAdmin],['Zgłoszenia · czekają na użytkownika',data.productRequests.waitingUser],
    ['Aktywni Partnerzy',data.partners.active],['Oczekujące wypłaty',data.partners.pendingPayouts],
    ['Błędy webhook płatności',data.operations.failedStripeWebhooks],['Otwarte raporty treści',data.operations.openCommunityReports],
  ] as const : [];
  return <><Heading eyebrow="Overview" title="Stan operacyjny" detail="Rzeczy wymagające decyzji, pieniądze i awarie — bez dekoracyjnych wskaźników." />
    {query.isError?<ErrorBox message="Nie udało się odczytać stanu operacyjnego."/>:null}
    <dl className="mt-7 grid border-t border-l border-ink/10 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label,n])=><div key={label} className="border-r border-b border-ink/10 p-5"><dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">{label}</dt><dd className="mt-3 font-mono text-3xl tabular-nums text-ink">{n}</dd></div>)}</dl>
    {data?<div className="mt-8 grid gap-7 xl:grid-cols-2"><OperationalList title="Kolejka" rows={[["Otwarte zgłoszenia",data.productRequests.open],["Najstarsze",data.productRequests.oldest?new Date(data.productRequests.oldest).toLocaleString('pl-PL'):'—'],["Aktywne importy",data.operations.activeImports],["Nieudane importy",data.operations.failedImports]]}/><OperationalList title="Incydenty" rows={data.knownIncidents.map((x)=>[String(x.provider),`${String(x.code)} · core: ${x.coreWorkflowBlocked?'BLOCKED':'OK'}`])}/></div>:null}
  </>;
}

function OperationalList({title,rows}:{title:string;rows:readonly (readonly [string,unknown])[]}) { return <section><h2 className="text-sm font-semibold text-ink">{title}</h2><dl className="mt-3 divide-y divide-ink/10 border-y border-ink/10">{rows.map(([a,b])=><div key={a} className="flex items-center justify-between gap-4 py-3 text-sm"><dt className="text-stone-500">{a}</dt><dd className="font-mono text-right text-ink">{String(b)}</dd></div>)}</dl></section>; }

const REQUEST_TABS: readonly (readonly [ProductRequestStatus|'ALL',string])[]=[['SUBMITTED','NEW'],['ADMIN_REVIEW','IN REVIEW'],['NEEDS_INFO','WAITING FOR USER'],['RESUBMITTED','RESUBMITTED'],['APPROVED','APPROVED'],['REJECTED','REJECTED'],['DUPLICATE','DUPLICATE'],['USER_CANCELED','CANCELED'],['ALL','ALL']];
function ProductRequests() {
  const [status,setStatus]=useState<ProductRequestStatus|'ALL'>(()=>new URLSearchParams(window.location.search).has('request')?'ALL':'SUBMITTED');
  const [filter,setFilter]=useState({text:'',market:'',missing:'',source:'',minAgeDays:''});
  const location=useLocation(); const navigate=useNavigate();
  const selectedId=new URLSearchParams(location.search).get('request');
  const query=useQuery({queryKey:['admin-product-requests',status],queryFn:()=>listAdminProductRequests(status)});
  const selected=query.data?.find((r)=>r.id===selectedId)??null;
  const filtered=useMemo(()=>(query.data??[]).filter((request)=>{
    const haystack=`${request.requesterEmail} ${request.name??''} ${request.brand??''} ${request.ean??''} ${request.assignedAdminUserId??''}`.toLowerCase();
    const ageDays=((query.dataUpdatedAt||Date.parse(request.updatedAt))-Date.parse(request.submittedAt))/86400000;
    return (!filter.text||haystack.includes(filter.text.toLowerCase()))
      &&(!filter.market||request.marketCountryCode===filter.market.toUpperCase())
      &&(!filter.missing||request.missingFields.some((item)=>String(item.fieldType)===filter.missing&&String(item.status)==='REQUESTED'))
      &&(!filter.source||String(request.scannerProvenance.source??'SCANNER').toUpperCase().includes(filter.source.toUpperCase()))
      &&(!filter.minAgeDays||ageDays>=Number(filter.minAgeDays));
  }),[filter,query.data,query.dataUpdatedAt]);
  if(selected) return <RequestDetail request={selected} onClose={()=>navigate(`/admin/product-requests`)} />;
  return <><Heading eyebrow="Catalog intake" title="Product Requests" detail="Zgłoszenie jest dowodem do weryfikacji. Nie istnieje w Pickerze ani Engine przed zatwierdzeniem."/>
    <div className="mt-5 flex gap-1 overflow-x-auto border-b border-ink/10 pb-3">{REQUEST_TABS.map(([tab,label])=><button key={tab} onClick={()=>setStatus(tab)} className={cn('min-h-10 shrink-0 px-3 text-[10px] font-semibold tracking-[0.1em]',status===tab?'bg-ink text-white':'border border-ink/10 text-stone-600')}>{label}</button>)}</div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5"><input aria-label="User brand EAN filter" placeholder="User / brand / EAN" value={filter.text} onChange={(e)=>setFilter({...filter,text:e.currentTarget.value})} className="min-h-10 border border-ink/15 px-3 text-xs"/><input aria-label="Market country filter" placeholder="Market ISO" value={filter.market} onChange={(e)=>setFilter({...filter,market:e.currentTarget.value})} className="min-h-10 border border-ink/15 px-3 text-xs uppercase"/><select aria-label="Missing field filter" value={filter.missing} onChange={(e)=>setFilter({...filter,missing:e.currentTarget.value})} className="min-h-10 border border-ink/15 px-3 text-xs"><option value="">All missing types</option>{MISSING.map((item)=><option key={item}>{item}</option>)}</select><input aria-label="Request source filter" placeholder="Source" value={filter.source} onChange={(e)=>setFilter({...filter,source:e.currentTarget.value})} className="min-h-10 border border-ink/15 px-3 text-xs"/><input aria-label="Minimum age days" type="number" min="0" placeholder="Min age days" value={filter.minAgeDays} onChange={(e)=>setFilter({...filter,minAgeDays:e.currentTarget.value})} className="min-h-10 border border-ink/15 px-3 text-xs"/></div>
    <div className="mt-4 overflow-x-auto"><table className={table}><thead><tr><th className={th}>ID / AGE</th><th className={th}>PRODUCT</th><th className={th}>USER</th><th className={th}>MARKET</th><th className={th}>STATUS</th><th className={th}>NEXT</th></tr></thead><tbody>{filtered.map((r)=><tr key={r.id}><td className={td}><span className="font-mono">#{r.requestNumber}</span><br/><span className="text-stone-400">{new Date(r.submittedAt).toLocaleDateString('pl-PL')} · {Math.floor(((query.dataUpdatedAt||Date.parse(r.updatedAt))-Date.parse(r.submittedAt))/86400000)}d</span></td><td className={td}><strong className="text-ink">{r.name??'Nazwa nieustalona'}</strong><br/>{r.brand??'—'} · {r.ean??'brak EAN'}</td><td className={td}>{r.requesterEmail}<br/><span className="font-mono text-[10px] text-stone-400">assigned {r.assignedAdminUserId??'—'}</span></td><td className={td}>{r.marketCountryCode??'—'}<br/><span className="text-stone-400">origin {r.countryOfOrigin??'—'}</span></td><td className={td}><StatusChip status={statusTone(r.status)}>{r.status}</StatusChip></td><td className={td}><button className="min-h-10 border border-ink/15 px-3 font-semibold text-ink" onClick={()=>navigate(`/admin/product-requests?request=${r.id}`)}>Otwórz →</button></td></tr>)}</tbody></table></div>
    {query.isError?<ErrorBox message="Nie udało się odczytać kolejki."/>:null}</>;
}

const MISSING=['FRONT_PHOTO','BARCODE_OR_EAN','PRODUCT_NAME','BRAND','VARIANT','NET_QUANTITY','INGREDIENTS','NUTRITION_TABLE','ALLERGEN_INFORMATION','MANUFACTURER','COUNTRY_OF_ORIGIN','MARKET_AVAILABILITY','PROFESSIONAL_DOSAGE','USAGE_INSTRUCTIONS','TECHNICAL_DOCUMENT','OTHER'] as const;
function RequestDetail({request,onClose}:{request:AdminProductRequest;onClose:()=>void}) {
  const qc=useQueryClient(); const [missing,setMissing]=useState<string[]>([]); const [note,setNote]=useState(''); const [duplicateId,setDuplicateId]=useState(''); const [error,setError]=useState<string|null>(null); const [approval,setApproval]=useState<Record<string,unknown>|null>(null); const [verifiedPatch,setVerifiedPatch]=useState('{\n  "manufacturer": ""\n}');
  const refresh=async()=>{await qc.invalidateQueries({queryKey:['admin-product-requests']});};
  const action=useMutation({mutationFn:async(kind:'START_REVIEW'|'REQUEST_INFO'|'REJECT'|'DUPLICATE')=>{setError(null);if(kind==='START_REVIEW')return adminProductRequestAction(request.id,kind);if(kind==='REQUEST_INFO')return adminProductRequestAction(request.id,kind,{missingFields:missing,reason:note});if(kind==='REJECT')return adminProductRequestAction(request.id,kind,{reason:note});return adminProductRequestAction(request.id,kind,{productId:duplicateId,reason:note});},onSuccess:refresh,onError:(e)=>setError(e instanceof Error?e.message:'Operacja nie powiodła się.')});
  const evidencePatch=useMutation({mutationFn:()=>{let patch:Record<string,unknown>;try{patch=JSON.parse(verifiedPatch) as Record<string,unknown>;}catch{throw new Error('Patch musi być poprawnym JSON-em.');}return adminProductRequestAction(request.id,'ADMIN_EVIDENCE_PATCH',{patch,reason:note});},onSuccess:refresh,onError:(e)=>setError(e instanceof Error?e.message:'Nie zapisano dowodu.')});
  const approve=useMutation({mutationFn:()=>approveProductRequest(request),onSuccess:async(result)=>{setApproval(result);await refresh();},onError:(e)=>setError(e instanceof Error?e.message:'Zatwierdzenie nie powiodło się.')});
  return <><button onClick={onClose} className="min-h-10 text-xs font-semibold text-stone-600">← Wróć do kolejki</button><Heading eyebrow={`Request #${request.requestNumber}`} title={request.name??'Produkt bez ustalonej nazwy'} detail={`${request.brand??'Bez marki'} · ${request.ean??'brak EAN'} · rynek ${request.marketCountryCode??'nieustalony'}`}/>
    <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1fr)_360px]"><div className="space-y-7"><EvidencePanel request={request}/><CatalogCandidates request={request}/><DataPanel title="Dane wyekstrahowane" data={request.extractedData}/><DataPanel title="Korekty użytkownika — dowód, nie autorytet" data={request.userCorrections}/><DataPanel title="Zweryfikowane poprawki Admina — wersjonowany dowód" data={request.adminVerifiedData??{}}/><section className="border-y border-ink/10 py-5"><h2 className="text-sm font-semibold text-ink">Final approval preview</h2><p className="mt-2 text-xs leading-5 text-stone-600">Canonical submit ponownie obliczy Product Accuracy, ProductBehavior i role readiness. Jeżeli 85+/gotowa rola nie są potwierdzone, żaden PR nie powstanie.</p><pre className="mt-3 max-h-80 overflow-auto bg-stone-50 p-4 text-[10px]">{JSON.stringify({identity:{ean:request.adminVerifiedData?.ean??request.userCorrections.ean??request.ean,name:request.adminVerifiedData?.productName??request.userCorrections.productName??request.name,brand:request.adminVerifiedData?.brand??request.userCorrections.brand??request.brand,variant:request.variant,netQuantity:request.netQuantity},markets:[request.marketCountryCode],countryOfOrigin:request.countryOfOrigin,evidenceCount:request.evidence.length,missingFields:request.missingFields.filter((field)=>field.status==='REQUESTED')},null,2)}</pre></section><History events={request.events}/></div><aside className="space-y-6"><section className="border border-ink/12 bg-[#f3ede3] p-5"><SectionLabel>Missing information</SectionLabel><div className="mt-4 grid gap-2">{MISSING.map((field)=><label key={field} className="flex min-h-9 items-center gap-3 text-xs"><input type="checkbox" checked={missing.includes(field)} onChange={(e)=>setMissing((x)=>e.currentTarget.checked?[...x,field]:x.filter((v)=>v!==field))}/><span>{field}</span></label>)}</div><label className="mt-4 block text-xs font-semibold">Dodatkowa informacja<textarea value={note} onChange={(e)=>setNote(e.target.value)} rows={4} className="mt-2 w-full border border-ink/15 bg-white p-3 font-normal"/></label><p className="mt-3 text-xs leading-5 text-stone-600">Produkt zostanie dodany wyłącznie wtedy, gdy będziemy mogli jednoznacznie ustalić jego tożsamość i potwierdzić dane wymagane przez Gellatti.</p><Button className="mt-4 w-full" disabled={action.isPending} onClick={()=>action.mutate('REQUEST_INFO')}>Wyślij prośbę do użytkownika</Button></section><section className="border border-ink/12 p-5"><SectionLabel>Versioned evidence edit</SectionLabel><textarea aria-label="Admin verified evidence JSON" value={verifiedPatch} onChange={(event)=>setVerifiedPatch(event.currentTarget.value)} rows={7} className="mt-4 w-full border border-ink/15 bg-stone-50 p-3 font-mono text-[10px]"/><Button variant="ghost" className="mt-3 w-full" onClick={()=>evidencePatch.mutate()}>Dodaj jako audytowany dowód</Button></section>
      <section className="border border-ink/12 p-5"><SectionLabel>Decision</SectionLabel><div className="mt-4 grid gap-2"><Button variant="ghost" onClick={()=>action.mutate('START_REVIEW')}>Rozpocznij review</Button><Button onClick={()=>approve.mutate()} disabled={approve.isPending}>Zatwierdź przez canonical PR</Button><Button variant="ghost" onClick={()=>action.mutate('REJECT')}>Odrzuć z powodem</Button></div><label className="mt-4 block text-xs font-semibold">Exact duplicate product UUID<input value={duplicateId} onChange={(e)=>setDuplicateId(e.target.value)} className="mt-2 min-h-10 w-full border border-ink/15 px-3 font-mono font-normal"/></label><Button variant="ghost" className="mt-2 w-full" onClick={()=>action.mutate('DUPLICATE')}>Oznacz exact duplicate</Button>{error?<ErrorBox message={error}/>:null}{approval?.kind==='approval_not_ready'?<div className="mt-4 border border-amber-300 bg-amber-50 p-3 text-xs"><strong>Nie utworzono PR.</strong><pre className="mt-2 whitespace-pre-wrap">{JSON.stringify(approval,null,2)}</pre></div>:null}</section></aside></div></>;
}

function CatalogCandidates({request}:{request:AdminProductRequest}) { const key=request.ean??request.name??'';const query=useQuery({queryKey:['admin-request-candidates',request.id,key],queryFn:()=>getAdminCatalog(key),enabled:Boolean(key)});return <section><h2 className="text-sm font-semibold text-ink">Exact catalog matches / possible duplicates</h2><div className="mt-3 divide-y divide-ink/10 border-y border-ink/10">{(query.data??[]).slice(0,8).map((candidate)=><article key={candidate.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto]"><div><strong className="text-xs text-ink">{candidate.articleId} · {candidate.name}</strong><p className="mt-1 text-[10px] text-stone-500">{candidate.brand??'—'} · EAN {candidate.ean??'—'} · {candidate.verificationStatus}</p></div><span className="font-mono text-[10px] text-stone-400">{candidate.id}</span></article>)}{(query.data?.length??0)===0?<p className="py-4 text-xs text-stone-500">Brak exact kandydata w zatwierdzonym katalogu.</p>:null}</div></section>;}

function EvidencePanel({request}:{request:AdminProductRequest}) { const signed=useQuery({queryKey:['admin-request-evidence',request.id],queryFn:()=>getSignedRequestEvidence(request.id),staleTime:240000});const evidence=signed.data?.evidence??request.evidence;return <section><h2 className="text-sm font-semibold text-ink">Dowody ({evidence.length})</h2><p className="mt-1 text-xs text-stone-500">Prywatne pliki używają pięciominutowych podpisanych URL-i. Link nie jest publiczny.</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{evidence.length?evidence.map((e)=><article key={String(e.id)} className="border border-ink/10 p-4">{typeof e.signedUrl==='string'&&String(e.mime_type??e.mimeType).startsWith('image/')?<img src={e.signedUrl} alt={String(e.evidence_kind??e.kind??'Product evidence')} className="mb-3 aspect-[4/3] w-full object-contain bg-stone-50"/>:null}<strong className="text-xs text-ink">{String(e.evidence_kind??e.kind)}</strong><p className="mt-2 break-all font-mono text-[10px] text-stone-500">{String(e.storage_path??e.storagePath??e.source_url??e.sourceUrl??'evidence payload')}</p><p className="mt-2 text-xs text-stone-500">{String(e.mime_type??e.mimeType??'')} · {String(e.byte_size??e.byteSize??'')}</p>{typeof e.signedUrl==='string'?<a href={e.signedUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-semibold underline">Otwórz bezpieczny dowód</a>:null}</article>):<p className="text-sm text-stone-500">Brak plików; dostępny jest raw Scanner result i historia ekstrakcji.</p>}</div>{signed.isError?<ErrorBox message="Nie udało się podpisać prywatnych dowodów."/>:null}</section>; }
function DataPanel({title,data}:{title:string;data:Record<string,unknown>}) { return <details className="border-y border-ink/10 py-4"><summary className="cursor-pointer text-sm font-semibold text-ink">{title}</summary><pre className="mt-4 max-h-96 overflow-auto bg-stone-50 p-4 text-[11px] leading-5">{JSON.stringify(data,null,2)}</pre></details>; }
function History({events}:{events:Array<Record<string,unknown>>}) { return <section><h2 className="text-sm font-semibold text-ink">Pełna historia</h2><ol className="mt-3 border-l border-ink/20 pl-5">{events.map((e)=><li key={String(e.id)} className="relative pb-5 text-xs"><span className="absolute -left-[23px] top-1 size-1.5 rounded-full bg-ink"/><strong>{String(e.eventType)}</strong><span className="ml-2 text-stone-500">{new Date(String(e.createdAt)).toLocaleString('pl-PL')}</span><pre className="mt-2 whitespace-pre-wrap text-[10px] text-stone-500">{JSON.stringify(e.data)}</pre></li>)}</ol></section>; }

function Directory({section}:{section:'USERS'|'FINANCE'|'COMMUNITY'|'AUDIT'}) { const query=useQuery({queryKey:['admin-directory',section],queryFn:()=>getAdminDirectory(section)}); return <><Heading eyebrow="Authority projection" title={NAV.find(([id])=>({USERS:'users',FINANCE:'revenue',COMMUNITY:'community',AUDIT:'audit'}[section]===id))?.[1]??section} detail="Bezpieczna projekcja serwerowa. Prywatne receptury, karty, hasła i sekrety nie są częścią odpowiedzi."/><GenericTable rows={query.data??[]}/>{query.isError?<ErrorBox message="Brak uprawnienia lub odczyt nie powiódł się."/>:null}</>; }
function GenericTable({rows}:{rows:Array<Record<string,unknown>>}) { const keys=useMemo(()=>[...new Set(rows.flatMap((r)=>Object.keys(r)))].slice(0,8),[rows]); return <div className="mt-6 overflow-x-auto"><table className={table}><thead><tr>{keys.map((k)=><th key={k} className={th}>{k}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={String(r.id??i)}>{keys.map((k)=><td key={k} className={td}>{typeof r[k]==='object'?<pre className="max-h-28 max-w-xs overflow-auto whitespace-pre-wrap text-[10px]">{JSON.stringify(r[k])}</pre>:String(r[k]??'—')}</td>)}</tr>)}</tbody></table>{rows.length===0?<p className="py-8 text-sm text-stone-500">Brak rekordów.</p>:null}</div>; }

function Operations(){const q=useQuery({queryKey:['admin-operations'],queryFn:getAdminOperations,refetchInterval:15000});const frontendCommit=String(import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA??import.meta.env.VITE_GIT_COMMIT_SHA??'unavailable');return <><Heading eyebrow="Operations" title="Queues & failures" detail="Import, Scanner, płatności i awarie dostawców. Żadnych wartości sekretów."/>{q.data?<div className="mt-7 space-y-8"><OperationalList title="Deployment identity" rows={[["Environment",q.data.environment],["Backend project",q.data.backendProjectRef],["Frontend commit",frontendCommit],["Notification delivery",q.data.notificationDeliveryInstrumentation]]}/><OperationRecords title="Scanner failures" rows={q.data.scannerFailures}/><OperationRecords title="INTIMPORT / rollback" rows={q.data.imports}/><OperationRecords title="Payment webhook failures" rows={q.data.stripeFailures}/><OperationRecords title="API / background / notification failures" rows={[...q.data.providerFailures,...q.data.notificationDeliveryFailures]}/><OperationalList title="External incidents" rows={q.data.knownIncidents.map((x)=>[String(x.provider),`${String(x.code)} · ${String(x.scope)}`])}/></div>:null}{q.isError?<ErrorBox message="Nie udało się odczytać operacyjnych kolejek."/>:null}</>}
function OperationRecords({title,rows}:{title:string;rows:Array<Record<string,unknown>>}){return <section><h2 className="text-sm font-semibold text-ink">{title}</h2>{rows.length?<GenericTable rows={rows}/>:<p className="mt-3 border-y border-ink/10 py-4 text-xs text-stone-500">Brak rekordów w trwałym ledgerze.</p>}</section>}
function AdminSettings(){return <><Heading eyebrow="Admin settings" title="Preferences & security" detail="Dźwięk sprzedaży wymaga jawnej interakcji przeglądarki. Role pozostają serwerowe."/><p className="mt-7 text-sm text-stone-600">Ustawienie dźwięku i trwałe centrum powiadomień są dostępne w nagłówku Admin. Ważne zdarzenia nie istnieją wyłącznie jako toast.</p><AdminInvitesSection/></>}
function ErrorBox({message}:{message:string}){return <p role="alert" className="mt-4 border border-red-300 bg-red-50 p-3 text-xs text-red-800">{message}</p>}
function statusTone(status:string):'ideal'|'risky'|'needs_correction'|'good'{if(status==='APPROVED')return'ideal';if(['REJECTED','USER_CANCELED'].includes(status))return'risky';if(['NEEDS_INFO','RESUBMITTED'].includes(status))return'needs_correction';return'good'}
