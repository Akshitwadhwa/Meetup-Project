# Project guidance

## Project shape

- This is a small static website built with HTML, CSS, and browser JavaScript. There is no package manager or build step.
- Keep attendee flows usable on both phones and laptops, especially at a crowded in-person event.
- Preserve the existing visual style and make controls keyboard accessible with clear focus states.

## Supabase and privacy

- The browser client uses Supabase anonymous authentication. Do not require email or social sign-in unless the product requirements change.
- Keep database access protected by row-level security. Review policies whenever adding tables or changing queries.
- A Supabase publishable key may be used in `supabase-config.js`; never commit a `service_role` key, secret key, access token, or credentials.
- Store only the profile and room data needed for the meetup. Do not collect or upload raw voice recordings.
- SQL changes belong in `supabase/` as readable, rerunnable scripts where practical, with comments describing setup and intent.

## Editing and verification

- Keep the app dependency-light; avoid adding a framework or build tool for a small feature without a clear need.
- When changing UI, check the relevant flow at mobile and desktop widths and account for loading, error, and empty states.
- When changing a database schema or Supabase query, verify the corresponding RLS behavior as well as the happy path.
- Update `README.md` when setup, attendee flows, configuration, or troubleshooting changes.
- Never commit `.vercel/`, `.env` files, local credentials, or generated deployment state.
