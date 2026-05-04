# Artemis II Photo Archive — Browser

Embeddable single-page app that browses NASA's full Artemis II photo archive
(4,600+ public-domain images) via the [NASA Image Library API](https://api.nasa.gov/).

## Stack
- **Pure static HTML/CSS/JS** — no backend, no build step
- **NASA Image Library API** (`https://images-api.nasa.gov`) — CORS-enabled, no API key required
- Deployed on **Vercel** as static files

## Embed in PhotoWorkout posts
```html
<iframe
  src="https://artemis-photos.photoworkout.com/"
  width="100%"
  height="900"
  style="border: 0; border-radius: 12px;"
  loading="lazy"
  title="NASA Artemis II Photo Archive">
</iframe>
```

URL params: `?q=...` (custom query), `?p=N` (page number).

## Local dev
```bash
python3 -m http.server 8080
# Open http://localhost:8080/
```

## Files
- `index.html` — markup + DOM scaffold
- `style.css` — dark theme, PW-orange accents, responsive grid
- `app.js` — vanilla JS, ~250 lines, fetches + renders + lightbox

## Credits
Photos © NASA — public domain under
[NASA media usage](https://www.nasa.gov/nasa-brand-center/images-and-media/).
Built by [PhotoWorkout](https://www.photoworkout.com/).
