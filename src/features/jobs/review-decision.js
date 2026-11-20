import {RADAR_SETTINGS} from "../../config/radar.generated.js";
// Contract and full-time review eligibility: production-compatible semantics.
export function reviewDecision(x) {
  if (x.kind !== "buyer" || x.geo !== "allowed" || !["contract","fulltime"].includes(x.engagement) || x.state !== "filtered" || Number(x.score) < RADAR_SETTINGS.search.manualReviewScore || Number(x.score) >= RADAR_SETTINGS.search.minQualifiedScore || String(x.source).startsWith("Upwork")) return null;
  const posted = Date.parse(x.published_at || "");
  if (!Number.isFinite(posted) || Date.now() - posted > (x.engagement==="fulltime"?14*24:72) * 36e5 || posted > Date.now() + 30 * 6e4) return null;
  const d = String(x.description || "");
  const risks = [];
  if (String(x.source).startsWith("Freelancehunt")) {
    const match = d.match(/Заявок:\s*(\d+)/), bids = match ? Number(match[1]) : null;
    if (bids === null || bids > 35) return null;
    if (bids > 15) risks.push("\u0412\u0438\u0441\u043E\u043A\u0430 \u043A\u043E\u043D\u043A\u0443\u0440\u0435\u043D\u0446\u0456\u044F: " + bids + " \u0437\u0430\u044F\u0432\u043E\u043A \u043F\u0440\u0438 \u0432\u0438\u044F\u0432\u043B\u0435\u043D\u043D\u0456");
    const budget = d.match(/Бюджет:\s*(\d+(?:[.,]\d+)?)\s*(UAH|USD|EUR)/i);
    if (budget) {
      const amount = Number(budget[1].replace(",", ".")), ccy = budget[2].toUpperCase();
      if (ccy === "UAH" && amount < 6500 || ccy === "USD" && amount < 180 || ccy === "EUR" && amount < 180) return null;
      risks.push("\u0423\u0442\u043E\u0447\u043D\u0438\u0442\u0438 \u043E\u0431\u0441\u044F\u0433 \u0440\u043E\u0431\u0456\u0442 \u0449\u043E\u0434\u043E \u0431\u044E\u0434\u0436\u0435\u0442\u0443 " + amount + " " + ccy);
    } else risks.push("\u0411\u044E\u0434\u0436\u0435\u0442 \u043D\u0435 \u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043D\u043E");
    const completed = d.match(/Історія замовника:\s*(\d+) завершених/);
    if (completed && Number(completed[1]) === 0) risks.push("\u041D\u0435\u043C\u0430\u0454 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u0445 \u043F\u0440\u043E\u0454\u043A\u0442\u0456\u0432 \u0443 \u0437\u0430\u043C\u043E\u0432\u043D\u0438\u043A\u0430");
    const negative = d.match(/(\d+) негативних відгуків/i);
    if (negative && Number(negative[1]) >= 2) return null;
  } else risks.push("\u041F\u043E\u0442\u0440\u0456\u0431\u043D\u043E \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u0438 \u0431\u044E\u0434\u0436\u0435\u0442 \u0442\u0430 \u043A\u043E\u043D\u0442\u0440\u0430\u043A\u0442\u043D\u0456 \u0443\u043C\u043E\u0432\u0438");
  const r = String(x.reason || "");
  if (/(?:неоплачуван(?:е|ий|і)|скам|шахрай|передоплат|безкоштовн.{0,12}тест)/i.test(r)) return null;
  return { risks };
}
