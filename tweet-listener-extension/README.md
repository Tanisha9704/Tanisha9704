# Tweet Listener

A tiny Chrome extension that reads tweets aloud. Paste a tweet URL (or grab
the active tab), pick a voice, hit play, get back to your other work.

No API keys, no accounts, no paid services — it uses the browser's built-in
Web Speech API and Twitter's public syndication endpoint.

## Install (developer mode — free, no Chrome Web Store needed)

1. Download this repo: click the green **Code** button → **Download ZIP**, then unzip it.
   (Or `git clone` it.)
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked**.
5. Select the unzipped folder (the one containing `manifest.json`).
6. Pin the extension to your toolbar — done.

Works in any Chromium browser (Chrome, Edge, Brave, Arc, Opera).

## How to use

1. Click the extension icon.
2. Paste a tweet URL like `https://x.com/user/status/123…` (or click **Use tab**
   if you're already on a tweet).
3. Click **Load tweet** — the text appears.
4. Hit **▶ Play**.

You can change the voice, speed (0.5×–2×), and pitch. Settings are remembered
between sessions.

## What it can read

- Any public tweet (text only — images and videos are skipped)
- Threads: paste each tweet URL one at a time

## What it can't read

- Private / protected accounts
- Deleted or age-restricted tweets
- Tweets behind X's login wall in certain regions

If a tweet won't load, that's almost always the reason.

## How it works

- **Fetching the tweet** — calls Twitter's public syndication endpoint
  (`cdn.syndication.twimg.com`), the same one used by embedded tweets on
  blogs. No login required.
- **Speaking** — uses
  [`SpeechSynthesis`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis),
  built into every modern browser. Voice quality depends on your OS —
  macOS and Windows ship pretty natural voices these days.

## Files

```
manifest.json   Chrome MV3 manifest
popup.html      The popup UI
popup.css       Styling
popup.js        Tweet fetching + TTS logic
icons/          16/48/128 px icons
```

## Want a more natural AI voice?

Swap the Web Speech API call in `popup.js` (`play()` function) for a fetch
to ElevenLabs or OpenAI TTS, then play the returned audio with an `<audio>`
element. You'll need an API key and the extension will need
`host_permissions` for the TTS endpoint.

## License

MIT — see [LICENSE](./LICENSE).
