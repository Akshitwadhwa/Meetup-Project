# Anakin + shared Luma events

## Purpose

Use [Anakin.io](https://anakin.io/) as SideQuest's event-page enrichment service. A builder connects their own Luma account, chooses events from the authorized event list to add to their SideQuest profile, and can separately choose which events to share with a room. Anakin reads the selected public Luma event pages to extract their title, organizer, and a short description of the program.

Example: **“You both listed the Gurugram AI meetup. What part of the event are you most curious about?”**

This is an opt-in event-context feature. Adding an event to a SideQuest profile does not claim or verify attendance. Anakin helps read public event details; it does not identify a person or determine their registration or attendance.

## Important Luma limitation

A Luma ID or public profile URL is not itself a documented way to retrieve a person's complete attendance history. Luma documents a public profile as showing a person's bio and social links; its profile's attended count is a stat, not a link to an event list. See [Managing Your Profile](https://help.luma.com/p/managing-your-profile) and [Luma iOS app: review past events](https://help.luma.com/p/luma-ios-app).

Luma's [MCP server](https://help.luma.com/p/mcp) documents a user-authorized **Your events** tool for a connected user's past and upcoming events they can access. SideQuest now has an OAuth/PKCE callback and an Edge Function that calls the account event-list read tool. This is different from scraping a public profile. The user's Luma password is never collected by SideQuest. The callback and event-table migration are deployed to the connected Supabase project, and the metadata document is deployed on Vercel. However, the linked Vercel project currently protects its `vercel.app` domain with SSO, so Luma and other attendees cannot reach that metadata URL until a public custom domain is configured or the owner explicitly changes the protection. The server's actual tool schema and returned event shape still require a live authorization check before claiming end-to-end verification.

Luma says MCP clients use remote streamable HTTP and OAuth Client ID Metadata Documents; dynamic client registration and manually issued client IDs/secrets are not the flow. Luma's MCP consent may authorize broader capabilities than reading past events. SideQuest's function only calls the event-list read tool and must never call event management or guest-list tools for this feature. The documented REST API remains calendar-scoped and is for organizer-managed data, not a generic attendee history. See [Luma API overview](https://help.luma.com/p/luma-api) and [API setup](https://docs.luma.com/reference/getting-started-with-your-api).

Therefore:

- Do not promise that entering a Luma ID will reveal all past events.
- Do not scrape private profiles, hidden guest lists, or logged-in pages to infer attendance.
- Let the attendee choose events from their own authorized Luma event list to add to their SideQuest profile. Do not ask them to attest that they attended.
- Keep selected events private until the attendee explicitly shares them with a room.
- A separate organizer flow may import the guest list for an event on a calendar the organizer is authorized to manage through Luma's API. Keep that import separate from personal cross-calendar history.

## Attendee experience

1. The attendee joins a SideQuest room and creates their builder card as they do today.
2. They choose **Connect Luma events** and connect through Luma's hosted authorization page.
3. SideQuest calls Luma's user-authorized event-list tool and shows events the connected person can access. The attendee chooses which ones to list on their builder profile; no registration or attendance declaration is required.
4. For selected events, SideQuest sends only the normalized public Luma event URLs to a Supabase Edge Function. The function validates each URL and asks Anakin to extract the event title, organizer, and a short summary of its purpose and any published program details.
5. Each event starts private. The attendee can separately opt to share it with people in the current room. If they do not opt in, it is excluded from other members' match cards and event prompts.
6. SideQuest finds events both people chose to share and displays the common event details as a conversation starter. People can continue chatting or invite one another to a mini-game room.

Never use an inferred match as proof that someone registered for or attended an event. The UI should say **“You both listed…”**, not imply independent verification.

## Components and responsibilities

| Component | Responsibility |
| --- | --- |
| SideQuest browser app | Connect the attendee's Luma account, show their available events, let them choose events for their profile, control room sharing, and display mutual event context. |
| Supabase Edge Function (`luma`) | Verify the caller's Supabase user JWT; handle Luma OAuth/MCP; validate selected event URLs; call Anakin using a server-side API key; cache and return normalized event details. It does not record an attendance claim. |
| Anakin URL Scraper | Read the supplied public event page and extract only event metadata. The URL Scraper supports structured extraction; see the [Anakin overview](https://anakin.io/docs/documentation) and [URL Scraper API](https://anakin.io/docs/api-reference/url-scraper). |
| Optional GenieX client | On supported Qualcomm Snapdragon devices, run a small local model to turn mutually shared event metadata into a natural icebreaker. GenieX is a local inference runtime, not a hosted API; see the [Qualcomm GenieX project](https://github.com/qualcomm/GenieX) and its [platform support guide](https://github.com/qualcomm/GenieX/blob/main/docs/en/get-started/platforms.mdx). |
| Supabase Postgres | Store user-confirmed event records and room-level sharing choices under RLS. |
| Official Luma MCP connection | OAuth/PKCE is handled by the Supabase Edge Function. It calls Luma's user event-list tool, then the browser lets the attendee select and attest to events. No public profile URL is treated as an account credential. |
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
  attended_confirmed   boolean not null default false -- legacy field; profile-event sharing does not depend on it
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

- **Select:** owner can read their records; another user can read only `share_with_room = true` and only when that viewer is a member of the same `room_id`.
- **Insert:** `user_id = auth.uid()` and the caller is a member of `room_id`.
- **Update:** the same owner check in both `USING` and `WITH CHECK`; the caller must remain a room member. This prevents changing ownership or moving rows into rooms the caller has not joined.
- **Delete:** only the owner can delete their records.

Do not make event history publicly readable just because the source URL is public. The user's choice to list an event on their profile and share it with a room is still personal profile data.

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

Extraction may be incomplete or wrong. Present it as event context, not verified facts. Do not ask Anakin to infer a person's identity, social profiles, registration, or attendance.

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

### Current implementation: Luma events with Anakin enrichment

1. The `luma` Supabase Edge Function handles user authorization, lists events available to the connected Luma account, and enriches selected public event pages with Anakin's URL Scraper.
2. `ANAKIN_API_KEY` stays in Supabase Edge Function secrets. The function sends only selected public Luma event URLs to Anakin; it never sends the user's Luma profile URL or account token.
3. Event selection adds an event to the attendee's SideQuest profile without an attendance claim. Each event stays private unless the attendee opts to share it with that room.
4. Anakin returns a title, organizer, and short event/program summary. SideQuest caches those fields server-side and shows them when two profiles share an event.
5. The connected database has the event enrichment and URL validation migrations. Live Anakin scraping still depends on `ANAKIN_API_KEY` being configured; Luma OAuth also needs a public, reachable client metadata URL and an end-to-end account check.

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

### Phase 2b: user-authorized Luma event import (implemented; live OAuth validation pending)

1. Publish `luma-client-metadata.json` at its configured, publicly reachable Vercel URL and confirm Luma accepts that URL and the Supabase callback URI.
2. Complete OAuth/PKCE with a test account; validate token refresh, the exact event-tool name/schema, pagination, and response normalization against Luma's live MCP server.
3. Request only the connected account's own event list. Do not call organizer guest-list or event-management tools for this use case.
4. Let the attendee select which returned events to add to `profile_events`; selection is not an attendance claim.
5. Confirm disconnect/revocation behavior and validate the RLS rules with two room users. If Luma's client authorization terms cannot be met, keep manual event links as a fallback.

## Acceptance criteria

- An attendee can connect a Luma account using the official hosted authorization page, choose events to add to their profile without claiming attendance, and choose whether to share each event in the current room.
- Anakin's key and any Luma calendar key are absent from browser bundles, Git history, and public configuration.
- Arbitrary URLs, non-HTTPS URLs, cross-host redirects, and malformed Anakin responses are rejected.
- One attendee cannot read, edit, or delete another attendee's private event rows.
- A room member can see another member's selected event only when the owner enables room sharing.
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
- [Luma MCP server and account authorization](https://help.luma.com/p/mcp)
- [Luma public profile fields](https://help.luma.com/p/managing-your-profile)
- [Qualcomm GenieX project](https://github.com/qualcomm/GenieX)
- [GenieX platform support](https://github.com/qualcomm/GenieX/blob/main/docs/en/get-started/platforms.mdx)
- [Supabase Edge Function security](https://supabase.com/docs/guides/functions/auth)
- [Supabase API keys and secret handling](https://supabase.com/docs/guides/getting-started/api-keys)
