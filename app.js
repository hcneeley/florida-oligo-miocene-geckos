(() => {
  const statusEl = document.getElementById("sr-status");
  const btnListenPage = document.getElementById("btn-listen-page");
  const btnStop = document.getElementById("btn-stop");
  const btnCaptions = document.getElementById("btn-captions");
  const btnContrast = document.getElementById("btn-contrast");
  const btnLarger = document.getElementById("btn-text-larger");
  const btnSmaller = document.getElementById("btn-text-smaller");
  const btnResetZoom = document.getElementById("btn-text-reset");
  const colorblindSelect = document.getElementById("colorblind-filter");

  const STORAGE_KEY = "gecko-poster-a11y-v5";
  const MIN_TEXT = 14; // pt
  const MAX_TEXT = 32; // pt
  const TEXT_STEP = 2;
  const DEFAULT_TEXT = 18; // pt
  const COLORBLIND_TYPES = [
    "none",
    "protanopia",
    "deuteranopia",
    "tritanopia",
    "protanomaly",
    "deuteranomaly",
    "tritanomaly",
    "achromatopsia",
  ];

  let textScale = DEFAULT_TEXT;
  let colorblindFilter = "none";
  let queue = [];
  let speaking = false;

  const speechSupported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

  function setStatus(message) {
    if (statusEl) statusEl.textContent = message;
  }

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const prefs = JSON.parse(raw);
      if (typeof prefs.textScale === "number") textScale = prefs.textScale;
      if (prefs.highContrast) {
        document.body.classList.add("high-contrast");
        btnContrast?.setAttribute("aria-pressed", "true");
      }
      if (prefs.captions === false) {
        document.body.classList.add("captions-off");
        btnCaptions?.setAttribute("aria-pressed", "false");
        if (btnCaptions) btnCaptions.textContent = "Captions off";
      }
      if (typeof prefs.colorblindFilter === "string" && COLORBLIND_TYPES.includes(prefs.colorblindFilter)) {
        colorblindFilter = prefs.colorblindFilter;
      }
    } catch {
      /* ignore corrupt prefs */
    }
    applyTextScale();
    applyColorblindFilter();
  }

  function savePrefs() {
    const prefs = {
      textScale,
      highContrast: document.body.classList.contains("high-contrast"),
      captions: !document.body.classList.contains("captions-off"),
      colorblindFilter,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }

  function applyTextScale() {
    document.documentElement.style.setProperty("--text", `${textScale}pt`);
  }

  function applyColorblindFilter() {
    const root = document.documentElement;
    COLORBLIND_TYPES.forEach((type) => {
      if (type !== "none") root.classList.remove(`cb-${type}`);
    });
    if (colorblindFilter !== "none") {
      root.classList.add(`cb-${colorblindFilter}`);
    }
    if (colorblindSelect) colorblindSelect.value = colorblindFilter;
  }

  function clearSpeakingClass() {
    document.querySelectorAll(".is-speaking").forEach((el) => el.classList.remove("is-speaking"));
  }

  function stopSpeech() {
    if (speechSupported) window.speechSynthesis.cancel();
    queue = [];
    speaking = false;
    document.body.classList.remove("reading-active");
    clearSpeakingClass();
    btnListenPage?.setAttribute("aria-pressed", "false");
    if (btnListenPage) btnListenPage.textContent = "Listen to page";
    if (btnStop) btnStop.disabled = true;
    setStatus("Speech stopped.");
  }

  function readableText(root) {
    const clone = root.cloneNode(true);
    clone.querySelectorAll("button, .listen-section, script, style").forEach((n) => n.remove());
    // Prefer visible captions/long descriptions when present
    const text = clone.innerText || clone.textContent || "";
    return text.replace(/\s+/g, " ").trim();
  }

  function speakChunks(chunks, label) {
    if (!speechSupported) {
      setStatus("Speech synthesis is not supported in this browser. Use a system screen reader such as VoiceOver.");
      return;
    }

    stopSpeechQuiet();
    document.body.classList.add("reading-active");
    speaking = true;
    btnListenPage?.setAttribute("aria-pressed", "true");
    if (btnListenPage) btnListenPage.textContent = "Listening…";
    if (btnStop) btnStop.disabled = false;
    setStatus(label || "Reading…");

    queue = chunks.filter((c) => c.text && c.text.length);
    let index = 0;

    const speakNext = () => {
      if (index >= queue.length) {
        speaking = false;
        document.body.classList.remove("reading-active");
        clearSpeakingClass();
        btnListenPage?.setAttribute("aria-pressed", "false");
        if (btnListenPage) btnListenPage.textContent = "Listen to page";
        if (btnStop) btnStop.disabled = true;
        setStatus("Finished reading.");
        return;
      }

      const item = queue[index];
      clearSpeakingClass();
      if (item.el) item.el.classList.add("is-speaking");

      const utter = new SpeechSynthesisUtterance(item.text);
      utter.rate = 1;
      utter.pitch = 1;
      utter.onstart = () => {
        setStatus(`Reading: ${item.title || "section"}`);
      };
      utter.onend = () => {
        index += 1;
        speakNext();
      };
      utter.onerror = () => {
        index += 1;
        speakNext();
      };
      window.speechSynthesis.speak(utter);
    };

    // Some browsers need a beat after cancel()
    window.setTimeout(speakNext, 60);
  }

  function stopSpeechQuiet() {
    if (speechSupported) window.speechSynthesis.cancel();
    queue = [];
    speaking = false;
    clearSpeakingClass();
  }

  function listenToPage() {
    if (speaking) {
      stopSpeech();
      return;
    }
    const sections = [...document.querySelectorAll("main [data-readable]")];
    const chunks = sections.map((el) => ({
      el,
      title: el.querySelector("h2, h3")?.innerText || "section",
      text: readableText(el),
    }));
    speakChunks(chunks, "Reading full page…");
  }

  function listenToSection(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const title = el.querySelector("h2, h3")?.innerText || id;
    speakChunks([{ el, title, text: readableText(el) }], `Reading ${title}`);
  }

  btnListenPage?.addEventListener("click", listenToPage);
  btnStop?.addEventListener("click", stopSpeech);

  document.querySelectorAll("[data-listen-target]").forEach((btn) => {
    btn.addEventListener("click", () => {
      listenToSection(btn.getAttribute("data-listen-target"));
    });
  });

  btnCaptions?.addEventListener("click", () => {
    const off = document.body.classList.toggle("captions-off");
    btnCaptions.setAttribute("aria-pressed", off ? "false" : "true");
    btnCaptions.textContent = off ? "Captions off" : "Captions on";
    setStatus(off ? "Figure captions visually hidden (still available to screen readers)." : "Figure captions shown.");
    savePrefs();
  });

  btnContrast?.addEventListener("click", () => {
    const on = document.body.classList.toggle("high-contrast");
    btnContrast.setAttribute("aria-pressed", on ? "true" : "false");
    setStatus(on ? "High contrast on." : "High contrast off.");
    savePrefs();
  });

  btnLarger?.addEventListener("click", () => {
    textScale = Math.min(MAX_TEXT, textScale + TEXT_STEP);
    applyTextScale();
    setStatus(`Text size ${textScale}pt.`);
    savePrefs();
  });

  btnSmaller?.addEventListener("click", () => {
    textScale = Math.max(MIN_TEXT, textScale - TEXT_STEP);
    applyTextScale();
    setStatus(`Text size ${textScale}pt.`);
    savePrefs();
  });

  btnResetZoom?.addEventListener("click", () => {
    textScale = DEFAULT_TEXT;
    applyTextScale();
    setStatus(`Text size reset to ${DEFAULT_TEXT}pt.`);
    savePrefs();
  });

  colorblindSelect?.addEventListener("change", () => {
    const next = colorblindSelect.value;
    colorblindFilter = COLORBLIND_TYPES.includes(next) ? next : "none";
    applyColorblindFilter();
    const label = colorblindSelect.options[colorblindSelect.selectedIndex]?.text || colorblindFilter;
    setStatus(colorblindFilter === "none" ? "Colorblind filter off." : `Colorblind filter: ${label}.`);
    savePrefs();
  });

  // Keyboard shortcuts: Alt+R read page, Alt+S stop
  document.addEventListener("keydown", (e) => {
    if (!e.altKey) return;
    if (e.key.toLowerCase() === "r") {
      e.preventDefault();
      listenToPage();
    }
    if (e.key.toLowerCase() === "s") {
      e.preventDefault();
      stopSpeech();
    }
  });

  window.addEventListener("beforeunload", () => {
    if (speechSupported) window.speechSynthesis.cancel();
  });

  if (!speechSupported) {
    btnListenPage?.setAttribute("disabled", "true");
    document.querySelectorAll(".listen-section").forEach((b) => b.setAttribute("disabled", "true"));
    setStatus("Built-in speech unavailable. Use VoiceOver (Cmd+F5) or another screen reader.");
  } else {
    setStatus("Ready. Press “Listen to page” or Alt+R. Stop with Alt+S.");
  }

  // Side nav popout + active section highlight
  const sideNav = document.getElementById("side-nav");
  const sideToggle = document.getElementById("side-nav-toggle");
  const sideClose = document.getElementById("side-nav-close");
  const sideBackdrop = document.getElementById("side-nav-backdrop");
  const sideButtons = [...document.querySelectorAll(".side-nav__btn")];

  function isSideNavOpen() {
    return sideNav?.classList.contains("is-open");
  }

  function openSideNav() {
    if (!sideNav) return;
    sideNav.classList.add("is-open");
    sideNav.setAttribute("aria-hidden", "false");
    sideBackdrop?.classList.add("is-open");
    sideBackdrop?.setAttribute("aria-hidden", "false");
    sideToggle?.setAttribute("aria-expanded", "true");
    document.body.classList.add("side-nav-open");
    sideClose?.focus();
  }

  function closeSideNav({ restoreFocus = true } = {}) {
    if (!sideNav) return;
    sideNav.classList.remove("is-open");
    sideNav.setAttribute("aria-hidden", "true");
    sideBackdrop?.classList.remove("is-open");
    sideBackdrop?.setAttribute("aria-hidden", "true");
    sideToggle?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("side-nav-open");
    if (restoreFocus) sideToggle?.focus();
  }

  function goToSection(id) {
    const el = document.getElementById(id);
    if (!el) return;
    closeSideNav({ restoreFocus: false });
    window.requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
      el.focus({ preventScroll: true });
    });
  }

  sideToggle?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isSideNavOpen()) closeSideNav();
    else openSideNav();
  });
  sideClose?.addEventListener("click", (e) => {
    e.preventDefault();
    closeSideNav();
  });
  sideBackdrop?.addEventListener("click", () => closeSideNav());
  sideButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      goToSection(btn.getAttribute("data-target"));
    });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isSideNavOpen()) {
      e.preventDefault();
      closeSideNav();
    }
  });

  const observed = sideButtons
    .map((btn) => document.getElementById(btn.getAttribute("data-target")))
    .filter(Boolean);

  if (sideButtons.length && observed.length && "IntersectionObserver" in window) {
    const visible = new Map();
    const setActive = (id) => {
      sideButtons.forEach((btn) => {
        btn.classList.toggle("is-active", btn.getAttribute("data-target") === id);
      });
    };
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          visible.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
        });
        let bestId = null;
        let bestRatio = 0;
        for (const [id, ratio] of visible) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }
        if (bestId) setActive(bestId);
      },
      {
        rootMargin: "-20% 0px -55% 0px",
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
      }
    );
    observed.forEach((el) => io.observe(el));
  }

  loadPrefs();
})();
