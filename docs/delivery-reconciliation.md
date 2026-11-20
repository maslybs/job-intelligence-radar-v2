# Telegram delivery reconciliation

The delivery outbox is at-most-once for ambiguous results. Telegram HTTP 429 is
an explicit rejection (no message accepted), so only this status becomes
retryable. The retry schedule honors Telegram retry_after and permits up to
five retries. Subsequent scheduled candidate-delivery passes attempt an atomic
reclaim of a due retry. No separate hourly resend loop is required.

A failed network request, unparseable success response, or D1 acknowledgement
failure is ambiguous: the outbox retains uncertain and will never resend
automatically. Other explicit HTTP 4xx errors become rejected, also requiring
operator intervention. On success the outbox is sent with message_id.

Check incidents via the existing admin token (never store the token in Git):

    GET /admin/telegram/delivery-issues
    Authorization: Bearer YOUR_ADMIN_TOKEN

For uncertain or old sending records, inspect the destination chat for the
original message and correlate with time, destination, and delivery key. Do
not automatically clear the outbox, delete an outbox record, or re-send an
unconfirmed message. A manual resend is a separate, explicitly authorized
operation only after checking it cannot duplicate the original. For retries
exhausted by repeated 429, inspect attempts and next_retry_at values
and the Telegram API rate-limit status before planning any manual recovery.

The admin endpoint is read-only and contains no bot credentials.
The new migration is additive and never updates pre-existing outbox rows.
