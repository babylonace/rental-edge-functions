# Deploy your own

A step-by-step guide to run this backend for your own rentals. You need a free Cloudflare account, a
GitHub account and the iCal export link of each Airbnb listing. Everything below fits the free plans.
It takes about 30 minutes.

## 0. Try it locally first

```sh
git clone https://github.com/babylonace/rental-edge-functions.git
cd rental-edge-functions
npm test          # 41 tests, nothing to install (Node 22 or newer)
npm run demo      # every flow with invented data, no account needed
```

To run the real Cloudflare runtime on your machine:

```sh
cp .dev.vars.example guests/.dev.vars    # then edit the values
npm run dev:guests                       # http://localhost:8788
```

Open `http://localhost:8788/?k=<your GUEST_TOKEN>` and press "Show Wi-Fi". The first run downloads
Wrangler, Cloudflare's CLI, through `npx`.

## 1. Fork the repository

Fork it on GitHub (or push a copy to your own account). Cloudflare will deploy from it.

## 2. Collect your calendar links

For each Airbnb listing: open the listing's **Calendar**, then **Availability**, then the calendar sync
section (**Connect to another website** / **Export calendar**) and copy the link that ends in `.ics?...`.

Treat these links as secrets: anyone who has one can read that listing's bookings. Choose a short id
for each listing (`A1`, `A2`, `B1`...): letters, digits and `_`, up to 16 characters.

## 3. Create the guests project

1. Cloudflare dashboard, **Workers & Pages**, **Create**, **Pages**, **Connect to Git**, pick your fork.
2. Build settings:
   - Framework preset: **None**
   - Build command: *(empty)*
   - Build output directory: `public`
   - Root directory (advanced): `guests`
3. **Save and Deploy**.
4. **Settings**, **Variables and Secrets**, add as type **Secret**:

   | Name | Value |
   |---|---|
   | `GUEST_TOKEN` | output of `npm run token` |
   | `WIFI_SSID` | your network name |
   | `WIFI_PASS` | your Wi-Fi password |

5. **Deployments**, latest, **Retry deployment**. Secrets only apply to new deployments.
6. Test it: `npm run token -- https://<your-guests-project>.pages.dev/` prints a link; open it, then "Show Wi-Fi".
   Put that link in your Airbnb check-in message.

Replace `guests/public/index.html` with your real guide. Keep `_routes.json` and add the paths of
your pages to its `include` list, so the middleware runs on them and not on images or fonts.

## 4. Create the staff project

1. Same steps as above with Root directory `staff`.
2. Variables (type **Text** for the first four, **Secret** for the calendar links):

   | Name | Example |
   |---|---|
   | `UNITS` | `A1,A2,B1` |
   | `TIMEZONE` | `America/Lima` (any [IANA zone](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)) |
   | `ALLOWED_ORIGINS` | `https://www.your-site.com,https://your-site.com` |
   | `ICAL_A1`, `ICAL_A2`, `ICAL_B1` | the `.ics` links from step 2 |

   `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` come in the next step.
3. Check the public endpoint: `https://<your-staff-project>.pages.dev/api/availability?checkin=YYYY-MM-DD&checkout=YYYY-MM-DD`
   should answer `{ "units": { ... } }`. `/api/today` must answer `403` for now: that is correct.

## 5. Protect the staff project with Cloudflare Access

1. Open **Zero Trust** in the dashboard. The first time, pick a team name; your team domain is
   `https://<team>.cloudflareaccess.com`. The free plan covers up to 50 users.
2. **Settings**, **Authentication**: make sure **One-time PIN** is enabled (login with an emailed code).
3. **Access**, **Applications**, **Add an application**, **Self-hosted**:
   - Domain: your staff project's domain (`<project>.pages.dev` or your custom domain).
   - Policy: **Allow**, include **Emails**: the addresses of your team.
4. Open the application again and copy the **Application Audience (AUD) Tag**.
5. A second self-hosted application for the public search:
   - Same domain, path `api/availability`.
   - Policy: action **Bypass**, include **Everyone**.
6. Back in the staff Pages project, add the variables `ACCESS_TEAM_DOMAIN` (`https://<team>.cloudflareaccess.com`)
   and `ACCESS_AUD` (the tag), then **Retry deployment**.
7. Open the staff site: Access asks for your email, sends a code, and the table of today's statuses appears.

## 6. Connect your public website

Copy the form from [`examples/availability-search.html`](../examples/availability-search.html) into
your site, set `API` to your staff project's `/api/availability` URL, and make sure your site's origin
is in `ALLOWED_ORIGINS`.

## 7. Optional hardening

- **Custom domains** for both projects (Pages, **Custom domains**). Access and rate limiting work best on your own domain.
- **Rate limiting**: in your domain's **Security**, **WAF**, **Rate limiting rules**, limit requests to
  the guide's hostname (for example 30 per minute per IP). This keeps anyone from burning the free quota.
- **Rotate the guest token** every few weeks: move `GUEST_TOKEN` to `GUEST_TOKEN_PREV`, set a new
  `GUEST_TOKEN` from `npm run token`, redeploy, and update the check-in message.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `503 not-configured` | Variables missing, or set after the last deployment. Check names, then **Retry deployment** |
| `/api/wifi` stays `401` after opening the link | The token in the link does not match `GUEST_TOKEN`, or the browser blocks cookies on the domain |
| `/api/today` is `403` even after signing in | `ACCESS_AUD` is from another application, or `ACCESS_TEAM_DOMAIN` has a typo or a trailing path |
| A unit is always in `missing` | Its `ICAL_<id>` is empty, is not an Airbnb export link, or the listing was deleted |
| The browser console says CORS on your site | Add your exact origin (scheme + host, no trailing `/`) to `ALLOWED_ORIGINS` and redeploy |
| `/api/availability` asks for a login | The Bypass application for `api/availability` is missing or has a different domain |
