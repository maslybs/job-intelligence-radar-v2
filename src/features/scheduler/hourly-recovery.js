// A missed hourly cron must not starve the independent collectors.
// Trigger the recovery only once in the next hour, at :20, if the last
// completed full scan is genuinely stale. Does not affect the 10-min Reddit poll.
export function hourlyRecoveryNeeded(lastScan,now=Date.now(),minAgeMinutes=95){
 const t=Date.parse(String(lastScan||""));
 return !Number.isFinite(t)||now-t>minAgeMinutes*60000;
}
