import {RADAR_SETTINGS} from "../../config/radar.generated.js";
// Isolated concurrent pipelines: a failure in one branch cannot reject another.
// All outcomes are explicit, so the caller can alert on a branch failure.
export async function settleIndependentPipelines(tasks) {
  return Promise.allSettled(tasks.map(task=>Promise.resolve().then(task)));
}

// Fairly share a limited Telegram batch across source families.
export function fairDeliveryBatch(rows, limit=8){
 const cap=Math.max(1,Math.min(12,Number(limit)||8));
 const groups=new Map();
 const keyOf=x=>{
  const s=String(x.source||"");
  if(s.startsWith("Freelancehunt"))return "freelancehunt";
  if(s.startsWith("Reddit"))return "reddit";
  if(s.startsWith("Upwork"))return "upwork";
  if(s.startsWith("Community")||(RADAR_SETTINGS.jobs.sources.items||[]).some(item=>item.name===s&&item.forumHiring===true))return "community";
  return "other";
 };
 for(const x of rows||[]){const k=keyOf(x);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(x);}
 const order=["freelancehunt","reddit","upwork","community","other"],out=[];
 while(out.length<cap){
  let found=false;
  for(const k of order){
   const next=groups.get(k)?.shift();
   if(next){out.push(next);found=true;}
   if(out.length===cap)break;
  }
  if(!found)break;
 }
 return out;
}
