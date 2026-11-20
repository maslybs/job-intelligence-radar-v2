// Job and contract alert formatting and delivery.

// Function bodies unchanged from the pre-refactor Worker.

import {getMeta,putMeta} from "../../platform/meta.js";

import {sourceIsActionable,listingIsActionable} from "../discovery/source-accessibility.js";

import {reviewDecision} from "../jobs/review-decision.js";

import {RADAR_SETTINGS} from "../../config/radar.generated.js";

import { formatTelegramJob } from "./job-renderer.js";

import { tg, verifyTelegram } from "./telegram-transport.js";

import { esc, iso, kyiv, kyivDay, text } from "../../platform/runtime-utils.js";



export async function notifyFreshContract(env, send = false) {
  const today = kyivDay(), quotaKey = "fh_hot_count_" + today;
  const used = Number(await getMeta(env, quotaKey) || 0);
  if (used >= 3) return { sent: false, reason: "daily_fast_alert_cap" };
  const candidates = (await env.DB.prepare(
    "SELECT id,title,company,source,url,priority,score,reason,geo,engagement,description,region,published_at FROM jobs WHERE state='unread' AND alerted_at IS NULL AND geo='allowed' AND engagement='contract' AND source LIKE 'Freelancehunt%' AND priority IN ('P1','P2') AND score>=85 AND julianday(published_at) >= julianday('now','-6 hours') ORDER BY score DESC LIMIT 25"
  ).all()).results || [];
  const viable = candidates.filter((x) => {
    const d = String(x.description || "");
    const bids = Number(d.match(/Заявок:\s*(\d+)/)?.[1] || 999);
    const amount = Number(d.match(/Бюджет:\s*(\d+(?:[.,]\d+)?)\s*(UAH|USD|EUR)/i)?.[1]?.replace(",", ".") || 0);
    const currency = d.match(/Бюджет:\s*\d+(?:[.,]\d+)?\s*(UAH|USD|EUR)/i)?.[1]?.toUpperCase() || "";
    const completed = Number(d.match(/Історія замовника:\s*(\d+) завершених/)?.[1] || 0);
    const funded = currency === "UAH" && amount >= 7e3 || (currency === "USD" || currency === "EUR") && amount >= 200;
    return bids <= 15 && (funded || bids <= 5 && completed >= 2);
  }).slice(0, 2);
  if (!viable.length) return { sent: false, reason: "no_fresh_low_competition_contracts" };
  const title="<b>Job Radar · свіже замовлення · "+today+"</b>";
  const details=[];
  for(const x of viable)details.push(await formatTelegramJob(env,x,0));
  if(!send)return {preview:true,count:viable.length,messages:details};
  await verifyTelegram(env);
  let sent=0;const errors=[];
  for(let i=0;i<viable.length;i++){
    const x=viable[i],message=title+"\n\n"+details[i];
    if(message.length>3900){errors.push({id:x.id,reason:"message_too_long"});continue;}
    try{
      await tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,text:message,
        parse_mode:"HTML",disable_web_page_preview:true});
      await env.DB.prepare("UPDATE jobs SET alerted_at=? WHERE id=? AND alerted_at IS NULL")
        .bind(iso(),x.id).run();
      sent++;
    }catch(e){errors.push({id:x.id,reason:String(e?.message||e).slice(0,120)});break;}
  }
  if(sent)await putMeta(env,quotaKey,used+1);
  return {sent:sent>0,count:sent,mode:"fresh_freelancehunt_detailed",errors};
}

