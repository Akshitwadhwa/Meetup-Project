# SideQuest

SideQuest is a voice-friendly meetup icebreaker. Attendees join a shared room with a code, introduce themselves, and find common ground through a quick movie and TV swipe game.

- **Live site:** [sidequest-meetup.vercel.app](https://sidequest-meetup.vercel.app)
- **Hosting:** Vercel (`sidequest-meetup`)
- **Stack:** Static HTML, CSS, and JavaScript with Supabase Auth and Postgres

## How to play

1. Open the site and choose **Join a room**. Use the code shown by the organizer; `FLOW26` is the Gurugram meetup room.
2. Choose a display name and write a short intro. If Wispr Flow is available on your device, use it to dictate directly into the bio field. SideQuest does not call a Wispr Flow API or upload audio.
3. After joining, you appear on the room board with the other attendees.
4. Tap **Start the voice game**. Focus the vote field, start Wispr Flow, and say **“like,” “dislike,”** or **“not seen.”** SideQuest saves the vote and advances to the next title. Buttons remain available as a fallback.
5. When you finish, see which titles are getting shared love in the room. You can play again or return to the board.

The current voice game uses ten titles: *Interstellar*, *Inception*, *The Office*, *Stranger Things*, *Breaking Bad*, *The Bear*, *Black Mirror*, *Sacred Games*, *Succession*, and *Dune: Part Two*. The result list highlights titles liked by at least half the room, with a minimum of two people. Wispr Flow inserts the dictated command into the focused field; the site does not record audio or control the Flow app.

## Create and share a room

Anyone can choose **Make a room**, enter a name, and share the generated code. The person who created it joins like any other attendee. Room creation is limited to three rooms per anonymous account per hour to discourage spam.

## Run locally

There is no build step or package install. Start a local static server from this folder:

```sh
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000). Opening `index.html` directly also shows the site, but a local server is more reliable for browser APIs and Supabase requests.

To try the shared game with two people, open the live site (or local site) in two separate browsers/devices, join the same room with different display names, and play through the titles on each. Use `FLOW26` for the meetup room or create a separate room for a private test. Each browser gets its own anonymous Supabase user.

If Supabase is not configured, the app falls back to a local preview. That preview uses browser storage, so it is not shared between devices; use a configured Supabase project to test real rooms and shared game results.

## Supabase configuration

The browser client settings are in [`supabase-config.js`](supabase-config.js). It contains the project URL and a publishable (formerly anon) key. These are intended for browser use; **never put a `service_role` key or other secret in frontend files**.

For a new Supabase project:

1. Set its URL and publishable key in `supabase-config.js`.
2. In **Authentication → Sign In / Providers**, enable **Allow anonymous sign-ins**. SideQuest uses anonymous auth so people can save profiles without email or Google login.
3. Run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL Editor. This creates rooms, memberships, profiles, row-level security policies, the `join_room` function, and the `FLOW26` demo room.
4. Run [`supabase/host_tools.sql`](supabase/host_tools.sql) to enable attendee-created rooms through `create_room`.
5. Run [`supabase/game.sql`](supabase/game.sql) to create the shared `game_votes` table and its row-level security policies.
6. Redeploy the static site after changing the config.

The SideQuest Supabase project already has these SQL files applied. If game voting reports that `game_votes` does not exist, run `supabase/game.sql` in that project's SQL Editor and reload the page.

## Data and privacy

- Supabase stores an anonymous user ID, room membership, display name, bio, interests, and game votes.
- The first version does not ask for email, Google, X, or LinkedIn details.
- Room members can see the profiles and game activity for their room. Row-level security limits profile changes and vote edits to the signed-in anonymous user.
- Anonymous identity is tied to the browser session. Clearing site data or changing devices can lose access to that identity; there is no account recovery until an optional sign-in/linking flow is added.
- Voice transcription happens through the user's available dictation tool. SideQuest itself only receives the text entered into the profile form.

## Crowd behavior and troubleshooting

The room board refreshes periodically (about every 12–18 seconds) so attendees can see new profiles. The current board does not keep a Realtime WebSocket open for every guest. Game votes are saved in Supabase as each person plays and are fetched for the result screen.

- **“Anonymous sign-ins are disabled”**: check that anonymous sign-in is enabled in the Auth settings of the exact Supabase project referenced by `supabase-config.js`.
- **Room code not found**: confirm the code, and make sure the room is active in the same Supabase project configured by the site.
- **Room creation function missing**: run `supabase/host_tools.sql`.
- **Room join function or tables missing**: run `supabase/schema.sql`.
- **Game voting table missing**: run `supabase/game.sql`.
- **Profiles or votes are not shared**: check that both devices use the same live site/config and have successfully joined the same room.

For a large event, review Supabase Auth rate limits ahead of time: anonymous sign-in limits can matter when many attendees share venue Wi-Fi. Consider enabling CAPTCHA/bot protection and adjusting limits in the Supabase dashboard for the expected attendance.
