import {RADAR_SETTINGS} from "../../config/radar.generated.js";
// Small, separate manual-action digest for boards where a user can contact
// the original poster without buying job-board bidding credits.
const configuredSources=(settings=RADAR_SETTINGS)=>new Map((settings.jobs.directContactSources||[]).map(x=>[x.name,new Set(x.allowedHosts.map(h=>h.toLowerCase()))]));
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const short=(v,n=180)=>{const s=String(v??"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();return s.length<=n?s:s.slice(0,n-1).trimEnd()+"…"};
const restricted=/\b(?:us only|usa only|canada only|taipei|must reside|must be based|in.office required|onsite required|relocation required|work authorization in (?:taiwan|the us))\b/i;
export function selectDirectContactJobs(rows,limit=3,settings=RADAR_SETTINGS){
 const approved=configuredSources(settings);
 const seen=new Set(),out=[];
 const sorted=(rows||[]).filter(x=>{
  if(!approved.has(String(x.source))||x.kind!=="buyer"||
     x.geo==="restricted"||Number(x.score)<50||
     !["unread","filtered"].includes(x.state)||x.alerted_at)return false;
  if(restricted.test(String(x.title)+" "+String(x.region)+" "+String(x.description)))return false;
  try{const u=new URL(String(x.url||""));return u.protocol==="https:"&&approved.get(String(x.source))?.has(u.hostname.toLowerCase());
  }catch{return false}
 }).sort((a,b)=>Number(b.score)-Number(a.score)||
   String(b.discovered_at||"").localeCompare(String(a.discovered_at||"")));
 for(const x of sorted){
  if(out.length>=limit)break;
  if(seen.has(x.url))continue;
  seen.add(x.url);out.push(x);
 }
 return out;
}
export function renderDirectContactJobs(rows,day){
 return ["📨 <b>Radar · прямі контакти без платного тарифу</b>",
   esc(day)+" · "+rows.length+" кандидатів для ручного відгуку",
   "<i>Доступ до оголошення вільний. Географію, актуальність, конкуренцію та спосіб оплати перевір перед зверненням. Це не гарантія найму.</i>",
   ...rows.map((x,i)=>[
     "<b>"+(i+1)+". "+esc(short(x.title,100))+"</b>",
     "🔧 "+esc(short(x.description,200)),
     "🎯 AI відповідність: "+Math.round(Number(x.score))+"/100",
     "🌍 Географія: "+(x.geo==="allowed"?"попередньо дозволено":"не підтверджена")+
       " · Формат: "+esc(x.engagement||"невідомий"),
     "⚠️ "+esc(short(x.reason||"Перевір вимоги до досвіду й терміни.",160)),
     '<a href="'+esc(x.url)+'">Відкрити вакансію і спосіб контакту</a>'
   ].join("\n"))].join("\n\n");
}
export async function runDirectContactDigest(env,{day,preview=false,deliver}={}){
 if(!RADAR_SETTINGS.jobs.enabled)return {state:"jobs_disabled"};
 const sourceNames=[...configuredSources().keys()];
 if(!sourceNames.length)return {state:"no_direct_contact_sources"};
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(day||"")))throw Error("invalid_day");
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS direct_contact_digest_slots(slot TEXT PRIMARY KEY,state TEXT NOT NULL,ids TEXT NOT NULL,at TEXT NOT NULL,sent_at TEXT,error TEXT)").run();
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS direct_contact_sent(job_id TEXT PRIMARY KEY,at TEXT NOT NULL)").run();
 const slot="daily_"+day;
 if(!preview){
  const existing=await env.DB.prepare("SELECT state FROM direct_contact_digest_slots WHERE slot=?").bind(slot).first();
  if(existing)return {state:"already_processed",previous:existing.state};
 }
 const items=(await env.DB.prepare(
  "SELECT id,title,url,source,description,region,kind,geo,state,priority,score,engagement,reason,discovered_at,alerted_at "+
  "FROM jobs WHERE source IN ("+sourceNames.map(()=>"?").join(",")+") "+
  "AND state IN ('unread','filtered') AND kind='buyer' AND score>=50 AND geo!='restricted' "+
  "AND alerted_at IS NULL AND julianday(published_at)>=julianday('now','-15 days') "+
  "AND NOT EXISTS(SELECT 1 FROM direct_contact_sent d WHERE d.job_id=jobs.id) "+
  "ORDER BY score DESC,discovered_at DESC LIMIT 35"
 ).bind(...sourceNames).all()).results||[];
 const chosen=selectDirectContactJobs(items);
 if(!chosen.length)return {state:"no_contactable_candidates",reviewed:items.length};
 let msg=renderDirectContactJobs(chosen,day);
 while(msg.length>3850&&chosen.length>1){chosen.pop();msg=renderDirectContactJobs(chosen,day)}
 if(preview)return {state:"preview",candidates:items.length,chosen:chosen.map(x=>({title:x.title,source:x.source,score:x.score,url:x.url})),message:msg};
 if(typeof deliver!=="function")throw Error("missing_delivery");
 const claim=await env.DB.prepare("INSERT OR IGNORE INTO direct_contact_digest_slots(slot,state,ids,at) VALUES(?,?,?,?)")
   .bind(slot,"reserved",JSON.stringify(chosen.map(x=>x.id)),new Date().toISOString()).run();
 if(!claim.meta?.changes)return {state:"already_processed"};
 try{
  await deliver(msg);
  const now=new Date().toISOString();
  await env.DB.batch([
   env.DB.prepare("UPDATE direct_contact_digest_slots SET state='sent',sent_at=? WHERE slot=?").bind(now,slot),
   ...chosen.map(x=>env.DB.prepare("INSERT OR IGNORE INTO direct_contact_sent(job_id,at) VALUES(?,?)").bind(x.id,now))
  ]);
  return {state:"sent",count:chosen.length,ids:chosen.map(x=>x.id)};
 }catch(e){
  await env.DB.prepare("UPDATE direct_contact_digest_slots SET state='uncertain',error=? WHERE slot=?")
    .bind(String(e?.message||e).slice(0,150),slot).run().catch(()=>{});
  return {state:"uncertain",error:String(e?.message||e).slice(0,150)};
 }
}
