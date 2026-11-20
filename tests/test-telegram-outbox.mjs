import {strict as assert} from "node:assert";
import {RADAR_SETTINGS} from "../src/config/radar.generated.js";
import {sendOnce} from "../src/features/delivery/telegram-outbox.js";

const outbox=new Map(),retries=new Map(),attempts=[];
let failAck=false,mode="ok",now=Date.now(),lookups=0;
const originalNow=Date.now,originalFetch=globalThis.fetch;
Date.now=()=>now;
const DB={
  prepare(sql){
    let args=[];
    return {
      bind(...values){args=values;return this;},
      async run(){
        if(sql.startsWith("CREATE TABLE"))return {meta:{changes:0}};
        if(sql.startsWith("INSERT INTO meta"))return {meta:{changes:1}};
        if(sql.startsWith("INSERT OR IGNORE INTO telegram_delivery_outbox")){
          if(outbox.has(args[0]))return {meta:{changes:0}};
          outbox.set(args[0],{state:"sending",message_id:null});
          return {meta:{changes:1}};
        }
        if(sql.startsWith("UPDATE telegram_delivery_outbox SET state='sending'")){
          const [key,,retryKey,time,cap]=args,r=outbox.get(key),schedule=retries.get(retryKey);
          if(!r||r.state!=="retryable"||!schedule||schedule.next_retry_at>time||schedule.attempts>=cap)
            return {meta:{changes:0}};
          r.state="sending";return {meta:{changes:1}};
        }
        if(sql.startsWith("UPDATE telegram_delivery_outbox SET state='retryable'")){
          const [error,key]=args;Object.assign(outbox.get(key),{state:"retryable",error});
          return {meta:{changes:1}};
        }
        if(sql.startsWith("INSERT INTO telegram_delivery_retry_schedule")){
          const [key,time]=args,previous=retries.get(key);
          retries.set(key,{next_retry_at:time,attempts:(previous?.attempts||0)+1});
          return {meta:{changes:1}};
        }
        if(sql.startsWith("UPDATE telegram_delivery_outbox SET state='sent'")){
          if(failAck){failAck=false;throw Error("temporary D1 acknowledge failure");}
          const [at,message,key]=args;Object.assign(outbox.get(key),{state:"sent",message_id:message,sent_at:at});
          return {meta:{changes:1}};
        }
        if(sql.startsWith("UPDATE telegram_delivery_outbox SET state='uncertain'")){
          const [error,key]=args;Object.assign(outbox.get(key),{state:"uncertain",error});
          return {meta:{changes:1}};
        }
        if(sql.startsWith("UPDATE telegram_delivery_outbox SET state=?")){
          const [state,error,key]=args;Object.assign(outbox.get(key),{state,error});
          return {meta:{changes:1}};
        }
        if(sql.startsWith("DELETE FROM telegram_delivery_retry_schedule")){
          retries.delete(args[0]);return {meta:{changes:1}};
        }
        throw Error("Unexpected SQL: "+sql);
      }
    };
  },
  async batch(statements){
    // D1 batch is transactional; these mock mutations are deterministic.
    return Promise.all(statements.map(stmt=>stmt.run()));
  }
};
const env={DB,TG_BOT_TOKEN:"synthetic-token",TG_CHAT_ID:"333"};
globalThis.fetch=async (url,opts)=>{
  const method=String(url).split("/").at(-1);
  if(method==="getMe"){lookups++;return Response.json({ok:true,result:{is_bot:true,id:44,username:RADAR_SETTINGS.notifications.telegram.expectedBotUsername||"example_bot"}});}
  if(method==="getChat"){lookups++;return Response.json({ok:true,result:{id:333,type:RADAR_SETTINGS.notifications.telegram.allowedChatTypes[0],title:RADAR_SETTINGS.notifications.telegram.expectedChatTitle||"Sample group"}});}
  if(method==="sendMessage"){
    attempts.push(JSON.parse(opts.body));
    if(mode==="429")return Response.json({ok:false,description:"Too Many Requests",parameters:{retry_after:2}},{status:429});
    if(mode==="400")return Response.json({ok:false,description:"Bad Request"},{status:400});
    if(mode==="network")throw TypeError("network response lost");
    return Response.json({ok:true,result:{message_id:398+attempts.length}});
  }
  throw Error("Unexpected Telegram method: "+method);
};
try{
  if(!RADAR_SETTINGS.notifications.telegramEnabled){
    await assert.rejects(sendOnce(env,{key:"off",text:"not sent"}),/Telegram disabled/);
    assert.equal(attempts.length,0);
  }else{
    let result=await sendOnce(env,{key:"one",text:"first"});
    assert.equal(result.state,"sent");
    assert.equal((await sendOnce(env,{key:"one",text:"first"})).state,"already_reserved");
    assert.equal(attempts.length,1);
    assert.equal(lookups,2,"verified bot/chat cached for subsequent deliveries");

    mode="429";
    await assert.rejects(sendOnce(env,{key:"rate",text:"recoverable"}),/HTTP 429/);
    assert.equal(outbox.get("rate").state,"retryable");
    assert.equal(retries.get("rate").attempts,1);
    assert.equal((await sendOnce(env,{key:"rate",text:"recoverable"})).state,"already_reserved");
    assert.equal(attempts.length,2,"not retried before Telegram's retry_after");
    now+=2100;mode="ok";
    assert.equal((await sendOnce(env,{key:"rate",text:"recoverable"})).state,"sent");
    assert.equal(outbox.get("rate").state,"sent");
    assert.equal(retries.has("rate"),false);
    assert.equal((await sendOnce(env,{key:"rate",text:"recoverable"})).state,"already_reserved");
    assert.equal(attempts.length,3,"exactly one accepted retry");

    mode="400";
    await assert.rejects(sendOnce(env,{key:"invalid",text:"invalid"}),/HTTP 400/);
    assert.equal(outbox.get("invalid").state,"rejected");
    assert.equal((await sendOnce(env,{key:"invalid",text:"invalid"})).state,"already_reserved");
    mode="network";
    await assert.rejects(sendOnce(env,{key:"ambiguous",text:"unknown"}),/network response lost/);
    assert.equal(outbox.get("ambiguous").state,"uncertain");
    assert.equal((await sendOnce(env,{key:"ambiguous",text:"unknown"})).state,"already_reserved");

    mode="ok";failAck=true;
    await assert.rejects(sendOnce(env,{key:"ack",text:"D1 uncertain"}),/acknowledge failure/);
    assert.equal(outbox.get("ack").state,"uncertain");
    assert.equal((await sendOnce(env,{key:"ack",text:"D1 uncertain"})).state,"already_reserved");
    assert.equal(lookups,2);
  }
}finally{
  Date.now=originalNow;globalThis.fetch=originalFetch;
}
console.log("PASS Telegram 429 retry_after, atomic retry claim, cached verification and ambiguous-result no-duplicate protection");
