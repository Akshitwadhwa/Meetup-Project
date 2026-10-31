# Anakin + shared Luma events

## Purpose

Use [Anakin.io](https://anakin.io/) as SideQuest's event-link enrichment service. A builder can add public Luma event links they attended; Anakin extracts event details; the builder reviews and confirms them; SideQuest can then use mutually shared event history to suggest conversation starters.

Example: **“You both attended the Gurugram AI meetup. What did you think of the quantization talk?”**

This is an opt-in event-history feature. Anakin helps read an event page; it does not establish that someone attended it.

## Important Luma limitation

A Luma ID or profile URL is not a documented way to retrieve a person's complete attendance history. Luma's official API is calendar-scoped, requires Luma Plus, and supports managing a calendar's events, guests, and attendance data. It is not a general attendee-history API across events hosted by other calendars. See [Luma API overview](https://help.luma.com/p/luma-api) and [API setup](https://docs.luma.com/reference/getting-started-with-your-api).

Therefore:

- Do not promise that entering a Luma ID will reveal all past events.
- Do not scrape private profiles, hidden guest lists, or logged-in pages to infer attendance.
- For this feature, ask the attendee to add a Luma event link and confirm that they attended it.
- A separate organizer flow may import the guest list for an event on a calendar the organizer is authorized to manage through Luma's API. Keep that import separate from personal cross-calendar history.

## Attendee experience

1. The attendee joins a SideQuest room and creates their builder card as they do today.
2. They open **Events I've been to** and paste a public Luma event URL. They can also add an event manually if its page is unavailable.
3. SideQuest sends the URL to a Supabase Edge Function. The function validates that the URL is an allowed Luma event URL and asks Anakin to extract a small event record.
4. SideQuest shows a preview: event name, date, organizer, topic tags, and source link. The attendee corrects any bad extraction and checks **I attended this event** before saving.
5. Each event starts private. The attendee can separately opt to share confirmed event names with people in the current room. If they do not opt in, it is excluded from match explanations and shared-event prompts.
6. SideQuest finds events both people confirmed and chose to share. It displays a short icebreaker; people can continue chatting in the room or invite one another to a mini-game room.

Never use an inferred match as proof that someone attended an event. The UI should say **“You both listed…”** or **“You both say you attended…”**, not imply independent verification.

## Components and responsibilities

| Component | Responsibility |
| --- | --- |
| SideQuest browser app | Collect event URL, show extraction preview, let the attendee edit and confirm, control room sharing, and display mutual matches. |
| Supabase Edge Function (`extract-luma-event`) | Require the caller's Supabase user JWT; validate the URL; apply per-user rate limits; call Anakin using a server-side API key; return normalized event details. Do not write a user-confirmed attendance record on the user's behalf. |
| Anakin URL Scraper | Read the supplied public event page and extract only event metadata. The URL Scraper supports structured extraction; see the [Anakin overview](https://anakin.io/docs/documentation) and [URL Scraper API](https://anakin.io/docs/api-reference/url-scraper). |
| Optional GenieX client | On supported Qualcomm Snapdragon devices, run a small local model to turn mutually shared event metadata into a natural icebreaker. GenieX is a local inference runtime, not a hosted API; see the [Qualcomm GenieX project](https://github.com/qualcomm/GenieX) and its [platform support guide](https://github.com/qualcomm/GenieX/blob/main/docs/en/get-started/platforms.mdx). |
| Supabase Postgres | Store user-confirmed event records and room-level sharing choices under RLS. |
| Optional organizer import | If needed later, a calendar owner can use Luma's official API to import guests for their own authorized calendar. Keep its API key server-side and treat the resulting list as organizer-controlled event data. |

Anakin's full API uses the `X-API-Key` header. Store `ANAKIN_API_KEY` as a Supabase Function secret; never put it in `app.js`, `supabase-config.js`, a public Vercel variable, or a committed file. The function should call Anakin's documented endpoint from the server, not directly from the browser. Check Anakin's current endpoint request schema, pricing, and rate limits when implementing because those can change.

## Suggested data model

Add a room-scoped table rather than placing event history in the general profile JSON. Suggested fields:

```text
profile_events
  id                   uuid primary key
  room_id              uuid not null
  user_id              uuid not null
  source_url           text not null
  source_host          text not null
  event_title          text not null
  event_date           timestamptz null
  organizer_name       text null
  topics               text[] not null default '{}'
  attended_confirmed   boolean not null default false
  share_with_room      boolean not null default false
  created_at           timestamptz not null default now()
  updated_at           timestamptz not null default now()
```

Recommended constraints and indexes:

- Foreign key `(room_id, user_id)` to the matching room profile, with `ON DELETE CASCADE`.
- Unique `(room_id, user_id, source_url)` after URL normalization, so repeated pastes do not create duplicate cards.
- Index `(room_id, user_id)` for a person's events and `(room_id, event_date)` if room-level event browsing is added.
- Enforce reasonable lengths for URL/title/organizer, cap topic count, and cap the number of imports per attendee per hour.
- Store no Luma password, session cookie, email, or raw page HTML. Keep only the extracted fields needed for discovery.

### Row-level security

Enable RLS on `profile_events` and grant only the operations the browser needs to the `authenticated` role (Supabase anonymous sign-ins also use this Postgres role). Policies should enforce:

- **Select:** owner can read their records; another user can read only `attended_confirmed = true AND share_with_room = true` and only when that viewer is a member of the same `room_id`.
- **Insert:** `user_id = auth.uid()` and the caller is a member of `room_id`.
- **Update:** the same owner check in both `USING` and `WITH CHECK`; the caller must remain a room member. This prevents changing ownership or moving rows into rooms the caller has not joined.
- **Delete:** only the owner can delete their records.

Do not make event history publicly readable just because the source URL is public. The user's attendance assertion and room-sharing choice are still personal profile data.

If match cards are served from a SQL view, use `security_invoker = true` where supported or keep the view inaccessible to browser roles and expose a narrowly scoped RPC. A view can bypass RLS if configured carelessly.

## Extraction contract

The Edge Function should accept only a URL, not an arbitrary prompt or target host. It should return a normalized shape similar to:

```json
{
  "sourceUrl": "https://lu.ma/example-event",
  "title": "Example AI Builders Meetup",
  "startsAt": "2026-10-31T09:00:00+05:30",
  "organizer": "Example Community",
  "topics": ["AI agents", "Developer tools"]
}
```

Extraction may be incomplete or wrong. The client must allow correction before it saves the attendee-confirmed row. Do not ask Anakin to infer a person's identity, social profiles, or whether they attended.

## Safe request flow

1. Client invokes `extract-luma-event` with the current Supabase session and the pasted URL.
2. Function verifies the JWT and gets the caller identity from the verified claims; it does not trust a `user_id` passed in the request body.
3. Function parses and normalizes the URL. Accept only HTTPS and known Luma event hosts (`luma.com` and `lu.ma`, with a deliberate allowlist for required subdomains). Reject credentials, unexpected ports, non-Luma hosts, and non-event paths. Do not fetch arbitrary URLs or follow redirects to a different host.
4. Function checks rate limits and duplicate imports, then calls Anakin with a strict output schema and the API key from Function secrets.
5. Function validates Anakin's response, drops all fields outside the extraction contract, and returns the preview.
6. Browser displays the preview and the explicit attendance confirmation and sharing controls.
7. Browser inserts the confirmed record using the normal Supabase client; RLS decides whether the caller may save it.

The Edge Function should return useful errors for inaccessible pages, unsupported URLs, rate limits, extraction failures, and malformed output. It should not log full scraped page contents or API keys.

## Matching and conversation prompts

- Compare only confirmed events that both people chose to share in the same room.
- Normalize event URLs and compare stable event identity when available; use normalized title plus date as a fallback. Avoid fuzzy title matching that creates surprising false overlaps.
- Add shared-event overlap as a visible matching reason, e.g. **“1 event in common”**. Keep the score explainable alongside current shared tools, interests, and goals.
- Generate a basic prompt with a template by default: **“You both listed {event title}. What stood out to you?”** This is fast, cheap, predictable, and works on every device.
- Show no prompt when there is no confirmed overlap or when either person has not opted to share.

### GenieX use case (optional local-AI enhancement)

Use GenieX to generate a more natural prompt from only the event details both attendees have chosen to share. Example input: event title, date, a short public description, and shared topic tags. Example output: **“You both listed the Gurugram AI Builders meetup. Which talk gave you an idea you want to try?”**

Keep generation short and non-sensitive. The model must not infer a person's identity, personality, attendance, or private interests. Show a **GenieX local** label when its local model generated the prompt; use the template above when GenieX is missing or fails.

GenieX runs on supported Qualcomm Snapdragon devices; it is not a JavaScript library that can simply be added to this static Vercel page. The Qualcomm project documents Windows ARM64, Android, and Linux ARM64 targets. Possible paths:

1. **Best product integration:** build a small Android companion using the GenieX Android SDK for a supported Snapdragon phone. It receives an explicitly shared event-overlap payload and generates the prompt locally.
2. **Fastest demo:** run GenieX on a supported Snapdragon Windows ARM64 device and generate a prompt in a clearly disclosed demo screen. Keep this isolated from the normal attendee flow until a secure app-to-runtime connection exists.
3. **Universal fallback:** the main web experience always uses its template when the current device cannot run GenieX.

Do not expose a local GenieX server to the public internet just to connect the hosted site. A local server is suitable for a same-device demo; a production bridge needs a deliberate authenticated design and supported hardware.

## Build plan

### Phase 1: attendee-submitted event links

1. Add `profile_events` SQL migration with indexes, grants, and owner/room-member RLS policies.
2. Add the `extract-luma-event` Supabase Edge Function with JWT verification, URL allowlist, rate limiting, strict structured output, and Anakin secret handling.
3. Add **Events I've been to** to the builder profile flow with add-link, loading, preview/edit, attendance confirmation, delete, and room-sharing controls.
4. Load only the viewer's private records plus room-shared records permitted by RLS.
5. Add shared-event match reasons and prompt cards to room discovery.
6. Update `README.md` with the Function secret and deploy/setup instructions; update this plan as implementation decisions are made.

### Phase 3: GenieX demonstration

1. Confirm access to a supported Snapdragon device and select the Android companion or same-device Windows demo path.
2. Pick a small instruction-tuned model that fits that device. Pin the tested GenieX and model versions and measure startup time, generation time, and memory on the hardware.
3. Pass only mutually shared event metadata to local inference. Keep prompt generation on the GenieX device; do not send it to an external LLM.
4. Label locally generated prompts and retain the template fallback for other devices.
5. Do not require unsupported devices to install GenieX or block them from matching.

### Phase 2: organizer-authorized import (optional)

1. Confirm the meetup organizer has access to the relevant Luma calendar and an eligible Luma API plan.
2. Add a private organizer-only import path using a calendar-scoped Luma API key stored server-side.
3. Let attendees opt in to matching against the imported guest list. Do not expose the entire guest list to every room member.
4. Keep organizer-imported attendance provenance distinct from attendee self-confirmed event history in the UI and database.

## Acceptance criteria

- An attendee can add a public Luma event URL, review extracted details, edit them, confirm attendance, and choose whether to share it in the current room.
- Anakin's key and any Luma calendar key are absent from browser bundles, Git history, and public configuration.
- Arbitrary URLs, non-HTTPS URLs, cross-host redirects, and malformed Anakin responses are rejected.
- One attendee cannot read, edit, or delete another attendee's private event rows.
- A room member can see another member's event only when the owner confirmed attendance and enabled room sharing.
- The match UI shows shared events only when both records meet those conditions, and the prompt describes the overlap as self-reported.
- Re-adding the same normalized event URL does not create duplicate event cards.
- Users can remove an event or turn sharing off; it disappears from other people's match prompts on the next refresh.
- GenieX generation runs only on supported hardware, uses only mutually shared event data, and has a working non-GenieX fallback.

## References

- [Anakin.io overview](https://anakin.io/docs/documentation)
- [Anakin API reference](https://anakin.io/docs/api-reference)
- [Anakin URL Scraper](https://anakin.io/docs/api-reference/url-scraper)
- [Luma API overview](https://help.luma.com/p/luma-api)
- [Luma API setup](https://docs.luma.com/reference/getting-started-with-your-api)
- [Qualcomm GenieX project](https://github.com/qualcomm/GenieX)
- [GenieX platform support](https://github.com/qualcomm/GenieX/blob/main/docs/en/get-started/platforms.mdx)
- [Supabase Edge Function security](https://supabase.com/docs/guides/functions/auth)
- [Supabase API keys and secret handling](https://supabase.com/docs/guides/getting-started/api-keys)
