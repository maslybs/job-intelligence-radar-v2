// Evidence-based Upwork funnel: 0-19 favorable; 20-49 review with lower model score; 50+ excluded.
 // Coarse proposal ranges, stale data or one fresh reading are NOT low-competition proof.
 // Rejected listings stay in source discovery history for later shadow analysis.
export const UPWORK_RAPID_COMPETITION_HOURS = 1;
export const UPWORK_RAPID_CROWDING_TIER = 50;
export const UPWORK_MAX_PROPOSAL_TIER = 49;
export const UPWORK_MIN_AGE_MINUTES = 65;
export const UPWORK_MIN_OBSERVATION_GAP_MINUTES = 30;
export const UPWORK_MAX_SNAPSHOT_AGE_MINUTES = 25;

export function proposalTierUpper(tier) {
  const text=String(tier||"").trim().toLowerCase();
  if(/(?:fewer|less) than\s*5/.test(text))return 4;
  if(/\b(?:more|over)(?:\s+than)?\s*50\b|(?:50|100)\s*\+|50\s*(?:or more|and above)/.test(text))return 1000;
  const matches=text.match(/\d+/g)?.map(Number)||[];
  if(matches.length===2)return Math.max(...matches);
  if(matches.length===1 && /\b(?:proposal|bid|applicant)/.test(text))return matches[0];
  return 999;
}
export function upworkCompetitionDecision(obs,now=Date.now()) {
  if(!obs)return {eligible:false,known:false,reason:"competition_snapshot_missing"};
  const ageHours=(now-Date.parse(obs.published_at))/3600000;
  const first=Date.parse(obs.first_seen_at),last=Date.parse(obs.last_seen_at);
  const minutes=(last-first)/60000;
  const upper=Number(obs.last_upper);
  const baseline=Number(obs.first_upper);
  // Compare consecutive independent measurements, not the first-ever count.
  const previousUpper=obs.previous_upper===null||obs.previous_upper===undefined?NaN:Number(obs.previous_upper);
  const previousSeen=Date.parse(obs.previous_seen_at||"");
  const recentGapMinutes=(last-previousSeen)/60000;
  const firstAgeHours=(first-Date.parse(obs.published_at))/3600000;
  const lastAgeHours=(last-Date.parse(obs.published_at))/3600000;
  const growth=minutes>0?Math.max(0,upper-baseline)*60/minutes:null;
  const base={age_hours:Number.isFinite(ageHours)?Math.round(ageHours*100)/100:null,
    snapshots:Number(obs.samples)||0,minutes_between_samples:Math.round(minutes),
    recent_interval_minutes:Number.isFinite(recentGapMinutes)?Math.round(recentGapMinutes):null,
    previous_tier_upper:Number.isFinite(previousUpper)?previousUpper:null,
    proposal_tier_upper:upper,estimated_upper_growth_per_hour:growth===null?null:Math.round(growth*100)/100};
  if(!Number.isFinite(ageHours)||ageHours < -0.5 || ageHours>72)
    return {...base,eligible:false,known:upper!==999,reason:"outside_freshness"};
  if(upper===1000 || (upper>UPWORK_MAX_PROPOSAL_TIER && upper!==999))
    return {...base,eligible:false,known:true,reason:"too_many_proposals"};
  // "20 to 50" just minutes after publication is not normal low competition.
  // Keep an early crowded observation disqualifying until the listing expires,
  // even if the next delivery happens after the first hour.
  const rapidCrowding=(
    (baseline>=UPWORK_RAPID_CROWDING_TIER && baseline<999 &&
      Number.isFinite(firstAgeHours) && firstAgeHours>=0 && firstAgeHours<=UPWORK_RAPID_COMPETITION_HOURS)
    ||(upper>=UPWORK_RAPID_CROWDING_TIER && upper<999 &&
      Number.isFinite(lastAgeHours) && lastAgeHours>=0 && lastAgeHours<=UPWORK_RAPID_COMPETITION_HOURS)
  );
  if(rapidCrowding)
    return {...base,eligible:false,known:true,reason:"rapid_early_competition"};
  // First snapshot taken minutes after posting can be deceptively empty.
  // Require independent measurements with enough time for competition to build,
  // even when the listing is already older than 90 minutes.
  if(ageHours*60<UPWORK_MIN_AGE_MINUTES)
    return {...base,eligible:false,known:upper!==999,reason:"too_new_to_assess_competition"};
  if((Number(obs.samples)||0)<2)
    return {...base,eligible:false,known:upper!==999,reason:"awaiting_second_snapshot"};
  if(!Number.isFinite(recentGapMinutes)||recentGapMinutes<UPWORK_MIN_OBSERVATION_GAP_MINUTES)
    return {...base,eligible:false,known:upper!==999,reason:"awaiting_recent_competition_trend"};
  if(!Number.isFinite(previousUpper))
    return {...base,eligible:false,known:false,reason:"awaiting_recent_baseline"};
  // Require a longer observation for an already busy 5-10 tier.
  if(upper>=10&&ageHours<1.5)
    return {...base,eligible:false,known:true,reason:"awaiting_older_low_competition"};
  // Reject stale or future-dated observations, never present them as current.
  if(!Number.isFinite(last)||last>now+60000||now-last>UPWORK_MAX_SNAPSHOT_AGE_MINUTES*60000)
    return {...base,eligible:false,known:upper!==999,reason:"competition_snapshot_stale"};
  if(upper===999||previousUpper===999)
    return {...base,eligible:false,known:false,reason:"proposal_count_unknown"};
  // A current plateau can be safe even if the job attracted applicants earlier.
  // A current rise is rejected, and the hard 49-proposal bound remains.
  if(upper>previousUpper)
    return {...base,eligible:false,known:true,reason:"competition_growing"};
  return {...base,eligible:true,known:true,reason:upper>19?"stable_moderate_competition":"stable_low_competition"};
}
export async function ensureUpworkCompetitionTable(env){
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS upwork_competition ("+
    "job_id TEXT PRIMARY KEY, url TEXT NOT NULL, published_at TEXT NOT NULL,"+
    "first_seen_at TEXT NOT NULL,last_seen_at TEXT NOT NULL,"+
    "first_upper INTEGER NOT NULL,last_upper INTEGER NOT NULL,samples INTEGER NOT NULL DEFAULT 1)"
  ).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_upwork_competition_url ON upwork_competition(url)").run();
  // Backward-compatible migration. Existing jobs need two subsequent fresh
  // observations before trusted delivery. No existing observations are deleted.
  const columns=(await env.DB.prepare("PRAGMA table_info(upwork_competition)").all()).results||[];
  if(!columns.some(c=>c.name==="previous_upper"))
    await env.DB.prepare("ALTER TABLE upwork_competition ADD COLUMN previous_upper INTEGER").run();
  if(!columns.some(c=>c.name==="previous_seen_at"))
    await env.DB.prepare("ALTER TABLE upwork_competition ADD COLUMN previous_seen_at TEXT").run();
}
export async function observeUpworkCompetition(env,job,now=Date.now()){
  const id=String(job.id||"").trim(),url=String(job.url||"").trim();
  const published_at=String(job.published_date||job.published_at||"");
  if(!/^\d{15,22}$/.test(id)||!/^https:\/\/(?:www\.)?upwork\.com\/jobs\//.test(url))
    return {verified:false,reason:"bad_id_or_url"};
  const upper=proposalTierUpper(job.proposals_tier),at=new Date(now).toISOString();
  let old=await env.DB.prepare("SELECT * FROM upwork_competition WHERE job_id=?").bind(id).first();
  if(!old){
    await env.DB.prepare("INSERT OR IGNORE INTO upwork_competition "+
      "(job_id,url,published_at,first_seen_at,last_seen_at,first_upper,last_upper,samples) "+
      "VALUES(?,?,?,?,?,?,?,1)").bind(id,url,published_at,at,at,upper,upper).run();
  }else{
    // Snapshot must reflect every latest source result, not wait 45 minutes.
    // This avoids evaluating an old "20 to 50" range after the listing hits 50+.
    await env.DB.prepare("UPDATE upwork_competition SET url=?,previous_seen_at=last_seen_at,previous_upper=last_upper,last_seen_at=?,last_upper=?,samples=samples+1 WHERE job_id=?")
      .bind(url,at,upper,id).run();
  }
  const latest=await env.DB.prepare("SELECT * FROM upwork_competition WHERE job_id=?").bind(id).first();
  // Current reported tier takes precedence over an older D1 snapshot.
  return upworkCompetitionDecision({...latest,last_upper:upper},now);
}
export async function verifiedUpworkCompetition(env,id,now=Date.now()){
  const obs=await env.DB.prepare("SELECT * FROM upwork_competition WHERE job_id=?").bind(String(id)).first();
  return upworkCompetitionDecision(obs,now);
}
