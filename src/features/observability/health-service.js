// Hourly health, stale pipelines and critical notifications.
// Extracted from the production-compatible Worker without modifying the bodies.
import {getMeta,putMeta} from "../../platform/meta.js";
import {interpretRadarHealth,readRadarAudit} from "./hourly-health.js";
import { sha } from "../../platform/hash.js";
import { assess } from "../../ai/job-evaluation-service.js";
import { deliverAllVerified } from "../delivery/notification-service.js";
import { tg, verifyTelegram } from "../delivery/telegram-transport.js";
import { iso, kyivDay, text } from "../../platform/runtime-utils.js";

export async function radarHealthReport(env, options = {}) {
  const slot = String(options.slot || "manual");
  const key = "health_report_" + kyivDay() + "_" + slot;
  if (options.send && !options.force && await getMeta(env,key))
    return {sent:false,reason:"already_reported",slot};
  const after = new Date(Date.now()-6*3600000).toISOString();
  const history = (await env.DB.prepare(
    "SELECT started_at,source_count,fetched,inserted,assessed,kept,errors FROM runs WHERE started_at >= ? ORDER BY id DESC LIMIT 12"
  ).bind(after).all()).results || [];
  const sum = (field) => history.reduce((a,r)=>a+(Number(r[field])||0),0);
  const errors = (await env.DB.prepare(
    "SELECT source,last_error FROM source_state WHERE last_error IS NOT NULL AND last_error != '' ORDER BY source LIMIT 8"
  ).all()).results || [];
  const latest = history[0]?.started_at || null;
  const issueCount = history.reduce((n,r)=>{
    try {return n+(JSON.parse(r.errors||"[]").length)}catch{return n+1}
  },0);
  const healthy = history.length>=4 && sum("source_count")>0;
  const text = [
    (healthy ? "✅" : "⚠️") + " Job Intelligence Radar — звіт про роботу",
    "Дата: " + kyivDay() + " · останні 6 годин",
    "Запусків: " + history.length + " · перевірено джерел: " + sum("source_count"),
    "Отримано записів: " + sum("fetched") + " · нових: " + sum("inserted"),
    "AI-оцінено: " + sum("assessed") + " · відібрано: " + sum("kept"),
    "Збоїв під час отримання: " + issueCount,
    errors.length ? "Проблемні джерела: " + errors.map(x=>String(x.source).slice(0,55)).join(", ") :
      "Проблемних джерел зараз не зафіксовано.",
    latest ? "Останній запуск: " + latest.replace("T"," ").slice(0,16) + " UTC" : "Немає нових запусків.",
    "Вакансії надсилаються окремо лише після відбору. Відсутність вакансій ≠ відсутність перевірок."
  ].join("\n");
  if (!options.send) return {preview:true,slot,report:text,runs:history.length,healthy};
  await verifyTelegram(env);
  await tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,text,disable_web_page_preview:true});
  await putMeta(env,key,iso());
  return {sent:true,slot,runs:history.length,healthy};
}

export async function radarCriticalAlert(env, failures) {
  if(!failures.length)return {sent:false,reason:"no_errors"};
  const slot = Math.floor(Date.now()/(6*3600000));
  const key = "critical_warning_" + slot;
  if(await getMeta(env,key))return {sent:false,reason:"already_warned"};
  await verifyTelegram(env);
  await tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,
    text:"⚠️ Job Intelligence Radar: помилка виконання Cloudflare cron.\n"+
      "Етапи: "+failures.map(x=>String(x).slice(0,140)).join("; ").slice(0,500)+
      "\nПеревірка потребує уваги. Наступний запуск за розкладом не вимкнено.",
    disable_web_page_preview:true});
  await putMeta(env,key,iso());
  return {sent:true};
}

