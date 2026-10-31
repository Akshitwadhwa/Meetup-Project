# Host-published Luma events with Anakin

SideQuest uses Anakin to read the public Luma page for each host-created event. Attendees do not connect their own Luma accounts or paste Luma links into their profiles.

## Event flow

1. The host opens **Host dashboard** and enters the host access code.
2. The host enters the event name, venue, date/time, public Luma event URL, and the host profile. The host profile is written only by the server-side `events` Edge Function.
3. The function validates that the source is a public HTTPS URL on `luma.com` or `lu.ma`, sends the URL to Anakin's URL Scraper, and waits for the scrape result.
4. The function publishes the event name, venue, date, Luma URL, Anakin summary, organizer name, and host profile to the `hosted_events` table.
5. Attendees choose the published event by name, create their builder profiles, and join its attendee list. They do not enter a room code.
6. The profile history entry created by joining is readable only by that attendee. Profiles and newest-join times are visible to other people who joined the same event.

An event appearing in a person's private history means they selected and joined it in SideQuest. It is not proof of Luma registration, ticket purchase, or physical attendance. SideQuest does not scrape guest lists or infer attendance from Luma profiles.

## Secrets and deployment

Set these in Supabase **Edge Functions → Secrets**:

- `EVENT_ADMIN_CODE`: a long random host-dashboard code. It is checked only by the `events` Edge Function and is never saved in browser storage.
- `ANAKIN_API_KEY`: the Anakin URL Scraper credential. It is sent only from the `events` Edge Function to Anakin.

Deploy `supabase/functions/events/index.ts` as the `events` function with JWT verification enabled. The function also validates the caller's Supabase session before it handles a request. Do not put either secret in `app.js`, `supabase-config.js`, Vercel's public variables, or Git.

The Edge Function accepts only public Luma event URLs and normalizes them to the event path before scraping. The Anakin result is presented as an event summary, not as a verified statement about registration or attendance. If Anakin cannot read the page, event creation fails with an error so an unsummarized event is not silently published.

## Data access

- `hosted_events` is readable to signed-in SideQuest users only for published events. Host event fields are written through the Edge Function, not browser table writes.
- `profile_event_history` has owner-only read access. Joining happens through the `join_hosted_event` database function.
- `profiles` remain scoped to the event's internal membership group. The internal room ID and code are database implementation details and are not shown during attendee entry.
- `room_members` exposes join timestamps only to other members of the same event, so the people list can put recent arrivals first.
- Event participation is independent of Anakin: scraping enriches the host event record only, not individual profiles.

## References

- [Anakin URL Scraper API](https://anakin.io/docs/api-reference/url-scraper)
- [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)
- [Supabase securing data and RLS](https://supabase.com/docs/guides/database/secure-data)
