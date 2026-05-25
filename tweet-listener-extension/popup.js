const els = {
  url: document.getElementById("tweet-url"),
  useTab: document.getElementById("use-current-tab"),
  fetch: document.getElementById("fetch-btn"),
  status: document.getElementById("status"),
  preview: document.getElementById("tweet-preview"),
  authorName: document.getElementById("author-name"),
  authorHandle: document.getElementById("author-handle"),
  text: document.getElementById("tweet-text"),
  controls: document.getElementById("controls"),
  play: document.getElementById("play-btn"),
  pause: document.getElementById("pause-btn"),
  stop: document.getElementById("stop-btn"),
  rate: document.getElementById("rate"),
  rateOut: document.getElementById("rate-out"),
  pitch: document.getElementById("pitch"),
  pitchOut: document.getElementById("pitch-out"),
  voice: document.getElementById("voice"),
};

const synth = window.speechSynthesis;
let currentText = "";
let currentUtterance = null;
let voices = [];

function setStatus(msg, isError = false) {
  els.status.textContent = msg;
  els.status.classList.toggle("error", isError);
}

function extractTweetId(input) {
  const trimmed = (input || "").trim();
  if (/^\d{5,25}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(
    /(?:twitter\.com|x\.com)\/[^/]+\/status(?:es)?\/(\d+)/i,
  );
  return match ? match[1] : null;
}

// Token derivation used by Twitter's public syndication endpoint.
// Same algorithm used by react-tweet and other public tweet renderers.
function syndicationToken(id) {
  return ((Number(id) / 1e15) * Math.PI)
    .toString(36)
    .replace(/(0+|\.)/g, "");
}

async function fetchTweet(id) {
  const token = syndicationToken(id);
  const url = `https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${token}&lang=en`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Twitter responded ${res.status}`);
  }
  return res.json();
}

function entitiesToText(tweet) {
  // The syndication endpoint returns `text` plus `entities` for links/mentions.
  // `text` is already the readable form for our purposes.
  let text = tweet.text || "";

  // Replace t.co URLs with their expanded display form when available.
  if (Array.isArray(tweet.entities?.urls)) {
    for (const u of tweet.entities.urls) {
      if (u.url && u.display_url) {
        text = text.split(u.url).join(u.display_url);
      }
    }
  }

  // Strip leftover bare t.co links so the TTS doesn't read them out.
  text = text.replace(/https?:\/\/t\.co\/\S+/g, "");

  // Convert &amp; etc.
  const tmp = document.createElement("textarea");
  tmp.innerHTML = text;
  return tmp.value.trim();
}

function showTweet(tweet) {
  const text = entitiesToText(tweet);
  currentText = text;
  els.authorName.textContent = tweet.user?.name || "Unknown";
  els.authorHandle.textContent = tweet.user?.screen_name
    ? `@${tweet.user.screen_name}`
    : "";
  els.text.textContent = text || "(empty tweet)";
  els.preview.classList.remove("hidden");
  els.controls.classList.remove("hidden");
}

async function loadTweet() {
  const id = extractTweetId(els.url.value);
  if (!id) {
    setStatus("That doesn't look like a tweet URL.", true);
    return;
  }
  setStatus("Loading tweet…");
  els.fetch.disabled = true;
  try {
    const tweet = await fetchTweet(id);
    showTweet(tweet);
    setStatus("Ready. Press play.");
    chrome.storage?.local.set({ lastUrl: els.url.value });
  } catch (err) {
    console.error(err);
    setStatus(
      "Couldn't load that tweet. It may be private, deleted, or age-restricted.",
      true,
    );
  } finally {
    els.fetch.disabled = false;
  }
}

function populateVoices() {
  voices = synth.getVoices();
  els.voice.innerHTML = "";
  if (!voices.length) {
    const opt = document.createElement("option");
    opt.textContent = "Default";
    els.voice.appendChild(opt);
    return;
  }
  const sorted = [...voices].sort((a, b) => {
    const aEn = a.lang.startsWith("en") ? 0 : 1;
    const bEn = b.lang.startsWith("en") ? 0 : 1;
    if (aEn !== bEn) return aEn - bEn;
    return a.name.localeCompare(b.name);
  });
  for (const v of sorted) {
    const opt = document.createElement("option");
    opt.value = v.name;
    opt.textContent = `${v.name} (${v.lang})`;
    els.voice.appendChild(opt);
  }
  chrome.storage?.local.get(["voice"], (data) => {
    if (data?.voice) els.voice.value = data.voice;
  });
}

function play() {
  if (!currentText) return;
  if (synth.paused && currentUtterance) {
    synth.resume();
  } else {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(currentText);
    const selected = voices.find((v) => v.name === els.voice.value);
    if (selected) u.voice = selected;
    u.rate = parseFloat(els.rate.value);
    u.pitch = parseFloat(els.pitch.value);
    u.onend = () => updateButtons("idle");
    u.onerror = (e) => {
      console.error(e);
      setStatus("Playback error.", true);
      updateButtons("idle");
    };
    currentUtterance = u;
    synth.speak(u);
  }
  updateButtons("playing");
}

function pause() {
  if (synth.speaking) {
    synth.pause();
    updateButtons("paused");
  }
}

function stop() {
  synth.cancel();
  currentUtterance = null;
  updateButtons("idle");
}

function updateButtons(state) {
  els.play.disabled = state === "playing";
  els.pause.disabled = state !== "playing";
  els.stop.disabled = state === "idle";
}

function bind() {
  els.fetch.addEventListener("click", loadTweet);
  els.url.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loadTweet();
  });

  els.useTab.addEventListener("click", async () => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab?.url) {
        els.url.value = tab.url;
        if (extractTweetId(tab.url)) loadTweet();
        else setStatus("Active tab isn't a tweet URL.", true);
      }
    } catch (err) {
      console.error(err);
      setStatus("Couldn't read active tab.", true);
    }
  });

  els.play.addEventListener("click", play);
  els.pause.addEventListener("click", pause);
  els.stop.addEventListener("click", stop);

  els.rate.addEventListener("input", () => {
    els.rateOut.textContent = `${parseFloat(els.rate.value).toFixed(1)}×`;
    chrome.storage?.local.set({ rate: els.rate.value });
  });
  els.pitch.addEventListener("input", () => {
    els.pitchOut.textContent = parseFloat(els.pitch.value).toFixed(1);
    chrome.storage?.local.set({ pitch: els.pitch.value });
  });
  els.voice.addEventListener("change", () => {
    chrome.storage?.local.set({ voice: els.voice.value });
  });
}

function restoreSettings() {
  chrome.storage?.local.get(["rate", "pitch", "lastUrl"], (data) => {
    if (data?.rate) {
      els.rate.value = data.rate;
      els.rateOut.textContent = `${parseFloat(data.rate).toFixed(1)}×`;
    }
    if (data?.pitch) {
      els.pitch.value = data.pitch;
      els.pitchOut.textContent = parseFloat(data.pitch).toFixed(1);
    }
    if (data?.lastUrl) els.url.value = data.lastUrl;
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bind();
  populateVoices();
  if (synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = populateVoices;
  }
  restoreSettings();
  updateButtons("idle");
});

// Stop speech if popup closes mid-playback so it doesn't keep talking
// from a hidden context on next open.
window.addEventListener("unload", () => {
  synth.cancel();
});
