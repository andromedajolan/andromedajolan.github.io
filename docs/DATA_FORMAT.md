# Abditum suite data formats

Ianua (the launcher) reads and writes only the formats below. All apps share one origin
(andromedajolan.github.io), so every storage name must be unique to its app. Each format has a `schema`
number; a change that old readers cannot understand gets a new number.

## 1. `registry.json` (schema 1)

Lives in the launcher root. Built in, cached for offline use. Adding an app means adding one entry.

```json
{
  "schema": 1,
  "version": "1.1.0",
  "apps": [
    {
      "id": "stilus",
      "kind": "app",
      "group": "main",
      "order": 1,
      "name": "Stilus",
      "description": "Write lyrics with sections, chords and rhymes.",
      "repo": "lyric-writer",
      "path": "/lyric-writer/",
      "status": "live",
      "accent": "#f3b962",
      "icon": "icons/stilus-96.png",
      "icon192": "icons/stilus-192.png",
      "summaryKey": "lyricwriter.summary"
    }
  ]
}
```

- `kind`: `app` (opens in the same tab) or `link` (outbound, opens in a new tab, uses `url` instead of `path`).
- `group`: `main` or `side`. `status`: `live` or `soon` (dimmed, does nothing).
- Number keys 1 to 9 map to `kind: "app"` entries in `order`.
- `summaryKey`: the localStorage key where the app publishes its summary (section 3), or `null`.

## 2. `suite-app.json` (schema 1), optional

Served at an app's root, for example `/lyric-writer/suite-app.json`. The launcher fetches it uncached when online
and ignores any failure, 404 or mismatch.

```json
{ "schema": 1, "id": "stilus", "name": "Stilus", "version": "1.4.0", "updated": "2026-11-19" }
```

`id` must equal the registry id. `version` is dotted numbers. The launcher remembers the last version it saw
when you opened the app from the launcher; a higher version later shows "update available" on the card until you open it.

## 3. App summary (schema 1), optional

One localStorage key per app, named in its registry entry (convention `<prefix>.summary`). The launcher reads these
keys only, read-only, and never any app's database or other keys.

```json
{
  "schema": 1,
  "appId": "stilus",
  "version": "1.4.0",
  "lastOpened": "2026-11-19T08:15:00.000Z",
  "recent": [ { "id": "song-7f3a", "title": "Pretty, Broken Thing", "updated": "2026-11-18T22:10:00.000Z" } ]
}
```

`recent` is newest first. Where an item is a song, `id` is the stable song id. The "Continue where you left off"
strip shows the app with the latest `lastOpened` (or last launcher open) and the title of `recent[0]`.

## 4. Ianua's own storage

| Item | Name |
| --- | --- |
| Database | `ianua-db` (store `kv`, key `settings`: mirror of the keys below) |
| Cache | `ianua-cache-<version>` |
| Keys | `ianua.last`, `ianua.seen`, `ianua.versions`; session key `ianua.splashSeen` |
| Shared | `studio.theme` (`dark`, `gray` or `light`) |

## 5. Settings export (schema 1)

"Export settings" downloads `ianua-settings.json`; "Import settings" restores it. Anything unknown or malformed is ignored.

```json
{
  "schema": 1, "app": "ianua", "version": "1.1.0", "exported": "2026-11-19T08:30:00.000Z",
  "settings": {
    "theme": "dark",
    "last": { "id": "stilus", "at": "2026-11-19T08:15:00.000Z" },
    "seen": { "stilus": "1.4.0" },
    "versions": { "stilus": { "v": "1.4.0", "updated": "2026-11-19", "checked": "2026-11-19T08:15:00.000Z" } }
  }
}
```
