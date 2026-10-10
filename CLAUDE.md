# caninec.cz — Claude instructions

Michal's personal website. One static page (`index.html`, landscape art inlined) + `photos/` (WebP, EXIF/GPS stripped). No build step.

## Local preview
`./dev-up.sh` → http://localhost:8140/ (detached, `Cache-Control: no-store`, log `/tmp/caninec-8140.log`).

## Photos
New photos: resize to WebP with `magick <src> -auto-orient -strip -resize 1800x1800> -quality 80 photos/full/<YYYY-MM-DD_HH-MM>.webp` and a 560×700 cover crop into `photos/thumb/`. Always `-strip` (phone photos carry GPS). Captions are place (only when known) + month/year — no invented titles.

## Nasazení do produkce
- **Prerekvizity:** změny commitnuté a ověřené na localhostu; feature práce na `feature/<slug>`.
- **Nasazení:** `git checkout main && git merge --ff-only feature/<slug> && git push origin main` (push jako účet `MajklCan`). GitHub Pages (legacy build z `main`, `/`) nasadí sám během ~1 min.
- **Kontrola:** `gh api repos/MajklCan/caninec.cz/pages/builds/latest --jq .status` = `built` s commitem = hash z `main`; https://caninec.cz vrací 200 a obsahuje změnu; https://www.caninec.cz → 301 na apex.
- **Rollback:** `git revert <hash> && git push origin main`.
- **Záznam:** `Personal-knowledge-base/context/sessions/YYYY-MM.md` (hash + co se nasadilo).
- **Infra:** DNS na Webglobe (admin.webglobe.cz): apex A → 185.199.108–111.153, `www` CNAME → `majklcan.github.io.`; mail záznamy (Seznam) neměnit. HTTPS cert od GitHubu, enforce HTTPS zapnuto.
