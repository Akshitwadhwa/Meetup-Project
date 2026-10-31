# SideQuest agent guide

## Product direction

- SideQuest is the community and team-finding side quest around an AI hackathon. The main quest is for attendees to form a team, build a prototype, and submit it through the event’s process.
- Keep the product focused on helping attendees meet compatible builders, start conversations, and move into building. Do not describe SideQuest itself as the hackathon submission or project-tracking system.
- The core path is: join a shared event room, create a builder profile, find people through shared tools/interests/goals, optionally create a smaller game room, and continue the conversation while building.
- Preserve the playful, voice-first character and the existing blue, white, dark, and lime visual style. Support phones and laptops used in a crowded event.

## Current product behavior

- This is a dependency-light static app built with HTML, CSS, and browser JavaScript. There is no package manager or build step.
- Attendees join with a room code or invite link. `FLOW26` is the Gurugram event room. Attendees can create additional rooms.
- Supabase anonymous auth identifies a browser session. Do not require email or social sign-in unless product requirements change.
- Wispr Flow dictates into the currently focused field. SideQuest does not control Wispr Flow or receive its audio. Profile suggestions are generated from the dictated text by a built-in keyword matcher, not a hosted model; keep user review/editing available.
- The local browser remembers profile prefill and the last room code. Supabase stores room membership and shared profile fields so people can discover one another across devices.
- Matching uses shared interests (3 points), AI tools (2), and meetup goals (1), with reasons displayed to the attendee.
- The optional watchlist game accepts voice-dictated votes or button input and shows shared likes for a room.
- X and LinkedIn URLs are optional and shared with room members only when the profile owner enables sharing.
- Attendees can connect their own Luma account, choose events to list on their profile, and separately opt to share those events with the room. Event selection does not claim registration or attendance.
- Anakin reads selected public Luma event pages to summarize event details. Its API key stays in Supabase Function secrets; never send Luma tokens or private account data to Anakin. See `ANAKIN.md` for integration and privacy details.

## Supabase and privacy

- Keep database access protected by row-level security. Review existing policies whenever adding tables or changing queries; never weaken room scoping or owner checks for convenience.
- Social URLs are stored in `profile_social_links`; reads by other room members require the owner's `share_with_room` opt-in. New fields in that table inherit its policies.
- A Supabase publishable key may be used in `supabase-config.js`; never commit a `service_role` key, secret key, access token, or credentials.
- Store only profile, room, and game data needed for the meetup. Do not collect or upload raw voice recordings.
- SQL changes belong in `supabase/` as readable, rerunnable scripts where practical, with comments describing intent. Update README setup steps when migrations or setup behavior change.
- Do not infer location, Luma registration, attendance, or other sensitive facts from profile links. Describe shared events as events users listed, not as verified participation.

## Editing and verification

- Keep the app dependency-light; avoid adding frameworks or build tools without a clear need.
- Preserve keyboard access, visible focus, useful error/loading/empty states, and responsive layouts.
- When changing a profile or room flow, check it at phone and desktop widths. When changing database queries, verify the happy path and relevant RLS behavior.
- Keep README.md aligned with the implemented product. Clearly distinguish current features from future plans.
- Never commit `.vercel/`, `.env` files, local credentials, or generated deployment state.
