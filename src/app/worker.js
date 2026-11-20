// Stable Cloudflare composition root; no application logic belongs here.
import {scheduled} from "../scheduler/scheduled-handler.js";
import {handleFetch} from "../http/router.js";
export {ManualRadarWorkflow} from "../workflows/manual-radar.js";
export {RedditMcpWorkflow} from "../features/reddit/reddit-mcp-workflow.js";
export {DouBrowserWorkflow} from "../features/dou/dou-browser-workflow.js";
export default {scheduled,fetch:handleFetch};
