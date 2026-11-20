import {RADAR_SETTINGS} from "../../config/radar.generated.js";
import {listingIsActionable} from "../discovery/source-accessibility.js";
// Reviewed DOU listings: independent from the verified P1/P2 channel.
// An older post is not described as newly published or guaranteed open.
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const trim=(s,n=170)=>{const t=String(s??"").replace(/\s+/g," ").trim();return t.length>n?t.slice(0,n-1)+"…":t};
export function selectDouCandidates(rows,limit=3){
 return (rows||[]).filter(x=>{
  if(!listingIsActionable(x)||x.alerted_at||x.kind!=="buyer"||x.geo==="restricted"||Number(x.score)<78)return false;
  if(!String(x.source||"").startsWith("DOU ·"))return false;
  if(!/^https:\/\/jobs\.dou\.ua\/companies\/[a-z0-9-]+\/vacancies\/\d+\//i.test(String(x.url||"")))return false;
  if(/(?:(?:united states|usa|canada|poland) only|relocation required|on-?site only)/i.test(String(x.region||"")+" "+String(x.description||"")))return false;
  return true;
 }).sort((a,b)=>Number(b.score)-Number(a.score)||String(b.discovered_at||"").localeCompare(String(a.discovered_at||""))).slice(0,limit);
}
export function renderDouCandidates(rows){
 return ["🎯 <b>DOU · можливості з високою відповідністю</b>",
 "<i>Це вакансії, які були доступні в публічному пошуку DOU під час браузерної перевірки. Не обов'язково нові: перевір дату й доступність заявки. Формат співпраці та географію уточнюй у роботодавця.</i>",
 ...rows.map((j,i)=>[
  "<b>"+(i+1)+". "+esc(trim(j.title,95))+"</b>",
  "AI-відповідність: "+Math.round(Number(j.score))+"/100",
  "Опубліковано: "+esc(j.published_at?String(j.published_at).slice(0,10):"дата не підтверджена"),
  "Географія: "+(j.geo==="allowed"?"попередньо підходить":"не підтверджена"),
  "Формат: "+(j.engagement==="fulltime"?"повна зайнятість (уточни, чи доступні 30 год/тиждень)":j.engagement==="contract"?"контракт":"потрібно уточнити"),
  "Оцінка: "+esc(trim(j.reason,190)),
  '<a href="'+esc(j.url)+'">Вакансія й спосіб відгуку</a>'
 ].join("\n"))].join("\n\n");
}
export async function runDouReview(env,{deliver,preview=false}={}){
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS dou_review_sent(job_id TEXT PRIMARY KEY,status TEXT NOT NULL,at TEXT NOT NULL)").run();
 const data=(await env.DB.prepare(
 "SELECT id,title,source,url,published_at,discovered_at,score,kind,geo,engagement,region,description,reason,alerted_at "+
 "FROM jobs j WHERE source LIKE 'DOU ·%' AND state IN ('unread','filtered') AND kind='buyer' "+
 "AND score>=78 AND geo!='restricted' AND alerted_at IS NULL "+
 "AND (julianday(published_at)>=julianday('now','-35 days') OR (j.source='DOU · Browser' AND j.published_at IS NULL)) "+
 "AND julianday(discovered_at)>=julianday('now','-3 days') "+
 "AND NOT EXISTS (SELECT 1 FROM dou_review_sent d WHERE d.job_id=j.id) "+
 "ORDER BY score DESC,discovered_at DESC LIMIT 18").all()).results||[];
 const eligible=selectDouCandidates(data);
 if(!eligible.length)return {state:"no_reviewable_jobs",considered:data.length};
 const day=new Intl.DateTimeFormat("en-CA",{timeZone:RADAR_SETTINGS.notifications.timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 const prior=(await env.DB.prepare("SELECT COUNT(*) n FROM dou_review_sent WHERE status='sent' AND at LIKE ?").bind(day+"%").first())?.n||0;
 const chosen=eligible.slice(0,Math.min(3,Math.max(0,6-Number(prior))));
 if(!chosen.length)return {state:"daily_limit",sent:prior};
 let message=renderDouCandidates(chosen);
 while(message.length>3900&&chosen.length>1){chosen.pop();message=renderDouCandidates(chosen)}
 if(preview)return {state:"preview",chosen:chosen.map(x=>({title:x.title,score:x.score,url:x.url})),message};
 if(typeof deliver!=="function")throw Error("missing Telegram delivery");
 const reservations=await Promise.all(chosen.map(x=>env.DB.prepare(
  "INSERT OR IGNORE INTO dou_review_sent(job_id,status,at) VALUES(?,'reserved',?)"
 ).bind(x.id,new Date().toISOString()).run()));
 const ready=chosen.filter((x,i)=>reservations[i]?.meta?.changes);
 if(!ready.length)return {state:"already_reserved"};
 const outbound=renderDouCandidates(ready);
 try{
  const result=await deliver(outbound);
  const now=new Date().toISOString();
  await env.DB.batch([
    ...ready.map(x=>env.DB.prepare(
      "UPDATE dou_review_sent SET status='sent',at=? WHERE job_id=?"
    ).bind(now,x.id)),
    ...ready.map(x=>env.DB.prepare(
      "UPDATE jobs SET alerted_at=? WHERE id=? AND alerted_at IS NULL"
    ).bind(now,x.id))
  ]);
  return {state:"sent",count:ready.length,message_id:result?.message_id||null};
 }catch(e){
  await env.DB.batch(ready.map(x=>env.DB.prepare(
   "UPDATE dou_review_sent SET status='uncertain' WHERE job_id=?"
  ).bind(x.id))).catch(()=>{});
  return {state:"uncertain",reason:String(e?.message||e).slice(0,130)};
 }
}