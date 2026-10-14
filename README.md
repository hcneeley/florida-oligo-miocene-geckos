# Accessible poster site

Web version of **V8(10-13-26FIXED)FINAL_VERSION.pdf** with:

- Built-in **Listen** screen reader (Web Speech API) — full page or per section
- Keyboard shortcuts: **Alt+R** read page, **Alt+S** stop
- **Captions** on all figures; long descriptions for graphs
- **Data tables** for graphs and charts
- High contrast mode, text size controls, and colorblind filters
- Semantic landmarks, skip link, and focus styles for assistive tech

## Open locally

```bash
python3 -m http.server 8765
```

Then visit http://127.0.0.1:8765/

## GitHub Pages

After pushing to GitHub: **Settings → Pages → Deploy from branch `main` / root (`/`)**.
The site will be at `https://<username>.github.io/<repo-name>/`.
