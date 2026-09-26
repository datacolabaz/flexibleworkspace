# Staging Validation Checklist

Complete all items before promoting to production.

## Deploy
- [ ] Frontend staging deploy successful
- [ ] Backend staging deploy successful  
- [ ] All migrations ran successfully (check Railway backend logs)
- [ ] Health check green
- [ ] Frontend staging connects to backend
- [ ] Backend connects to database
- [ ] No BACKEND_API_URL warnings in frontend logs

## RLS
- [ ] DB_USERNAME matches policy role in migration 1700000000023
- [ ] RLS enabled on: booking, ledger_entry, payout, provider, app_user, room, location, events, event_rsvps
- [ ] Provider cannot read another provider's data
- [ ] Customer cannot read another customer's bookings
- [ ] Admin access works correctly

## Auth
- [ ] Email OTP login works
- [ ] Google login works  
- [ ] Google login -> provider panel works
- [ ] Session refresh works
- [ ] Logout works
- [ ] Admin 2FA setup works

## Provider
- [ ] Provider onboarding completes
- [ ] Location creation with map works
- [ ] Geocoding works (address -> pin)
- [ ] Manual pin placement works
- [ ] Reverse geocoding works (pin -> address)
- [ ] Metro station selection works
- [ ] Provider sees own bookings in panel
- [ ] Provider sees payout balance
- [ ] Provider cannot see other provider data

## Booking
- [ ] Hourly booking creation works
- [ ] Past date/time blocked
- [ ] Outside business hours blocked
- [ ] Overlap blocked with clear error
- [ ] Server-side price calculation correct
- [ ] Double submit blocked
- [ ] Provider accept/reject works
- [ ] Hold expiration works
- [ ] No live chat visible anywhere
- [ ] Commission/payout calculated correctly

## Payment
- [ ] Payment sandbox flow works
- [ ] Webhook signature validated
- [ ] Successful payment -> booking confirmed
- [ ] Failed payment -> booking not confirmed
- [ ] Duplicate webhook handled idempotently
- [ ] Refund/cancellation flow correct

## Events
- [ ] User can create event without being provider
- [ ] 5-step wizard saves draft correctly
- [ ] Venue selection works in wizard
- [ ] Event publishes after all validations pass
- [ ] Public event page shows correctly
- [ ] RSVP form works
- [ ] Capacity limit enforced
- [ ] Sold out state shows correctly
- [ ] Organizer sees events in account tab

## Security
- [ ] Cross-provider data access blocked
- [ ] Cross-customer booking access blocked
- [ ] Client-side price manipulation rejected server-side
- [ ] OTP brute force limited
- [ ] Rate limiting active
- [ ] Admin routes require admin role
- [ ] Admin 2FA required for admin login

## Production pre-flight
- [ ] Database backup taken
- [ ] Rollback plan documented
- [ ] All env vars set in production
- [ ] SMTP/email delivery confirmed
- [ ] Mapbox token valid for production domain
- [ ] Google OAuth redirect URIs include production domain
- [ ] Payment gateway production credentials set
- [ ] SMS vendor configured (or confirmed as post-MVP)
