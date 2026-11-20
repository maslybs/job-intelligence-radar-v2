import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const examplePath = resolve("config/radar.config.example.json");
const privatePath = resolve(process.env.RADAR_CONFIG_FILE || "config/radar.config.json");
const output = resolve("src/config/radar.generated.js");
const validateOnly = process.argv.includes("--validate-example");
const raw = JSON.parse(readFileSync(validateOnly ? examplePath : (existsSync(privatePath) ? privatePath : examplePath), "utf8"));
// Compatibility aliases for the legacy Worker. New configuration is always split into jobs/leads.
// Never allow a lead-specific profile to leak into vacancy evaluations or vice versa.
const settings = { ...raw,
  profile: raw.jobs?.profile, search: raw.jobs?.criteria, sources: raw.jobs?.sources,
  reddit: raw.leads?.sources?.reddit, community: raw.leads?.sources?.community
};

function fail(field, detail) {
  throw new Error("Invalid radar configuration at " + field + ": " + detail);
}
function object(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(field, "must be an object");
  return value;
}
function text(value, field, limit = 1000, allowEmpty = false) {
  if (typeof value !== "string" || (!allowEmpty && !value.trim()) || value.length > limit) fail(field, "must be a non-empty string (max " + limit + ")");
  return value;
}
function number(value, field, min = 0, max = 1000000) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) fail(field, "outside permitted range");
  return value;
}
function strings(values, field, maxItems = 80, maxLength = 120) {
  if (!Array.isArray(values) || values.length > maxItems) fail(field, "must be an array of at most " + maxItems + " items");
  values.forEach((v, i) => text(v, field + "[" + i + "]", maxLength));
  return values;
}
function ensureHttps(url, field) {
  let parsed;
  try { parsed = new URL(url); } catch { fail(field, "invalid URL"); }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
      !host.includes(".") || /(^|\.)localhost$|(^|\.)local$|(^|\.)internal$|^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^169\.254\.|^0\./.test(host)) {
    fail(field, "public HTTPS URL required");
  }
}
function validate(config) {
  object(config, "root");
  if (config.schemaVersion !== 2) fail("schemaVersion", "expected 2");
  const jobs=object(config.jobs,"jobs");
  if(typeof jobs.enabled!=="boolean")fail("jobs.enabled","boolean required");
  const leads=object(config.leads,"leads");
  if(typeof leads.enabled!=="boolean")fail("leads.enabled","boolean required");
  if(!jobs.enabled&&!leads.enabled)fail("jobs/leads","at least one search mode must be enabled");
  const app=object(config.app,"app");
  text(app.publicBaseUrl,"app.publicBaseUrl",300,true);
  if(app.publicBaseUrl){ensureHttps(app.publicBaseUrl,"app.publicBaseUrl");if(new URL(app.publicBaseUrl).pathname!=="/")fail("app.publicBaseUrl","must be a base URL without a path");}
  const browserSources=object(jobs.browserSources,"jobs.browserSources");
  const douConfig=object(browserSources.dou,"jobs.browserSources.dou");
  if(typeof douConfig.enabled!=="boolean")fail("jobs.browserSources.dou.enabled","boolean required");
  if(!Array.isArray(douConfig.targets)||douConfig.targets.length>70)fail("jobs.browserSources.dou.targets","max 70 target queries");
  const douIds=new Set();
  douConfig.targets.forEach((item,i)=>{
    const key="jobs.browserSources.dou.targets["+i+"]";
    object(item,key);
    text(item.id,key+".id",70);
    text(item.query,key+".query",150);
    text(item.channel,key+".channel",60);
    if(!/^[a-z0-9_-]+$/i.test(item.id)||douIds.has(item.id))fail(key+".id","invalid or duplicate id");
    douIds.add(item.id);
  });
  if(douConfig.enabled&&!config.integrations?.dou?.enabled)fail("jobs.browserSources.dou.enabled","requires integrations.dou.enabled");
  if(!Array.isArray(jobs.directContactSources)||jobs.directContactSources.length>80)fail("jobs.directContactSources","max 80 entries");
  jobs.directContactSources.forEach((entry,i)=>{
    const key="jobs.directContactSources["+i+"]";object(entry,key);
    text(entry.name,key+".name",100);strings(entry.allowedHosts,key+".allowedHosts",25,200);
    entry.allowedHosts.forEach((host,j)=>{if(!/^[a-z0-9.-]+$/i.test(host)||host.startsWith(".")||!host.includes("."))fail(key+".allowedHosts["+j+"]","invalid hostname");});
  });
  if(jobs.sources.probes!==undefined){
    if(!Array.isArray(jobs.sources.probes)||jobs.sources.probes.length>80)fail("jobs.sources.probes","max 80 probes");
    jobs.sources.probes.forEach((pair,i)=>{
      if(!Array.isArray(pair)||pair.length!==2)fail("jobs.sources.probes["+i+"]","expected [label,url]");
      text(pair[0],"jobs.sources.probes["+i+"][0]",90);text(pair[1],"jobs.sources.probes["+i+"][1]",500);ensureHttps(pair[1],"jobs.sources.probes["+i+"][1]");
    });
  }
  const p = object(config.profile, "profile");
  for (const k of ["role", "summary", "country", "timezone", "englishLevel"]) text(p[k], "profile." + k, k === "summary" ? 2500 : 120);
  number(p.yearsExperience, "profile.yearsExperience", 0, 80);
  number(p.preferredHoursPerWeek, "profile.preferredHoursPerWeek", 1, 100);
  for (const k of ["skills", "provenExperience", "skillsToAvoidOverclaiming"]) strings(p[k], "profile." + k);
  const s = object(config.search, "search");
  if (typeof s.remoteOnly !== "boolean") fail("search.remoteOnly", "boolean required");
  for (const k of ["allowedRegions", "preferredEngagements", "preferredRoles", "includeKeywords", "excludeKeywords", "excludeIndustries", "excludeTechnologies"]) strings(s[k], "search." + k);
  object(s.marketplaceMinimums,"jobs.criteria.marketplaceMinimums");
  for(const [currency,amount]of Object.entries(s.marketplaceMinimums)){if(!/^[A-Z]{3}$/.test(currency))fail("jobs.criteria.marketplaceMinimums","invalid ISO currency code");number(amount,"jobs.criteria.marketplaceMinimums."+currency,0,10000000)}
  number(s.targetMonthlyUsd, "search.targetMonthlyUsd");
  number(s.minMonthlyUsd, "search.minMonthlyUsd");
  if (s.minMonthlyUsd > s.targetMonthlyUsd) fail("search", "minMonthlyUsd exceeds targetMonthlyUsd");
  number(s.maxAgeDays, "search.maxAgeDays", 1, 180);
  number(s.douMaxAgeDays, "search.douMaxAgeDays", 1, 180);
  number(s.minQualifiedScore, "search.minQualifiedScore", 0, 100);
  number(s.manualReviewScore, "search.manualReviewScore", 0, 100);
  number(s.p1Score,"search.p1Score",0,100);
  number(s.p1EmploymentScore,"search.p1EmploymentScore",0,100);
  number(s.contractExceptionScore,"search.contractExceptionScore",0,100);
  if(s.p1Score<s.minQualifiedScore||s.p1EmploymentScore<s.p1Score||s.contractExceptionScore>=s.minQualifiedScore)fail("search","priority thresholds inconsistent");
  if (s.manualReviewScore >= s.minQualifiedScore) fail("search", "review threshold must be below qualified threshold");
  text(s.customInstructions, "search.customInstructions", 3000, true);
  const sources = object(config.sources, "sources");
  if (sources.mode !== "replace") fail("sources.mode", "only replace is supported (no implicit hardcoded legacy sources)");
  if (!Array.isArray(sources.items) || sources.items.length > 200) fail("sources.items", "max 200 sources");
  strings(sources.inaccessibleHosts,"sources.inaccessibleHosts",100,150);
  const names = new Set();
  const supported = new Set(["rss", "remotive", "hn", "himalayas", "jobicy", "ashby", "greenhouse", "lever", "remoteok", "remotebackend", "freelancehunt"]);
  sources.items.forEach((item, i) => {
    const root = "sources.items[" + i + "]";
    object(item, root);
    text(item.name, root + ".name", 100);
    text(item.kind, root + ".kind", 30);
    if (!supported.has(item.kind)) fail(root + ".kind", "unsupported source adapter");
    if (names.has(item.name)) fail(root + ".name", "duplicate source name");
    names.add(item.name);
    number(item.hours, root + ".hours", 1, 168);
    if(item.fastMinutes!==undefined)number(item.fastMinutes,root+".fastMinutes",5,1440);
    if(item.forumHiring!==undefined&&typeof item.forumHiring!=="boolean")fail(root+".forumHiring","boolean required");
    if (["rss","remotebackend"].includes(item.kind)) { text(item.url, root + ".url", 500); ensureHttps(item.url, root + ".url"); }
    if (["ashby", "greenhouse", "lever"].includes(item.kind)) text(item.slug, root + ".slug", 100);
    if (item.kind === "himalayas") text(item.query, root + ".query", 200);
    if (item.kind === "jobicy") object(item.params, root + ".params");
    if (item.kind === "remoteok") text(item.tag, root + ".tag", 100);
    if (item.kind === "freelancehunt") text(item.skills, root + ".skills", 150);
  });
  const reddit = object(config.reddit, "reddit");
  if (typeof reddit.enabled !== "boolean") fail("reddit.enabled", "boolean required");
  if (!Array.isArray(reddit.expertiseLanes) || reddit.expertiseLanes.length > 50) fail("reddit.expertiseLanes", "invalid lanes");
  reddit.expertiseLanes.forEach((lane, i) => {
    const k = "reddit.expertiseLanes[" + i + "]";
    object(lane, k);
    text(lane.id, k + ".id", 80);
    text(lane.label, k + ".label", 200);
    text(lane.proof, k + ".proof", 1000);
    strings(lane.subs, k + ".subs");
    if (!Array.isArray(lane.searches) || lane.searches.length > 80) fail(k + ".searches", "invalid search pairs");
    lane.searches.forEach((pair, j) => {
      if (!Array.isArray(pair) || pair.length !== 2) fail(k + ".searches[" + j + "]", "expected [subreddit, search phrase]");
      strings(pair, k + ".searches[" + j + "]", 2);
    });
  });
  strings(reddit.strongShortQueries, "reddit.strongShortQueries", 200);
  for(const key of ["prioritySubreddits","problemSubreddits","highIntentSubreddits","hiringBoardTerms","deprioritizedCommunityTerms","excludedCommunityTerms"])strings(reddit[key],"reddit."+key,150,120);
  for (const k of ["seedSubreddits","seedSearches","intentPhrases","topicPhrases"]) strings(reddit[k], "reddit."+k, 300, 150);
  const community=object(config.community, "community");
  if(typeof community.enabled!=="boolean") fail("community.enabled", "boolean required");
  if(!Array.isArray(community.feeds)||community.feeds.length>100)fail("community.feeds","max 100 feeds");
  community.feeds.forEach((feed,i)=>{
    object(feed,"community.feeds["+i+"]");
    text(feed.name,"community.feeds["+i+"].name",100);
    text(feed.url,"community.feeds["+i+"].url",500);
    ensureHttps(feed.url,"community.feeds["+i+"].url");
    number(feed.hours,"community.feeds["+i+"].hours",1,168);
  });
  const leadProfile=object(leads.profile,"leads.profile");
  for(const key of ["role","valueProposition","contactStyle","language"])text(leadProfile[key],"leads.profile."+key,key==="valueProposition"?1800:350);
  for(const key of ["services","provenDeliveries","idealClientTypes","excludedServices","allowedRegions"])strings(leadProfile[key],"leads.profile."+key,100,400);
  const leadCriteria=object(leads.criteria,"leads.criteria");
  number(leadCriteria.minTechnicalFit,"leads.criteria.minTechnicalFit",0,100);
  number(leadCriteria.minCommercialScore,"leads.criteria.minCommercialScore",0,100);
  number(leadCriteria.maxAgeDays,"leads.criteria.maxAgeDays",1,180);
  if(typeof leadCriteria.requireVerifiedBuyerEvidence!=="boolean")fail("leads.criteria.requireVerifiedBuyerEvidence","boolean required");
  strings(leadCriteria.excludeKeywords,"leads.criteria.excludeKeywords",100,100);
  text(leadCriteria.customInstructions,"leads.criteria.customInstructions",2000,true);
  const leadSources=object(leads.sources,"leads.sources");
  strings(leadSources.inaccessibleHosts,"leads.sources.inaccessibleHosts",100,150);
  if(leadSources.reddit!==reddit||leadSources.community!==community)fail("leads.sources","reddit/community config aliases mismatch");
  const integrations=object(config.integrations,"integrations");
  const oneaihub=object(integrations.oneaihub,"integrations.oneaihub");
  if(typeof oneaihub.enabled!=="boolean")fail("integrations.oneaihub.enabled","boolean required");
  const browser=object(oneaihub.browser,"integrations.oneaihub.browser");
  const computer=object(oneaihub.computer,"integrations.oneaihub.computer");
  for(const [k,v] of [["browser.enabled",browser.enabled],["computer.enabled",computer.enabled],["computer.allowFilesystem",computer.allowFilesystem],["computer.allowCommands",computer.allowCommands]])
    if(typeof v!=="boolean")fail("integrations.oneaihub."+k,"boolean required");
  if(!oneaihub.enabled&&(browser.enabled||computer.enabled||computer.allowFilesystem||computer.allowCommands))
    fail("integrations.oneaihub","disabled integration may not enable browser or computer access");
  if(!computer.enabled&&(computer.allowFilesystem||computer.allowCommands))fail("integrations.oneaihub.computer","computer permissions require enabled=true");
  text(oneaihub.endpointPath,"integrations.oneaihub.endpointPath",160,true);
  if(oneaihub.endpointPath&&!/^\/[a-z0-9_/-]+$/i.test(oneaihub.endpointPath))fail("integrations.oneaihub.endpointPath","invalid private MCP path");
  if(oneaihub.onUnavailable!=="skip_optional_sources")fail("integrations.oneaihub.onUnavailable","expected skip_optional_sources");
  const dou=object(integrations.dou,"integrations.dou");
  if(typeof dou.enabled!=="boolean")fail("integrations.dou.enabled","boolean required");
  if(dou.enabled&&(!oneaihub.enabled||!browser.enabled))fail("integrations.dou","DOU browser requires optional OneAIHub browser");
  if(reddit.enabled&&(!leads.enabled||!oneaihub.enabled||!browser.enabled))fail("leads.sources.reddit","Reddit browser requires enabled leads and OneAIHub browser");
  const ai = object(config.ai, "ai");
  text(ai.model, "ai.model", 150);
  number(ai.dailyEvaluationLimit, "ai.dailyEvaluationLimit", 1, 10000);
  number(ai.dailyProspectLimit,"ai.dailyProspectLimit",1,ai.dailyEvaluationLimit);
  const n = object(config.notifications, "notifications");
  for (const k of ["telegramEnabled", "onlyQualified"]) if (typeof n[k] !== "boolean") fail("notifications." + k, "boolean required");
  const telegram=object(n.telegram,"notifications.telegram");
  for(const property of ["expectedBotUsername","expectedChatTitle"])text(telegram[property],"notifications.telegram."+property,140,true);
  strings(telegram.allowedChatTypes,"notifications.telegram.allowedChatTypes",4,15);
  const validChatTypes=new Set(["supergroup","group","private","channel"]);
  if(!telegram.allowedChatTypes.length||telegram.allowedChatTypes.some(x=>!validChatTypes.has(x)))fail("notifications.telegram.allowedChatTypes","invalid Telegram chat types");
  text(n.language, "notifications.language", 10);
  text(n.timezone, "notifications.timezone", 100);
  if (!Array.isArray(n.telegramDigestHours) || n.telegramDigestHours.length > 24) fail("notifications.telegramDigestHours", "must be hours");
  n.telegramDigestHours.forEach((hour, i) => number(hour, "notifications.telegramDigestHours[" + i + "]", 0, 23));
  const secretKeys = /^(?:api[_-]?key|private[_-]?key|secret|password|token|access[_-]?token|bot[_-]?token)$/i;
  function checkSecrets(value, path = "root") {
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      if (secretKeys.test(key)) fail(path + "." + key, "credentials are Cloudflare secrets, not source config");
      checkSecrets(nested, path + "." + key);
    }
  }
  checkSecrets(config);
  return config;
}
validate(settings);
if (!validateOnly) {
  mkdirSync(resolve("src/config"), {recursive: true});
  writeFileSync(output, "// Generated locally; ignored by Git. Do not edit by hand.\nexport const RADAR_SETTINGS = Object.freeze(" + JSON.stringify(settings, null, 2) + ");\n");
}
console.log(JSON.stringify({valid: true, mode: validateOnly ? "public-example" : (existsSync(privatePath) ? "private" : "public-example"), configured_sources: settings.jobs.sources.items.length, reddit_lanes: settings.leads.sources.reddit.expertiseLanes.length, leads_enabled: settings.leads.enabled, oneaihub_enabled: settings.integrations.oneaihub.enabled, output_generated: !validateOnly}));
