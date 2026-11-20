// Commercial prospect triage and delivery coordination.
// Extracted from the production-compatible Worker without modifying the bodies.
import {ensureProspectTable,prospectStats,assessExistingRedditProspects,getProspectsForReview,markProspectsNotified} from "./prospect-intelligence.js";
import {MODEL,DAILY_AI_LIMIT,TGT} from "../../config/constants.js";
import { deliverAllVerified } from "../delivery/notification-service.js";
import { kyivDay } from "../../platform/runtime-utils.js";

export async function runProspectTriage(env) {
  const result=await assessExistingRedditProspects(env,{model:MODEL,day:kyivDay(),limit:7});
  const delivery=await deliverAllVerified(env);
  return {result,delivery};
}
