// Source-specific RSS/API fetch adapters.
// Extracted from the production-compatible Worker without modifying the bodies.
import { fetchLimited,readLimitedResponse } from "./fetch-limited.js";
import {backendBoardJobs} from "./remote-backend-source.js";
import {RADAR_SETTINGS} from "../../config/radar.generated.js";
import { locations, sourceDate, tag, text, urlClean } from "../../platform/runtime-utils.js";

export function parseRss(raw, source) {
  const out = [];
  for (const x of raw.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const b = x[1], title = tag(b, "title"), url = urlClean(tag(b, "link") || tag(b, "guid"));
    if(title&&url){
      const summary=tag(b,"description");
      const full="";
      out.push({title,url,source,description:(full||summary).slice(0,3200),
        date:sourceDate(tag(b,"pubDate")||tag(b,"date")),company:"",region:""});
    }
  }
  for (const x of raw.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)) {
    const b = x[1], title = tag(b, "title"), url = urlClean(b.match(/<link\b[^>]*href=["']([^"']+)["']/i)?.[1]);
    if (title && url) out.push({ title, url, source, description: tag(b, "summary").slice(0, 2100), date: sourceDate(tag(b, "published") || tag(b, "updated")), company: "", region: "" });
  }
  return out;
}

export async function fetchSource(s, env) {
  if (s.kind === "rss") return parseRss(await fetchLimited(s.url), s.name);
  if(s.kind==="remotebackend"){
    const rows=JSON.parse(await fetchLimited(
      s.url));
    return backendBoardJobs(rows,s.name);
  }
  if (s.kind === "freelancehunt") {
    if (!env?.FREELANCEHUNT_TOKEN) throw Error("Missing FREELANCEHUNT_TOKEN secret");
    const jobs = [];
    for (let page = 1; page <= 2; page++) {
      const params = new URLSearchParams({ "filter[skill_id]": s.skills, "page[number]": String(page) });
      const endpoint = "https://api.freelancehunt.com/v2/projects?" + params;
      const r = await fetch(endpoint, {
        headers: {
          Authorization: "Bearer " + env.FREELANCEHUNT_TOKEN,
          Accept: "application/json",
          "Accept-Language": "uk",
          "User-Agent": "Job Intelligence Radar (public API client)"
        },
        signal: AbortSignal.timeout(12500),redirect:"error"
      });
      if (!r.ok) throw Error("Freelancehunt API HTTP " + r.status);
      const payload = JSON.parse(await readLimitedResponse(r));
      if (!Array.isArray(payload.data)) throw Error("Freelancehunt API response missing projects");
      for (const entry of payload.data) {
        const a = entry.attributes || {}, name = String(a.name || "").trim();
        const url = urlClean(entry.links?.self?.web);
        if (!name || !url || Number(a.status?.id) !== 11 || a.is_personal || a.is_only_for_plus) continue;
        const description = text(a.description || a.description_html || "");
        if (description.length < 110) continue;
        const budget = a.budget, amount = Number(budget?.amount || 0), currency = String(budget?.currency || "").toUpperCase();
        if(amount>0&&Number(RADAR_SETTINGS.jobs.criteria.marketplaceMinimums[currency]||0)>amount)continue;
        const budgetText = amount > 0 ? amount + " " + currency : "\u043D\u0435 \u0432\u043A\u0430\u0437\u0430\u043D\u043E";
        const bids = Math.max(0, Number(a.bid_count) || 0);
        const employer = a.employer || {};
        const completed = Math.max(0, Number(employer.completed_projects) || 0);
        const positive = Math.max(0, Number(employer.positive_reviews) || 0);
        const negative = Math.max(0, Number(employer.negative_reviews) || 0);
        const postedMs = Date.parse(a.published_at);
        const ageHours = Number.isFinite(postedMs) ? Math.max(0, Math.round((Date.now() - postedMs) / 36e5)) : null;
        const clientInfo = employer.completed_projects == null ? "\u0406\u0441\u0442\u043E\u0440\u0456\u044F \u0437\u0430\u043C\u043E\u0432\u043D\u0438\u043A\u0430 \u043D\u0435 \u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043D\u0430. " : "\u0406\u0441\u0442\u043E\u0440\u0456\u044F \u0437\u0430\u043C\u043E\u0432\u043D\u0438\u043A\u0430: " + completed + " \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u0445 \u043F\u0440\u043E\u0454\u043A\u0442\u0456\u0432, " + positive + " \u043F\u043E\u0437\u0438\u0442\u0438\u0432\u043D\u0438\u0445 / " + negative + " \u043D\u0435\u0433\u0430\u0442\u0438\u0432\u043D\u0438\u0445 \u0432\u0456\u0434\u0433\u0443\u043A\u0456\u0432. ";
        const note = "\u0411\u044E\u0434\u0436\u0435\u0442: " + budgetText + ". \u0422\u0438\u043F: \u0437\u0430\u043C\u043E\u0432\u043B\u0435\u043D\u043D\u044F Freelancehunt. \u0417\u0430\u044F\u0432\u043E\u043A: " + bids + (ageHours === null ? "" : ". \u0412\u0456\u043A: " + ageHours + " \u0433\u043E\u0434") + ". " + clientInfo;
        jobs.push({
          title: name,
          url,
          source: s.name,
          company: "Freelancehunt \xB7 " + String(entry.id),
          description: (note + description).slice(0, 2400),
          date: sourceDate(a.published_at),
          region: a.is_remote_job ? "Remote job (Freelancehunt)" : "Freelancehunt project; location not specified"
        });
      }
      if (!payload.links?.next || !payload.data.length) break;
    }
    return jobs;
  }
  if (s.kind === "greenhouse") {
    const j = JSON.parse(await fetchLimited("https://boards-api.greenhouse.io/v1/boards/" + encodeURIComponent(s.slug) + "/jobs?content=true"));
    return (j.jobs || []).map((x) => ({ title: x.title || "", url: urlClean(x.absolute_url), source: s.name, description: text(x.content || "").slice(0, 2400), date: x.updated_at, company: s.name, region: x.location?.name || "" }));
  }
  if (s.kind === "lever") {
    const j = JSON.parse(await fetchLimited("https://api.lever.co/v0/postings/" + encodeURIComponent(s.slug) + "?mode=json"));
    return (j || []).map((x) => ({ title: x.text || "", url: urlClean(x.hostedUrl), source: s.name, description: text(x.descriptionPlain || "").slice(0, 2400), date: x.createdAt ? new Date(x.createdAt).toISOString() : "", company: s.name, region: x.categories?.location || "" }));
  }
  if (s.kind === "ashby") {
    const j = JSON.parse(await fetchLimited("https://api.ashbyhq.com/posting-api/job-board/" + encodeURIComponent(s.slug)));
    return (j.jobs || []).filter((x) => x.isListed !== false).map((x) => ({ title: x.title || "", url: urlClean(x.jobUrl), source: s.name, description: text(x.descriptionPlain || "").slice(0, 2400), date: x.publishedAt, company: s.name, region: x.location || "" }));
  }
  if (s.kind === "remoteok") {
    const items = JSON.parse(await fetchLimited("https://remoteok.com/api?" + new URLSearchParams({ tag: s.tag || "dev" })));
    if (!Array.isArray(items)) throw Error("Remote OK API did not return jobs array");
    return items.filter((x) => x?.position && x?.url).map((x) => ({
      title: String(x.position),
      url: urlClean(x.url),
      source: s.name,
      company: String(x.company || ""),
      description: (text(x.description || "") + " Tags: " + (x.tags || []).join(", ")).slice(0, 2300),
      date: sourceDate(x.epoch || x.date),
      region: String(x.location || "")
    }));
  }
  if (s.kind === "jobicy") {
    const qs = new URLSearchParams({ count: "100", ...s.params || {} });
    const j = JSON.parse(await fetchLimited("https://jobicy.com/api/v2/remote-jobs?" + qs));
    return (j.jobs || []).map((x) => ({
      title: x.jobTitle || "",
      url: urlClean(x.url),
      source: s.name,
      company: x.companyName || "",
      description: (text(x.jobDescription || x.jobExcerpt || "") + " Employment: " + (x.jobType || []).join(", ")).slice(0, 2300),
      region: x.jobGeo || "",
      date: sourceDate(x.pubDate)
    }));
  }
  if (s.kind === "himalayas") {
    const qs = new URLSearchParams({ q: s.query || "backend", sort: "recent", page: "1" });
    const j = JSON.parse(await fetchLimited("https://himalayas.app/jobs/api/search?" + qs));
    return (j.jobs || []).map((x) => ({
      title: x.title || "",
      url: urlClean(x.applicationLink),
      source: s.name,
      company: x.companyName || "",
      description: (text(x.description || x.excerpt || "") + " Employment: " + (x.employmentType || "") + " Location requirements: " + (locations(x.locationRestrictions) || "Worldwide")).slice(0, 2300),
      region: locations(x.locationRestrictions) || "Worldwide",
      date: sourceDate(x.pubDate)
    }));
  }
  if (s.kind === "remotive") {
    const j = JSON.parse(await fetchLimited("https://remotive.com/api/remote-jobs?category=software-dev"));
    return (j.jobs || []).slice(0, 180).map((x) => ({ title: x.title, url: urlClean(x.url), source: s.name, description: text(x.description).slice(0, 2100), company: x.company_name || "", region: x.candidate_required_location || "", date: x.publication_date }));
  }
  if (s.kind === "hn") {
    const month = (/* @__PURE__ */ new Date()).toLocaleDateString("en-US", { timeZone: RADAR_SETTINGS.notifications.timezone, month: "long", year: "numeric" });
    const search = await fetchLimited("https://hn.algolia.com/api/v1/search?" + new URLSearchParams({ query: "Who is hiring? (" + month + ")", tags: "story", hitsPerPage: "15" }));
    const story = (JSON.parse(search).hits || []).find((x) => (x.title || "").toLowerCase().includes("who is hiring") && (x.title || "").toLowerCase().includes(month.toLowerCase()));
    if (!story) return [];
    const data = JSON.parse(await fetchLimited("https://hn.algolia.com/api/v1/search?" + new URLSearchParams({ tags: "comment,story_" + story.objectID, hitsPerPage: "200" })));
    return (data.hits || []).map((x) => ({ title: text(x.comment_text).slice(0, 140), url: "https://news.ycombinator.com/item?id=" + x.objectID, source: s.name, description: text(x.comment_text).slice(0, 2100), date: x.created_at, company: "", region: "" })).filter((x) => x.title);
  }
  return [];
}

export const PROBE_FEEDS = RADAR_SETTINGS.jobs.sources.probes || [];
