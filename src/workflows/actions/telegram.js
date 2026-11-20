// Durable Workflow action implementation. Cloudflare step names, retry policies,
// payload handling and return values are preserved from the original Workflow.
import {RADAR_SETTINGS} from "../../config/radar.generated.js";
import {sendOnce} from "../../features/delivery/telegram-outbox.js";
import { deliverAllVerified, notifyRedditProspects } from "../../features/delivery/notification-service.js";
import { TELEGRAM_CMD_BASE, radarWebhookSecret, tg, verifyTelegram } from "../../features/delivery/telegram-transport.js";
import { radarTelegramLeads } from "../../http/telegram-webhook.js";

export async function executeInspectWebhookAction({env,step,event,action,opts}) {
      return await step.do("inspect-telegram-webhook",opts,async()=>{
        const info=await tg(env,"getWebhookInfo",{});
        const me=await tg(env,"getMe",{});
        const member=await tg(env,"getChatMember",{chat_id:env.TG_CHAT_ID,user_id:me.id}).catch(()=>null);
        const commands=await tg(env,"getMyCommands",{scope:{type:"chat",chat_id:env.TG_CHAT_ID}}).catch(()=>[]);
        const admins=await tg(env,"getChatAdministrators",{chat_id:env.TG_CHAT_ID}).catch(()=>null);
        const sample=Array.isArray(admins)?admins.find(x=>x.user?.id && !x.user.is_bot):null;
        const sampleRole=sample?await tg(env,"getChatMember",{chat_id:env.TG_CHAT_ID,user_id:sample.user.id}).catch(()=>null):null;
        return {url:info?.url||"",pending_updates:info?.pending_update_count||0,
          last_error_date:info?.last_error_date||null,
          bot_username:me?.username||"",bot_role:member?.status||"unverified",
          admin_list_available:Array.isArray(admins),admin_count:Array.isArray(admins)?admins.length:0,
          sample_admin_member_verifiable:!!sampleRole&&["creator","administrator"].includes(sampleRole.status),
          command_menu:(Array.isArray(commands)?commands:[]).map(x=>x.command),
          worker:TELEGRAM_CMD_BASE};
      });
    }

export async function executeDeliverVerifiedAction({env,step,event,action,opts}) {
      return await step.do("flush-verified-telegram",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"120 seconds"},
        ()=>deliverAllVerified(env));
    }

export async function executeLeadsPreviewAction({env,step,event,action,opts}) {
      return await step.do("render-last-72h-actionable-leads",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"35 seconds"},
        ()=>radarTelegramLeads(env));
    }

export async function executeRefreshCommandsAction({env,step,event,action,opts}) {
      return await step.do("refresh-only-command-menu",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"30 seconds"},async()=>{
          await verifyTelegram(env);
          await tg(env,"setMyCommands",{scope:{type:"chat",chat_id:env.TG_CHAT_ID},
            commands:[
              {command:"leads",description:"Конкретні проєкти й клієнти"},
              {command:"scan",description:"Запустити основний пошук"},
              {command:"reddit",description:"Запустити Reddit-пошук"},
              {command:"prospects",description:"Проблеми потенційних клієнтів"},
              {command:"status",description:"Діагностика Radar"},
              {command:"sources",description:"Усі джерела"}
            ]});
          return {menu_updated:true,notified_group:false};
        });
    }

export async function executeConfigureWebhookAction({env,step,event,action,opts}) {
      return await step.do("register-telegram-webhook",opts,async()=>{
        await verifyTelegram(env);
        const secret=await radarWebhookSecret(env);
        const prior=await tg(env,"getWebhookInfo",{});
        if(!RADAR_SETTINGS.notifications.telegramEnabled || !TELEGRAM_CMD_BASE) return {state:"disabled",reason:"Set notifications.telegramEnabled and app.publicBaseUrl in your private config"};
        if(prior?.url && prior.url!==TELEGRAM_CMD_BASE+"/telegram/webhook")
          return {configured:false,conflict:true,existing_url:prior.url};
        await tg(env,"setWebhook",{
          url:TELEGRAM_CMD_BASE+"/telegram/webhook",secret_token:secret,
          allowed_updates:["message"],drop_pending_updates:false,max_connections:2
        });
        const info=await tg(env,"getWebhookInfo",{});
        if(info?.url!==TELEGRAM_CMD_BASE+"/telegram/webhook")
          throw Error("Telegram did not retain the expected webhook");
        await tg(env,"setMyCommands",{scope:{type:"chat",chat_id:env.TG_CHAT_ID},
          commands:[
            {command:"scan",description:"Запустити збір і AI-відбір"},
            {command:"reddit",description:"Запустити Reddit-пошук"},
            {command:"status",description:"Стан Radar і джерел"},
            {command:"prospects",description:"Потенційні клієнти з проблемами"},
            {command:"sources",description:"Усі джерела та їх доступність"},
            {command:"leads",description:"Конкретні можливості за 72 години"}
          ]}).catch(()=>{});
        await tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,
          text:"Job Radar: команди /scan, /reddit, /status активовано. Доступні лише адміністраторам групи. Щогодинний Cron працює як раніше."});
        return {configured:true,url:info.url,pending_updates:info.pending_update_count||0};
      });
    }

// Explicit one-shot production delivery probe; no job/lead state is modified.
export async function executeTestDeliveryAction({env,step,event}) {
  const payload=event?.payload||{};
  const id=String(payload.test_id||"");
  if(payload.confirm!=="send_test"||!/^[a-f0-9]{32}$/.test(id))
    return {sent:false,state:"invalid_test_request"};
  return step.do("one-shot-telegram-outbox-delivery",
    {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"45 seconds"},
    ()=>sendOnce(env,{
      key:"telegram-manual-delivery-test:"+id,
      text:"<b>Job Radar v2 — тестова доставка</b>\nCloudflare Worker → D1 outbox → Telegram.\nЦе лише перевірка, не вакансія.\nID: <code>"+id+"</code>",
      parse_mode:"HTML",disable_web_page_preview:true
    }));
}