export async function runHourlyHealthAudit(env){
  let snapshot=await readRadarAudit(env);
  let report=interpretRadarHealth(snapshot);
  const recovered=[];
  // Retry only stages that are safe, already have de-duplication leases and
  // do not trigger new third-party scanning / Reddit rate-limit penalties.
  if(report.problems.includes("queued_jobs_delayed")){
    const result=await assess(env);
    if(!result?.model_error)recovered.push("assess_retry");
  }
  if(report.problems.includes("telegram_delivery_check_stale")||
     report.problems.includes("telegram_delivery_error")||
     recovered.includes("assess_retry")){
    const result=await deliverAllVerified(env);
    if(result?.state==="ok")recovered.push("delivery_retry");
  }
  if(recovered.length){
    snapshot=await readRadarAudit(env);
    report=interpretRadarHealth(snapshot);
  }
  const result={...report,recovered};
  await putMeta(env,"hourly_health_audit_last",JSON.stringify(result));
  // An extended verified non-delivery drought is not necessarily an outage.
  // Surface it once per day so over-filtering is not silent for weeks.
  if(report.warnings.includes("active_collection_but_zero_deliveries_review_selection_not_telegram")){
    const key="quality_drought_warning_"+kyivDay();
    if(!await getMeta(env,key)){
      await verifyTelegram(env);
      await tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,
        text:"🔎 Radar · перевірка якості: за останні 12 годин збір та AI-оцінювання активні, але нових доставлених можливостей немає. Це не обов'язково збій. Переглянь /status і /leads; фільтри географії, конкуренції та безпеки не вимкнено.",
        disable_web_page_preview:true});
      await putMeta(env,key,iso());
    }
  }
  if(report.problems.length){
    const code=await sha(report.problems.slice().sort().join("|"));
    const slot=Math.floor(Date.now()/(6*3600000));
    const key="hourly_health_warning_"+slot+"_"+code.slice(0,16);
    if(!await getMeta(env,key)){
      await verifyTelegram(env);
      await tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,
        text:"⚠️ Radar · щогодинна перевірка виявила проблему.\n"+
          "Проблеми: "+report.problems.join(", ").slice(0,400)+"\n"+
          "Відновлення: "+(recovered.length?recovered.join(", "):"потрібна діагностика")+
          "\nЗбір за розкладом не вимкнено. Нуль релевантних вакансій сам по собі не є збоєм.",
        disable_web_page_preview:true});
      await putMeta(env,key,iso());
    }
  }
  return result;
}

export async function checkUpworkHealth(env) {
  const seen = Date.parse(await getMeta(env, "upwork_last_scan") || "");
  if (!Number.isFinite(seen) || Date.now() - seen < 4 * 36e5) return { ok: true };
  const key = "upwork_stale_warning_" + kyivDay();
  if (await getMeta(env, key)) return { ok: false, reason: "already_warned_today" };
  await verifyTelegram(env);
  const hours = Math.floor((Date.now() - seen) / 36e5);
  await tg(env, "sendMessage", {
    chat_id: env.TG_CHAT_ID,
    text: "\u26A0\uFE0F Upwork \xB7 \u0434\u0436\u0435\u0440\u0435\u043B\u043E \u043D\u0435 \u043F\u0435\u0440\u0435\u0432\u0456\u0440\u044F\u043B\u043E\u0441\u044C " + hours + " \u0433\u043E\u0434\u0438\u043D. \u0426\u0435 \u0437\u0431\u0456\u0439 \u043C\u043E\u043D\u0456\u0442\u043E\u0440\u0438\u043D\u0433\u0443, \u0430 \u043D\u0435 \u0432\u0456\u0434\u0441\u0443\u0442\u043D\u0456\u0441\u0442\u044C \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u043D\u0438\u0445 \u0432\u0430\u043A\u0430\u043D\u0441\u0456\u0439. \u041F\u0435\u0440\u0435\u0432\u0456\u0440\u0442\u0435 OneAIHub/OneAIWorkers \u0442\u0430 \u043F\u043E\u0433\u043E\u0434\u0438\u043D\u043D\u0438\u0439 \u0437\u0430\u043F\u0443\u0441\u043A.",
    disable_web_page_preview: true
  });
  await putMeta(env, key, iso());
  return { ok: false, warned: true, hours };
}
