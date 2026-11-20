// Exact action-to-handler map. Names are a compatibility contract for Telegram,
// Cron, manual admin API and existing Cloudflare Workflows.
import { executeHourlyHealthAuditAction, executeDouBootstrapAction, executeFastSourcesAction, executeHourlyPipelineAction, executeHourlyRecoveryAction, executeSourceAuditOnceAction, executeProbeNewFeedsAction } from "./actions/scheduler.js";
import { executeOpportunityReviewAction, executeOpportunityScorecardAction, executeOpportunityBenchmarkSeedAction, executeDouReviewAction, executeDirectContactReviewAction, executeActionableReviewAction, executeEligibilityReviewAction, executeJobDetailPreviewAction, executeScanAction } from "./actions/jobs.js";
import { executeManualLeadsReviewAction, executeCommunityScanAction, executeCommunityReplyAuditAction, executeProspectNotifyAction, executeDemandPreviewAction, executeProspectTriageAction, executeRedditAction, executeAssessRedditAction } from "./actions/leads.js";
import { executeInspectWebhookAction, executeDeliverVerifiedAction, executeLeadsPreviewAction, executeRefreshCommandsAction, executeConfigureWebhookAction, executeTestDeliveryAction } from "./actions/telegram.js";

export const WORKFLOW_ACTIONS = Object.freeze({
  "hourly_health_audit": executeHourlyHealthAuditAction,
  "opportunity_review": executeOpportunityReviewAction,
  "opportunity_scorecard": executeOpportunityScorecardAction,
  "opportunity_benchmark_seed": executeOpportunityBenchmarkSeedAction,
  "dou_review": executeDouReviewAction,
  "dou_bootstrap": executeDouBootstrapAction,
  "fast_sources": executeFastSourcesAction,
  "hourly_pipeline": executeHourlyPipelineAction,
  "hourly_recovery": executeHourlyRecoveryAction,
  "direct_contact_review": executeDirectContactReviewAction,
  "direct_contact_preview": executeDirectContactReviewAction,
  "actionable_review": executeActionableReviewAction,
  "actionable_preview": executeActionableReviewAction,
  "manual_leads_review": executeManualLeadsReviewAction,
  "manual_leads_preview": executeManualLeadsReviewAction,
  "eligibility_review": executeEligibilityReviewAction,
  "eligibility_preview": executeEligibilityReviewAction,
  "source_audit_once": executeSourceAuditOnceAction,
  "community_scan": executeCommunityScanAction,
  "job_detail_preview": executeJobDetailPreviewAction,
  "community_reply_audit": executeCommunityReplyAuditAction,
  "prospect_notify": executeProspectNotifyAction,
  "demand_preview": executeDemandPreviewAction,
  "demand_digest": executeDemandPreviewAction,
  "prospect_triage": executeProspectTriageAction,
  "probe_new_feeds": executeProbeNewFeedsAction,
  "inspect_webhook": executeInspectWebhookAction,
  "test_delivery": executeTestDeliveryAction,
  "deliver_verified": executeDeliverVerifiedAction,
  "leads_preview": executeLeadsPreviewAction,
  "refresh_commands": executeRefreshCommandsAction,
  "configure_webhook": executeConfigureWebhookAction,
  "scan": executeScanAction,
  "reddit": executeRedditAction,
  "assess_reddit": executeAssessRedditAction,
});
