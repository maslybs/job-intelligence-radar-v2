// Telegram radarTelegramStatus; moved without editing the function body.
import {getMeta,putMeta} from "../../platform/meta.js";
import {aiBudgetState} from "../../platform/ai-budget.js";
import { esc, iso, kyivDay, text } from "../../platform/runtime-utils.js";
import { redditLearningSnapshot } from "../../features/reddit/reddit-adaptive.js";
import {ensureProspectTable,prospectStats,assessExistingRedditProspects,getProspectsForReview,markProspectsNotified} from "../../features/prospects/prospect-intelligence.js";
import {RADAR_SETTINGS} from "../../config/radar.generated.js";
import { COMMUNITY_FEEDS, communityScan } from "../../features/discovery/community-leads.js";
import {MODEL,DAILY_AI_LIMIT,TGT} from "../../config/constants.js";

export async function radarTelegramStatus(env) {
  const [lastRun,report,delivery,budget,counts,learning,prospects,prospectAlerts,redditCooldown,recentComments]=await Promise.all([
    env.DB.prepare("SELECT started_at,source_count,fetched,inserted,assessed,kept FROM runs ORDER BY id DESC LIMIT 1").first(),
    getMeta(env,"reddit_mcp_last_report"),
    getMeta(env,"telegram_last_success"),
    aiBudgetState(env),
    env.DB.prepare("SELECT SUM(CASE WHEN state='queued' THEN 1 ELSE 0 END) queued, SUM(CASE WHEN state='unread' AND alerted_at IS NULL AND priority IN ('P1','P2') THEN 1 ELSE 0 END) unalerted FROM jobs").first(),
    redditLearningSnapshot(env).catch(()=>null),
    prospectStats(env).catch(()=>null),
    getMeta(env,"reddit_prospect_alerts_"+kyivDay()),
    getMeta(env,"reddit_mcp_pause_until"),
    getMeta(env,"reddit_last_comment_review")
  ]);
  const decode=x=>{try{return JSON.parse(x||"null")}catch{return null}};
  const reddit=decode(report),tgLast=decode(delivery);
  const f=x=>x?String(x).replace("T"," ").slice(0,16)+" UTC":"немає";
  const rstats=reddit?.pages?.map(x=>(x.source+": "+(x.postLinks??"?")+" постів / "+(x.qualified??0)+" кандидатів")).join("; ");
  return [
    "Job Intelligence Radar — стан",
    "Cron: щогодини; Reddit: "+(env.REDDIT_MCP_ENABLED==="1"?"увімкнено":"вимкнено"),
    "Основний збір: "+f(lastRun?.started_at),
    "Джерела перевірено: "+(lastRun?.source_count??"?")+
      " | нових: "+(lastRun?.inserted??"?")+" | AI-оцінено: "+(lastRun?.assessed??"?"),
    "Reddit: "+(reddit?.state||"даних немає")+", сторінок: "+(reddit?.checked??0)+
      ", кандидатів: "+(reddit?.candidates??0)+", нових: "+(reddit?.inserted??0)+
      ", помилок: "+(reddit?.errors??0),
    Number(redditCooldown)>Date.now()?"Reddit пауза до "+new Date(Number(redditCooldown)).toLocaleString("uk-UA",{timeZone:RADAR_SETTINGS.notifications.timezone,day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})+" (Київ)":"",
    recentComments?(()=>{
      try{const x=JSON.parse(recentComments);return "Остання перевірка коментарів: "+
        x.status+"; конкуренція "+x.competition+"; видимих пропозицій "+
        (x.offer_count??"невідомо")+"; "+String(x.title||"").slice(0,75)}
      catch{return "Дані коментарів Reddit недоступні"}
    })():"",
    rstats?"Деталі Reddit: "+rstats:"",
    learning?"Reddit навчання: "+learning.targets+" гіпотез, "+learning.tested+
      " перевірено, "+learning.untested+" ще не тестували, "+learning.unique+" нових постів":"",
    learning?.leaders?.length?"Найкраще: "+learning.leaders.slice(0,3).map(x=>x.term+
      " ("+x.qualified+" P1/P2)").join("; "):"",
    prospects?"Проблемні ліди: "+(prospects.reviewed||0)+" розглянуто, "+
      (prospects.viable||0)+" перспективних, "+(prospects.alerted||0)+" повідомлено":"",
    "Форуми Cloudflare: "+COMMUNITY_FEEDS.length+" RSS/Atom, /sources — перелік",
    "Перевірені ліди відправляються автоматично кожні 10 хвилин (без денного ліміту).",
    "AI-оцінювання: "+budget.used+"/"+budget.limit+" (клієнтські ліди: "+budget.prospectUsed+"/"+budget.prospectLimit+")",
    "Потенційних клієнтів надіслано сьогодні: "+(Number(prospectAlerts)||0)+" (без денного ліміту)",
    "У черзі: "+(counts?.queued??0)+", P1/P2 без сповіщення: "+(counts?.unalerted??0),
    "Остання доставка TG: "+f(tgLast?.at),
    "Команди: /scan /reddit /demand /status /prospects /opportunities /sources"
  ].filter(Boolean).join("\n").slice(0,3700);
}
