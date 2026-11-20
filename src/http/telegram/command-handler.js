// Telegram radarHandleTelegram; moved without editing the function body.
import { radarWebhookSecret, tg, verifyTelegram } from "../../features/delivery/telegram-transport.js";
import { esc, iso, kyivDay, text } from "../../platform/runtime-utils.js";
import {validateSource,listSources,addSource} from "../../features/discovery/custom-sources.js";
import {reviewBatch,seedBenchmark,scorecard,initOpportunity} from "../../features/ai/opportunity-intelligence.js";
import {RADAR_SETTINGS} from "../../config/radar.generated.js";
import { runDemandDigest } from "../../features/prospects/demand-discovery.js";
import {getMeta,putMeta} from "../../platform/meta.js";
import {hasBrowserOneAIHub,oneAIHubCapabilities} from "../../integrations/oneaihub/capabilities.js";
import {radarTelegramStatus} from "./status.js";
import {radarTelegramLeads} from "./lead-preview.js";

export async function radarHandleTelegram(req,env,ctx) {
  if(!env.TG_BOT_TOKEN || !env.ADMIN_TOKEN || !env.MANUAL_RADAR_WORKFLOW)
    return new Response("Not configured",{status:503});
  const incoming=req.headers.get("X-Telegram-Bot-Api-Secret-Token")||"";
  const expected=await radarWebhookSecret(env);
  if(!incoming || incoming!==expected)return new Response("Forbidden",{status:403});
  let update;
  try {update=await req.json()}catch{return new Response("Bad JSON",{status:400})}
  const msg=update?.message;
  if(!msg || String(msg.chat?.id)!==String(env.TG_CHAT_ID) || !msg.from?.id)
    return new Response("OK");
  const command=String(msg.text||"").trim().split(/\s+/)[0].toLowerCase();
  const matched=command.match(/^\/(scan|reddit|status|prospects|demand|sources|leads|opportunities)(?:@([a-z0-9_]{5,32}))?$/i);
  const target=String(RADAR_SETTINGS.notifications.telegram.expectedBotUsername||"").replace(/^@/,"").toLowerCase();
  if(!matched||(matched[2]&&matched[2].toLowerCase()!==target))return new Response("OK");
  const action=matched[1].toLowerCase();
  ctx.waitUntil((async()=>{
    try {
      // Server-side Telegram membership check. Anonymous/send-as-chat commands
      // intentionally fail. No authority from message text.
      const member=await tg(env,"getChatMember",{chat_id:env.TG_CHAT_ID,user_id:msg.from.id});
      if(!["creator","administrator"].includes(String(member?.status||""))){
        await tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,
          text:"⛔ Команди Radar доступні лише адміністраторам групи."});
        return;
      }
      if(Number.isFinite(Number(update.update_id))){
        const lock=await env.DB.prepare("INSERT OR IGNORE INTO meta(key,value) VALUES(?,?)")
          .bind("telegram_radar_update_"+String(update.update_id),iso()).run();
        if(!lock.meta?.changes)return;
      }
      if(action==="status"){
        await tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,text:await radarTelegramStatus(env)});
        return;
      }
      if(action==="leads"){
        await tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,
          text:await radarTelegramLeads(env),parse_mode:"HTML",
          disable_web_page_preview:true});
        return;
      }
      if(action==="sources"){
        const registry=await listSources(env);
        const states=new Map(registry.status.map(x=>[x.source,x]));
        const fmt=x=>{
          const state=states.get(x.name);
          return (state?.last_error?"!":state?.last_success?"+":"·")+" "+x.name+
            (state?.last_error?" (помилка)":"");
        };
        const community=["Проблеми клієнтів — Cloudflare RSS/Atom",
          ...registry.community.map(fmt)].join("\n");
        const jobs=["Вакансії / проєкти — Cloudflare",
          ...registry.builtin.map(fmt),...registry.custom.map(fmt)].join("\n");
        await tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,text:community.slice(0,3500)});
        await tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,text:jobs.slice(0,3500)});
        return;
      }
      if(action==="opportunities"){
        const data=await scorecard(env);
        const names={A:"Агенції / субпідряд",B:"Незавершені продукти",C:"Майбутній попит",D:"Відкриті замовлення"};
        const groups=(data.by_channel||[]).map(x=>(names[x.channel]||x.channel)+
          " · "+x.stage+": "+x.n);
        const top=(data.top||[]).filter(x=>x.stage==="ready"||
          x.stage==="manual_review").slice(0,5)
          .map(x=>{
            let e={};try{e=JSON.parse(x.evidence_json||"{}")}catch{}
            return "• "+(names[x.channel]||x.channel)+" · "+
              (x.stage==="ready"?"Готове до фінальної перевірки":"Потрібна перевірка")+
              "\nЗапит автора: "+String(e.need||"невідомо").slice(0,140)+
              "\nОплата: "+String(e.budget||"не підтверджено").slice(0,90)+
              (e.gap?"\nВажлива вимога: "+String(e.gap).slice(0,110):"")+
              "\nНаступний крок: "+String(x.next_action||"переглянути першоджерело").slice(0,150)+
              "\n"+String(x.source_url);
          });
        const msg=["Radar · Кваліфікація можливостей (тестовий режим)",
          ...(groups.length?groups:["Поки немає оцінених записів."]),
          "",
          "Відібрані для ручної перевірки:",...(top.length?top:["Поки немає."]),
          "",
          "Це не підтверджені контракти. Автоматичної розсилки або відгуків немає.",
          "Контрольна вибірка: "+Number(data.benchmark?.total||0)+
          "; оцінок користувача: "+Number(data.benchmark?.labeled||0)+
          ". Точність 8/10 ще не виміряна."].join("\n").slice(0,3500);
        await tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,text:msg,disable_web_page_preview:true});
        return;
      }
      if(action==="demand"){
         if(!RADAR_SETTINGS.leads.enabled)return;
        const day=kyivDay(),slot="ondemand_"+day+"_"+new Date().toISOString().slice(11,13);
        const result=await runDemandDigest(env,{day,slot,send:true,
          deliver:async text=>{
            await verifyTelegram(env);
            await tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,text,
              parse_mode:"HTML",disable_web_page_preview:true});
          }});
        if(result.state!=="sent"){
          await tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,
            text:result.state==="no_matching_demand"
              ?"🧩 Demand Radar: нових конкретних технічних проблем для ручної перевірки поки немає."
              :result.state==="daily_cap"
              ?"🧩 Demand Radar: сьогодні досягнуто ліміту 10 потенційних контактів."
              :"🧩 Demand Radar: перевірка завершена; статус "+String(result.state).slice(0,50)+"."
          });
        }
        return;
      }
      if(action==="prospects"){
        await env.MANUAL_RADAR_WORKFLOW.create({
          id:"tg-prospects-"+new Date().toISOString().replace(/[^0-9]/g,"").slice(0,14),
          params:{action:"prospect_triage"}
        });
        await tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,
          text:"Перевіряю вже зібрані Reddit-дописи на конкретні проблеми, які ти можеш вирішити. Нових запитів до Reddit ця команда не робить."});
        return;
      }
      const now=Date.now();
      const lockKey="telegram_radar_last_"+action;
      const previous=Number(await getMeta(env,lockKey)||0);
      const wait=action==="reddit"?15:20;
      if(now-previous<wait*60e3){
        await tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,
          text:"Radar: /"+action+" вже запускали недавно. Повтори через "+Math.max(1,Math.ceil((wait*60e3-(now-previous))/6e4))+" хв. /status — перевірка стану."});
        return;
      }
      await putMeta(env,lockKey,String(now));
      if(action==="reddit"){
        if(!RADAR_SETTINGS.leads.enabled || !RADAR_SETTINGS.reddit.enabled || !hasBrowserOneAIHub(env) || env.REDDIT_MCP_ENABLED!=="1" || !env.REDDIT_MCP_WORKFLOW)
          throw Error("Reddit Workflow not enabled");
        await env.MANUAL_RADAR_WORKFLOW.create({
          id:"tg-reddit-"+new Date(now).toISOString().replace(/[^0-9]/g,"").slice(0,12),
          params:{action:"reddit"}
        });
        await tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,
          text:"Reddit Radar запущено. Перевірка 1–2 напрямів триватиме приблизно 1–3 хвилини. Після завершення надішлю результат. /status — поточний стан."});
      }else{
        await env.MANUAL_RADAR_WORKFLOW.create({
          id:"tg-scan-"+new Date(now).toISOString().replace(/[^0-9]/g,"").slice(0,12),
          params:{action:"scan"}
        });
        await tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,
          text:"Job Radar запущено вручну. Перевіряю джерела й запускаю AI-відбір. Результат надішлю після завершення."});
      }
    }catch(error){
      // No secret tokens or headers logged or returned.
      console.error("telegram manual action failed",String(error?.name||"Error"));
      await tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,
        text:"Не вдалося виконати команду Radar. Перевір /status або повтори пізніше."}).catch(()=>{});
    }
  })());
  return new Response("OK",{status:200});
}
