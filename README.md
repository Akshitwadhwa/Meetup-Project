# SideQuest

SideQuest is a voice-first community for AI builders. Attendees join an event room, create a builder profile, discover people with shared tools and interests, and invite a match to a smaller room for an optional icebreaker game.

- **Live site:** https://sidequest-meetup.vercel.app
- **GitHub:** https://github.com/Akshitwadhwa/Meetup-Project
- **Stack:** Static HTML, CSS, and JavaScript with Supabase Auth and Postgres

## Attendee flow

1. Join an event room with its code or invite link. `FLOW26` is the Gurugram meetup room.
2. Choose a display name and dictate a short builder intro with Wispr Flow, or type it.
3. Choose the AI tools you use, interests, and meetup goals in the profile form. For **Tools I’m curious about**, say “I’m curious about Cursor and Claude” in your intro; those tool tags appear automatically without tapping that section’s chips or typing a separate list.
4. Browse builders ranked by shared tools, interests, and goals. Each profile explains the matching signals. Search the room by person, tool, or interest.
5. Optionally add X or LinkedIn links. They remain private unless the profile owner checks **Show these links to people in this room**.
6. Select **Start a game room together** on a match to make a separate room. Copy its invite link to bring the other person in, then play the voice voting game together.

Wispr Flow inserts dictated text into the focused field. SideQuest does not receive audio or control the Flow app. The curiosity field recognizes known tools from a built-in keyword list and is not produced by a trained model. The display name is entered separately.

## Matching

The first version uses a simple, explainable score: shared interests count for three points each, shared AI tools for two, and shared meetup goals for one. The UI shows the shared signals rather than presenting the score as an AI prediction. No profile data is used to train a model.

## Run locally

There is no build step or package install. Start a static server from this folder:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000. For shared rooms and matches, the page needs the configured Supabase project and anonymous sign-ins enabled. The no-config local preview uses browser storage and cannot sync between devices.

To try it with two people, open the site in two browser profiles or devices, join the same room with different names and profiles, and compare the match ordering. Use **Start a game room together** on a profile to generate a smaller game room and share its invite link.

## Supabase setup

The browser client settings are in [`supabase-config.js`](supabase-config.js). The project URL and publishable key are intended for frontend use. Never add a `service_role` key or other secret to the site.

In Supabase, enable **Authentication → Sign In / Providers → Allow anonymous sign-ins**. For a new database, run these scripts in the SQL Editor:

1. [`supabase/schema.sql`](supabase/schema.sql) creates event rooms, memberships, builder profiles, the room-scoped social-link table, RLS policies, the `join_room` function, and the `FLOW26` room.
2. [`supabase/host_tools.sql`](supabase/host_tools.sql) adds attendee-created rooms. Room creation is limited to three per anonymous account per hour.
3. [`supabase/game.sql`](supabase/game.sql) creates the shared game-voting table and its RLS policies.

For the connected SideQuest database, the builder-community migration is already applied. For another existing installation, apply [`supabase/migrations/20261031062516_builder_community_profiles.sql`](supabase/migrations/20261031062516_builder_community_profiles.sql) to add matching fields and opt-in social-link storage. The schema migration is also recorded in `supabase/migrations/` for future changes.

## Data and privacy

- Supabase stores the anonymous user ID, room membership, display name, intro, interests, AI tools used or explored, meetup goals, and game votes.
- Social URLs are stored in a separate table. RLS allows the owner to read them and allows other members of the same room to read them only when `share_with_room` is enabled.
- No email, Google, X, or LinkedIn account login is required. X and LinkedIn URLs are optional profile fields.
- Anonymous identity is tied to the browser session. Clearing site data or changing devices can mean losing access to that profile; a future account-recovery option can be added for a long-term community.
- Rooms are scoped by code. Shared profile recommendations are based on tags and goals, not GPS or Apple Find My.

## Troubleshooting

- **“Anonymous sign-ins are disabled”**: enable anonymous sign-ins in the Supabase project referenced by `supabase-config.js`.
- **Room join function or base tables missing**: run `supabase/schema.sql`.
- **Room creation function missing**: run `supabase/host_tools.sql`.
- **Game voting table missing**: run `supabase/game.sql`.
- **Builder fields or social links fail to load**: apply the latest builder profile migration.
- **Profiles do not match across devices**: confirm both are on the same site and joined the same room code.
