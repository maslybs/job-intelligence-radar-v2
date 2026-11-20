// Cloudflare Cron scheduledTime is the intended UTC fire time.
// IDs must be deterministic across retries and cron execution delays.
export function utcHourSlot(scheduledTime){
 const d=new Date(Number(scheduledTime));
 if(!Number.isFinite(d.getTime()))throw Error("invalid_hourly_slot");
 return d.toISOString().slice(0,13).replace(/[^0-9]/g,"");
}
export function hourlyWorkflowId(slot,kind="hourly-auto"){
 if(!/^\d{10}$/.test(String(slot||"")))throw Error("invalid_hourly_slot");
 if(!["hourly-auto","hourly-rescue"].includes(kind))throw Error("invalid_hourly_kind");
 return kind+"-"+slot;
}
export function needsHourlyRescue(primary,completed,slot){
 const status=String(primary?.status||"");
 const output=primary?.output||{};
 if(status==="running"||status==="queued"||status==="paused")return false;
 if(status==="complete"&&output.state==="completed")return false;
 if(completed?.slot===slot&&completed?.state==="completed" &&
   ["scheduled","recovery"].includes(completed?.origin))return false;
 return true; // absent, errored, terminated, or completed-degraded
}
