import {RADAR_SETTINGS} from "../../config/radar.generated.js";
// Deterministic hard-stop for explicit country/citizenship restrictions.
// Client's country and a US time-zone preference are NOT applicant restrictions.
export function upworkLocationEligibility(input={},settings=RADAR_SETTINGS) {
 const description=String(input.description||"");
 const screening=(input.screening_questions||[]).map(x=>typeof x==="string"?x:JSON.stringify(x)).join(" ");
 const parts=[description,screening,JSON.stringify(input.freelancer_preferences||{}),JSON.stringify(input.job_preferences||{})];
 const s=parts.join(" ").replace(/\s+/g," ");
 const patterns=[
  /\b(?:us|usa|u\.s\.|united states|canada|uk|united kingdom|india|australia)\s*[- ](?:only|residents?|citizens?|based\b(?!\s+(?:company|client|business|agency|startup|team|firm|organization)\b))/i,
  /\b(?:only|exclusively)\s+(?:candidates?|freelancers?|applicants?|contractors?|developers?|people|workers?)\s+(?:based|located|living|residing|from|in)\s+(?:the\s+)?(?:us|usa|u\.s\.|united states|canada|uk|united kingdom|india|australia)\b/i,
  /\b(?:must|required to)\s+(?:be\s+)?(?:based|located|reside|live|work|physically present)\s+in\s+(?:the\s+)?(?:us|usa|u\.s\.|united states|canada|uk|united kingdom|india|australia)\b/i,
  /\b(?:us|u\.s\.|american|canadian|british|eu)\s+(?:citizenship|citizens?|residency|residents?)(?:\s+(?:only|required))?\b/i,
  /\b(?:eu|european union|eea)\s*(?:only|residents?|citizens?|based|location|required)\b/i,
  /\b(?:only|must)\s+(?:be\s+)?(?:in|from|within|based in|located in)\s+(?:the\s+)?(?:eu|european union|eea)\b/i,
  /\b(?:us[- ]only|us[- ]based|north america only|no international applicants|no overseas contractors|domestic applicants only|w[- ]?2 only|security clearance required|itar restricted|onsite only|on-site only)\b/i
 ];
 const hit=patterns.map(p=>s.match(p)?.[0]).find(Boolean);
 // Parse the applicant's configured country instead of assuming a particular
 // country, citizenship, region or time zone in this reusable library.
 const country=String(settings.jobs?.profile?.country||settings.profile?.country||"");
 const norm=value=>String(value||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
 const canonical=value=>{
   const v=norm(value);
   const alias={"us":"united states","usa":"united states","u s":"united states",
     "uk":"united kingdom","u k":"united kingdom","eu":"europe",
     "european union":"europe","eea":"europe"};
   if(alias[v])return alias[v];
   if(/^[a-z]{2}$/.test(v)){
     try{return norm(new Intl.DisplayNames(["en"],{type:"region"}).of(v.toUpperCase()))}catch{}
   }
   return v;
 };
 const applicant=canonical(country);
 const euCountries=new Set(["austria","belgium","bulgaria","croatia","cyprus",
   "czechia","denmark","estonia","finland","france","germany","greece",
   "hungary","ireland","italy","latvia","lithuania","luxembourg","malta",
   "netherlands","poland","portugal","romania","slovakia","slovenia",
   "spain","sweden"]);
 const approved=new Set([applicant].filter(Boolean));
 if(euCountries.has(applicant))approved.add("europe");
 const territory=hit?.match(/\b(?:united states|usa|u\.s\.|us|canada|united kingdom|uk|india|australia|eu|european union|eea)\b/i)?.[0]||"";
 const strict=Boolean(hit&&/\b(?:citizen|citizenship|w[- ]?2|security clearance|itar|no overseas contractors|onsite only|on-site only)\b/i.test(hit));
 const locationBlocked=Boolean(hit&&(strict||!territory||!approved.has(canonical(territory))));
 // Structured allowlists are independent of free-text wording. "Worldwide"
 // in applicant preferences never overrides an actual employer restriction.
 const preference=input.freelancer_preferences||{};
 const listed=preference.allowedCountries||preference.allowed_countries||preference.countries;
 const countries=Array.isArray(listed)?listed.map(x=>canonical(typeof x==="string"?x:String(x?.code||x?.name||""))):[];
 const onlyCountries=countries.length>0&&preference.allCountries!==true;
 const applicantAllowed=Boolean(applicant&&countries.includes(applicant));
 return {eligible:!locationBlocked&&(!onlyCountries||applicantAllowed),
   reason:locationBlocked?"explicit_country_restriction":onlyCountries&&!applicantAllowed?
     "structured_country_allowlist_excludes_applicant":"no_explicit_restriction",
   evidence:hit?String(hit).slice(0,110):""};
}
