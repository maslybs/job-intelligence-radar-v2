// Delivery rules for explicit publicly offered Reddit software jobs.
// Unlike a forum troubleshooting lead, a direct job offer does not require a
// comment reply to be a legitimate opportunity. If thread replies cannot
// be inspected, always say so and do not imply low competition or open hiring.
const direct=/^(?:\s*\[(?:hiring|paid|job opportunity|contract|gig)\]|\s*(?:hiring|seeking|looking for|need(?:ing)?)\b.*\b(?:developer|engineer|specialist|consultant|programmer|freelancer|contractor|AI|automation))/i;
const notOffer=/(?:\[(?:for hire|available)\]|^\s*(?:i am|i'm|we are)\s+(?:available|offering)|\b(?:hire me|looking for work|offering my services)\b)/i;
const undesirable=/(?:\b(?:profit.share only|unpaid|equity only|volunteer|revenue.share only|commission only|internship unpaid)\b)/i;
export function redditDirectOffer(job,review){
 if(!job||!String(job.source||"").startsWith("Reddit"))return null;
 if(job.kind!=="buyer"||Number(job.score)<85||String(job.geo)==="restricted")return null;
 if(!["contract","fulltime"].includes(String(job.engagement)))return null;
 const title=String(job.title||""),body=String(job.description||"");
 if(notOffer.test(title)||undesirable.test(title+" "+body)||!direct.test(title))return null;
 if(review&&["answered","resolved","promotional","crowded"].includes(review.status))return null;
 if(review&&review.competition==="high")return null;
 return {
  allowed:true,
  commentsVerified:review?.status==="credible"&&
    Number.isInteger(Number(review.comments_observed))&&review.comments_observed!==null,
  warning:(!review||!["credible"].includes(review.status))
   ?"Коментарі Reddit не вдалося достовірно перевірити; актуальність найму та конкуренція невідомі."
   :"Стан найму й приватні заявки можуть відрізнятися від видимих коментарів."
 };
}
