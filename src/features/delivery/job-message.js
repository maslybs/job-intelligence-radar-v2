import {RADAR_SETTINGS} from "../../config/radar.generated.js";
// Compact, evidence-based Telegram HTML: one clearly labeled opportunity per message.
const clean=(s,n=240)=>{const v=String(s??"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();if(v.length<=n)return v;const a=v.slice(0,n-1),p=a.lastIndexOf(" ");return (p>n*.65?a.slice(0,p):a).trim()+"…";};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const row=(emoji,label,value,max=260)=>value?emoji+" <b>"+label+"</b> "+esc(clean(value,max)):"";
const section=(emoji,label,value,max)=>value?emoji+" <b>"+label+"</b>\n"+esc(clean(value,max)):"";
const upworkDetails=(s)=>{
 const head=String(s||"").split("<untrusted_participant_content>")[0];
 return {proposals:head.match(/Proposals:\s*(.*?)\.\s*Budget:/i)?.[1]||"",
 budget:head.match(/Budget:\s*(.*?)\.\s*Client spent:/i)?.[1]||"",
 spent:head.match(/Client spent:\s*(.*?)\.\s*Client freelancer/i)?.[1]||""};
};
export function renderJobTelegram(job,details={},brief={}){
 const source=String(job.source||"");
 const upwork=source.startsWith("Upwork"), reddit=source.startsWith("Reddit");
 const freelance=source.startsWith("Freelancehunt");
 const lane=["employment","agency","project"].includes(brief.track)?brief.track:"";
 const type=reddit?"🧩 REDDIT · ПОТЕНЦІЙНИЙ ЗАПИТ":lane==="agency"?"🟣 АГЕНТСТВО · КОНТРАКТ":(job.engagement==="fulltime"||lane==="employment")?"🔵 ДОВГОСТРОКОВА ВАКАНСІЯ":job.state==="filtered"?"🟡 ПЕРЕВІРИТИ":"🟢 ПРОЄКТ · ПРІОРИТЕТ";
 const d=upwork?upworkDetails(job.description):{};
 const desc=upwork?(String(job.description||"").split("<untrusted_participant_content>")[1]||"").split("</untrusted_participant_content>")[0]:String(job.description||"");
 const tasks=details.tasks_uk||brief.summary||desc;
 const requirements=details.requirements_uk||brief.stack;
 const fit=details.fit_uk||job.reason;
 const risks=details.risks_uk||brief.risks||"";
 const score=Number.isFinite(Number(job.score))?Math.max(0,Math.min(100,Math.round(Number(job.score)))):0;
 const clientCountry=upwork?String(job.company||"").replace(/^Upwork\s*[·\-]\s*/i,"").trim():"";
 const country=String(RADAR_SETTINGS.jobs.profile.country||"зазначеного регіону");
 const eligibility=job.geo==="restricted"?"⛔ Є географічне обмеження":job.geo==="allowed"?"✅ Доступність підтверджено: "+country:"⚠️ Перевірити географічну доступність: "+country;
 const date=new Date(job.published_at||"");
 const age=Number.isFinite(date.getTime())?Math.max(0,Math.round((Date.now()-date.getTime())/60000)):null;
 const when=age===null?"":age<120?age+" хв тому":Math.round(age/60)+" год тому";
 const offers=upwork?d.proposals:freelance?String(job.description||"").match(/Заявок:\s*(\d+)/i)?.[1]:"";
 const lines=[
 "<b>"+type+"</b>  ·  <b>"+score+"/100</b>",
 "<b>"+esc(clean(job.title,150))+"</b>",
 "📍 "+esc(clean(source,70))+(when?" · "+esc(when):""),
 "",
 section("🎯","Завдання",tasks,490),
 section("🛠","Вимоги",requirements,260),
 section("💡","Чим ти корисний",fit,250),
 details.outcome_uk?section("✅","Результат",details.outcome_uk,150):"",
 "",
 row("🌍","Географія:",eligibility,180),
 clientCountry?row("🏢","Клієнт із:",clientCountry,70):"",
 (d.budget||freelance)?row("💰","Бюджет:",d.budget||String(job.description||"").match(/Бюджет:\s*([^.]+)\./i)?.[1],100):"",
 offers?row("👥","Конкуренція:",(upwork?"Заявок: ":"Заявок: ")+offers+(upwork?" (діапазон, може швидко змінюватися)":""),120):"",
 d.spent?row("📊","Витрати клієнта:",d.spent,70):"",
 (details.conditions_uk||brief.conditions)?row("🕒","Умови:",details.conditions_uk||brief.conditions,170):"",
 brief.interview_risk&&brief.interview_risk!=="unknown"?row("🧪","Ризик відбору (оцінка):",({low:"низький",medium:"середній",high:"високий"})[brief.interview_risk],100):"",
 risks?section("⚠️","Ризики / уточнити",risks,230):"",
 "",
 '<a href="'+esc(job.url)+'">🔗 Відкрити оригінал ↗</a>'
 ];
 return lines.filter(Boolean).join("\n").replace(/\n{3,}/g,"\n\n").slice(0,3600);
}
