// Stable Cloudflare Workflow entrypoint. Domain actions live in workflows/actions/.
import {WorkflowEntrypoint} from "cloudflare:workers";
import {WORKFLOW_ACTIONS} from "./action-registry.js";

export class ManualRadarWorkflow extends WorkflowEntrypoint {
  async run(event,step) {
    const env=this.env,action=String(event.payload?.action||"");
    if(action.startsWith("upwork_"))return {state:"disabled",reason:"source_retired"};
    const handler=WORKFLOW_ACTIONS[action];
    if(!handler)return {state:"unknown_action"};
    const opts={retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"15 minutes"};
    return handler({env,step,event,action,opts});
  }
}