export async function notifyReview(env, send = false) {
  const day = kyivDay(), key = "review_digest_" + day;
  if (await getMeta(env, key)) return { sent: false, reason: "review_already_sent_today" };
  const rows = (await env.DB.prepare(
    "SELECT id,title,company,source,url,priority,score,reason,geo,kind,engagement,state,description,region,published_at FROM jobs WHERE state='filtered' AND alerted_at IS NULL AND kind='buyer' AND geo='allowed' AND engagement IN ('contract','fulltime') AND score BETWEEN 70 AND 84 AND source NOT LIKE 'Upwork%' AND source NOT LIKE 'Reddit%' AND julianday(published_at) >= julianday('now','-14 days') ORDER BY score DESC, published_at DESC LIMIT 25"
  ).all()).results || [];
  const selected = [];
  for (const x of rows) {
    if(!listingIsActionable(x))continue;
    const choice = reviewDecision(x);
    if (choice) selected.push({ ...x, reviewRisks: choice.risks });
    if (selected.length >= 3) break;
  }
  if (!selected.length) return { sent: false, reason: "no_safe_borderline_contracts", considered: rows.length };
  const head = "<b>Job Radar \xB7 \u0412\u0430\u0440\u0442\u043E \u043F\u0435\u0440\u0435\u0432\u0456\u0440\u0438\u0442\u0438 \xB7 " + day + "</b>\n<i>\u041D\u0435 \u043E\u0441\u043D\u043E\u0432\u043D\u0430 \u0434\u043E\u0431\u0456\u0440\u043A\u0430: \u0454 \u0440\u0438\u0437\u0438\u043A\u0438 \u0430\u0431\u043E \u043D\u0435\u0432\u0456\u0434\u043E\u043C\u0456 \u0443\u043C\u043E\u0432\u0438. \u041F\u0435\u0440\u0435\u0432\u0456\u0440 \u043E\u0440\u0438\u0433\u0456\u043D\u0430\u043B \u043F\u0435\u0440\u0435\u0434 \u0441\u0442\u0430\u0432\u043A\u043E\u044E.</i>";
  const items = [], delivered = [];
  for (const x of selected) {
    const basics = await formatTelegramJob(env, x, items.length);
    const risk = "<b>\u0429\u043E \u043F\u0435\u0440\u0435\u0432\u0456\u0440\u0438\u0442\u0438:</b> " + esc(x.reviewRisks.join("; "));
    const body = basics + "\n" + risk;
    if ([head, ...items, body].join("\n\n").length > 3750) break;
    items.push(body);
    delivered.push(x);
  }
  if (!delivered.length) return { sent: false, reason: "review_message_too_long" };
  const msg = [head, ...items].join("\n\n");
  if (!send) return { preview: true, eligible: rows.length, count: delivered.length, message: msg };
  await verifyTelegram(env);
  await tg(env, "sendMessage", { chat_id: env.TG_CHAT_ID, text: msg, parse_mode: "HTML", disable_web_page_preview: true });
  await putMeta(env, key, iso());
  for (const x of delivered) await env.DB.prepare("UPDATE jobs SET alerted_at=? WHERE id=? AND alerted_at IS NULL").bind(iso(), x.id).run();
  await putMeta(env, "review_last_sent", JSON.stringify({ at: iso(), count: delivered.length }));
  return { sent: true, count: delivered.length, mode: "review", main_filters_unchanged: true };
}

export async function notify(env, mode = "digest", send = false, batch = "") {
  const today = kyivDay(), local = kyiv();
  const slot = mode === "immediate" ? "hourly_" + (/* @__PURE__ */ new Date()).getUTCHours() : local.hour === "09" ? "morning" : local.hour === "18" ? "evening" : "manual_" + local.hour;
  const key = "notified_" + slot + "_" + today + (batch === "2" ? "_batch2" : "");
  if (await getMeta(env, key)) return { sent: false, reason: "slot_already_sent" };
  const clause = "AND priority IN ('P1','P2')";
  const all = (await env.DB.prepare("SELECT id,title,company,source,url,priority,score,reason,geo,engagement,description,region,published_at FROM jobs WHERE state='unread' AND alerted_at IS NULL AND geo='allowed' AND source NOT LIKE 'Upwork%' AND source NOT LIKE 'Reddit%' " + clause + " ORDER BY CASE priority WHEN 'P1' THEN 0 ELSE 1 END,score DESC LIMIT 5").all()).results || [];
  const list = all.filter(listingIsActionable).slice(0, 3);
  if (!list.length) return { sent: false, reason: "no_relevant_leads" };
  if (mode !== "immediate" && !list.some((x) => x.priority === "P1") && list.length < 2 && Number(list[0]?.score || 0) < 90 && !(list[0]?.engagement === "contract" && Number(list[0]?.score || 0) >= 85))
    return { sent: false, reason: "not_enough_qualified_leads", eligible: list.length };
  const head = "<b>Job Radar \xB7 " + today + (mode === "immediate" ? " \xB7 P1/P2 \u043D\u043E\u0432\u0456 \u0432\u0430\u043A\u0430\u043D\u0441\u0456\u0457" : " \xB7 \u0434\u043E\u0431\u0456\u0440\u043A\u0430") + "</b>";
  const tail = RADAR_SETTINGS.app.publicBaseUrl ? "Inbox: " + RADAR_SETTINGS.app.publicBaseUrl + "/inbox" : "";
  const rendered = [], selected = [];
  for (const x of list) {
    const item = await formatTelegramJob(env, x, rendered.length);
    const candidate = [head, ...rendered, item, tail].join("\n\n");
    if (candidate.length > 3850) break;
    rendered.push(item);
    selected.push(x);
  }
  if (!selected.length) return { sent: false, reason: "message_too_long" };
  if (mode !== "immediate" && !selected.some((x) => x.priority === "P1") && selected.length < 2 && Number(selected[0]?.score || 0) < 90 && !(selected[0]?.engagement === "contract" && Number(selected[0]?.score || 0) >= 85))
    return { sent: false, reason: "digest_too_long" };
  const msg = [head, ...rendered, tail].join("\n\n");
  if (!send) return { preview: true, eligible: all.length, count: selected.length, message: msg };
  await verifyTelegram(env);
  await tg(env, "sendMessage", { chat_id: env.TG_CHAT_ID, text: msg, parse_mode: "HTML", disable_web_page_preview: true });
  await putMeta(env, key, iso());
  for (const x of selected) await env.DB.prepare("UPDATE jobs SET alerted_at=? WHERE id=?").bind(iso(), x.id).run();
  return { sent: true, count: selected.length, slot };
}
