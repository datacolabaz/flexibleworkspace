# Spotva AI Search Integration Plan

## Recommendation

AI is worth integrating into Spotva, but the first release should be a **natural-language search assistant**, not a general-purpose chatbot. The assistant should convert a visitor's request into the existing structured search filters and then let the current availability and ranking engine remain the source of truth.

## Phase 1: natural-language search

A visitor can write a request such as: “Nərimanovda 20 nəfərlik, proyektor olan, saatı 150 AZN-dən ucuz görüş otağı tap.” The AI extracts a typed search object containing city, district, capacity, budget, room type, amenities, date and time. The frontend then calls the existing `GET /api/v1/spaces` search endpoint. This keeps pricing, availability and booking rules deterministic and prevents the model from inventing rooms or prices.

The first implementation should support Azerbaijani, Russian and English, preserve the user's original request, show the extracted filters as editable chips, and ask one short clarification question when a required detail is genuinely missing. A normal filter-based search must remain available as a fallback.

## Phase 2: result explanation and comparison

After search results are returned, AI can explain why the first three results match the request, compare two or three selected spaces, and identify trade-offs such as capacity versus price or location versus amenities. The model must only summarize fields returned by the API; it must not generate availability, reviews, prices or policies.

## Phase 3: provider copilot

For business owners, the highest-value features are automatic listing descriptions, amenity/category suggestions from uploaded photos and text, customer-question drafts, and weekly performance summaries. Dynamic price recommendations should be advisory only at first and should require explicit owner approval before changing anything.

## Proposed request flow

```text
Visitor prompt
  -> POST /api/v1/ai/search/interpret
  -> validated SearchIntent JSON
  -> existing GET /api/v1/spaces with typed filters
  -> deterministic availability/ranking
  -> optional AI explanation using returned result fields
```

## Guardrails

The AI endpoint must validate model output against a JSON schema and reject unknown fields. It must never execute database queries, modify bookings, change prices, or claim that a room is available without a live search response. Rate limiting, request length limits, abuse logging, prompt-injection filtering, and an explicit “AI-generated explanation” label are required. Personal data, payment data and private provider notes must not be sent to the model.

## Success metrics

The pilot should measure search-to-result completion rate, clarification rate, result click-through rate, booking conversion, zero-result recovery, average response latency and cost per successful search. The feature should be kept only if it improves search completion and booking conversion without increasing support contacts or producing inaccurate claims.

## Implementation decision

The recommended first deliverable is a **schema-constrained intent parser** connected to the existing search API. Do not replace the current search page, ranking engine or filters. Add an AI input above the search filters, show the parsed filters before applying them, and keep a one-click “normal search” fallback.
