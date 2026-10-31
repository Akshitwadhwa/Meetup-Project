# SideQuest agent guide

## Product direction

- SideQuest is the community and team-finding side quest around an AI hackathon. The main quest is for attendees to form a team, build a prototype, and submit it through the event’s process.
- Keep the product focused on helping attendees meet compatible builders, start conversations, and move into building. Do not describe SideQuest itself as the hackathon submission or project-tracking system.
- The core path is: choose a host-published event by name, create a builder profile, find people who joined that event through shared tools/interests/goals, and continue the conversation while building.
- Preserve the playful, voice-first character and the existing blue, white, dark, and lime visual style. Support phones and laptops used in a crowded event.

## Current product behavior

- This is a dependency-light static app built with HTML, CSS, and browser JavaScript. There is no package manager or build step.
- Hosts publish events from the Host dashboard with an event name, venue, date, Luma URL, and host profile. Attendees choose events by name or follow an event link; do not show them a room code.
- Supabase anonymous auth identifies a browser session. Do not require email or social sign-in unless product requirements change.
- Wispr Flow dictates into the currently focused field. SideQuest does not control Wispr Flow or receive its audio. Profile suggestions are generated from the dictated text by a built-in keyword matcher, not a hosted model; keep user review/editing available.
- The local browser remembers profile prefill. Supabase stores event membership and shared profile fields so attendees can discover one another across devices. Event history itself is private to its owner.
- Matching uses shared interests (3 points), AI tools (2), and meetup goals (1), with reasons displayed to the attendee.
- The optional watchlist game accepts voice-dictated votes or button input and shows shared likes to event participants.
- X and LinkedIn URLs are optional and shared with event participants only when the profile owner enables sharing.
- Hosts enter the event and host profile in the Host dashboard. Attendees do not edit host fields or connect personal Luma accounts.
- Anakin reads only the host-supplied public Luma event page to summarize event details. Its API key and host dashboard code stay in Supabase Function secrets. See `ANAKIN.md` for integration and privacy details.

## Supabase and privacy

- Keep database access protected by row-level security. Review existing policies whenever adding tables or changing queries; never weaken room scoping or owner checks for convenience.
- Social URLs are stored in `profile_social_links`; reads by other event members require the owner's `share_with_room` opt-in. New fields in that table inherit its policies.
- A Supabase publishable key may be used in `supabase-config.js`; never commit a `service_role` key, secret key, access token, or credentials.
- Store only profile, event membership, and game data needed for the meetup. Do not collect or upload raw voice recordings.
- SQL changes belong in `supabase/` as readable, rerunnable scripts where practical, with comments describing intent. Update README setup steps when migrations or setup behavior change.
- Do not infer device location, Luma registration, ticket purchase, or physical attendance. Describe profile history as events the attendee joined in SideQuest.

## Editing and verification

- Keep the app dependency-light; avoid adding frameworks or build tools without a clear need.
- Preserve keyboard access, visible focus, useful error/loading/empty states, and responsive layouts.
- When changing a profile or event flow, check it at phone and desktop widths. When changing database queries, verify the happy path and relevant RLS behavior.
- Keep README.md aligned with the implemented product. Clearly distinguish current features from future plans.
- Never commit `.vercel/`, `.env` files, local credentials, or generated deployment state.
