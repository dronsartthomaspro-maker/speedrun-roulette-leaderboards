# Speedrun Roulette — public leaderboards

Static website (HTML + CSS + JS, no build step) showing:
- the Daily Challenge of today and yesterday, with their leaderboards;
- the best players (number of Daily wins) and the recent winners;
- every Community Challenge with its leaderboard.

It reads the mod's Supabase project with the **public (anon) key**, through the read-only
functions and tables the database already exposes. Nothing is written. Texts coming from the
database are always inserted as plain text.

## Hosting
Any static host works: put the content of this folder at the root of the site.
- GitHub Pages: a repository with these files, Settings → Pages → "Deploy from a branch" (main, /).
- Netlify: drag and drop this folder on https://app.netlify.com/drop.
- Cloudflare Pages: new project, upload this folder.

Player heads come from https://mc-heads.net (hidden when unavailable).
