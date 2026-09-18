# 17 — Notification Architecture

## 17.1 NotificationService Abstraction

```
interface NotificationChannel {
  send(recipient, templateKey, locale, payload): NotificationResult
}

class EmailChannel implements NotificationChannel { ... }   // V1 — mandatory
class SmsChannel implements NotificationChannel { ... }     // V1 — critical transactional only
class WhatsAppChannel implements NotificationChannel { ... } // V2 — not built yet
class PushChannel implements NotificationChannel { ... }     // V2 — not built yet (no native app in V1 anyway)
```

`NotificationService` receives a domain event (e.g. `BookingConfirmed`) and resolves: which template, which channel(s) for this event type, the recipient's locale (`20_I18N.md`), and writes a `Notification` row (`09_DOMAIN_MODEL.md`) recording what was sent/attempted — this record is what powers customer support's "did the user actually get this email" troubleshooting and prevents duplicate-send bugs from going unnoticed.

## 17.2 V1 Channel Decisions (cost-driven, per the brief's explicit "not all channels mandatory, pick lowest-cost for V1" instruction)

| Channel | V1 status | Reasoning |
|---|---|---|
| Email | **Mandatory, built V1** | Cheapest channel by a wide margin (`23_COST_MODEL.md` — fractions of a cent per email at V1 volume), required for receipts/invoices regardless of anything else |
| SMS | **Built V1, used selectively** | Needed for OTP/passwordless auth and the highest-stakes transactional moments (booking confirmed, booking cancelled by provider, payment failed) where email's delivery/open-rate isn't reliable enough — but *not* for every notification type, since SMS costs meaningfully more per message than email (`23_COST_MODEL.md` §5.5) |
| WhatsApp Business API | **Deferred to V2** | Real user-experience upside in this region, but requires WhatsApp Business API approval/setup and has its own per-conversation pricing — added complexity and cost not justified before the core product proves out |
| Push notification | **Deferred to V2** | No native mobile app in V1 (`01_PRODUCT_REQUIREMENTS.md` explicit out-of-scope) — web push has weak adoption/reliability and isn't worth building before a real app exists |

## 17.3 Event → Channel Matrix (V1)

### Customer-facing

| Event | Email | SMS |
|---|---|---|
| Booking created (payment pending) | — | — |
| Booking confirmed | ✅ | ✅ |
| Booking reminder (e.g. 24h and/or 1h before) | ✅ | ✅ (short-window reminder only, to control cost) |
| Booking cancelled | ✅ | ✅ |
| Payment failed | ✅ | — (retry is usually same-session; email is enough, SMS for this would be over-notifying) |
| Refund processed | ✅ | — |
| Review request (post-completion) | ✅ | — |

### Provider-facing

| Event | Email | SMS |
|---|---|---|
| New booking received | ✅ | ✅ (time-sensitive — provider needs to know quickly if they need to prep the room) |
| Booking cancellation | ✅ | ✅ |
| Payment received (ledger credit) | ✅ | — |
| Upcoming booking reminder | ✅ | — |

This matrix is config, not code — an admin-configurable table (`24_ADMIN_ARCHITECTURE.md`) so channel choices can be tuned post-launch based on actual SMS cost/volume without a deployment.

## 17.4 Content & Localization

Every template is a **translation-key-driven template** (`20_I18N.md`) resolved to the recipient's stored locale preference at send time — never a hardcoded-language string. Templates include booking details (room name, provider, time, price breakdown matching exactly what was shown in-app, `07_UX_ARCHITECTURE.md` §7.5) and are versioned so a template change doesn't retroactively alter the audit record of what a past notification actually said (the `Notification.payload` snapshot preserves what was actually sent).

## 17.5 Delivery Reliability & Failure Handling

Notification sending is a background job (queued, not sent synchronously inside the API request that triggers it) — a slow/failed email provider must never block a booking confirmation from completing. Failed sends are retried with backoff a bounded number of times and then logged as `FAILED` on the `Notification` row for support visibility, rather than silently disappearing or retrying forever.

## 17.6 Provider/Vendor Choice

Per `23_COST_MODEL.md` research: a transactional-email provider (Amazon SES for lowest cost at scale, or Resend for better developer experience at slightly higher cost — final choice in `27_ADRS.md`) and, for SMS, a **locally-sourced Azerbaijan SMS aggregator** rather than a global provider like Twilio — global aggregator per-message pricing to Azerbaijan (~$0.40+/message) is high enough that it would materially affect unit economics on high-volume transactional SMS (OTP, confirmations); this must be sourced and verified locally (via a local mobile operator/aggregator relationship) before launch, and is flagged as a concrete pre-launch vendor task, not a build-time detail.
