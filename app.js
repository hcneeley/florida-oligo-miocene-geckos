(() => {
  const statusEl = document.getElementById("sr-status");
  const btnListenPage = document.getElementById("btn-listen-page");
  const btnStop = document.getElementById("btn-stop");
  const btnCaptions = document.getElementById("btn-captions");
  const btnContrast = document.getElementById("btn-contrast");
  const btnDyslexia = document.getElementById("btn-dyslexia");
  const btnLarger = document.getElementById("btn-text-larger");
  const btnSmaller = document.getElementById("btn-text-smaller");
  const btnResetZoom = document.getElementById("btn-text-reset");
  const colorblindSelect = document.getElementById("colorblind-filter");
  const btnVoiceMenu = document.getElementById("btn-voice-menu");
  const voiceMenuPanel = document.getElementById("voice-menu-panel");
  const speechRateSelect = document.getElementById("speech-rate");
  const speechVoiceSelect = document.getElementById("speech-voice");
  const a11yBarToggle = document.getElementById("a11y-bar-toggle");
  const a11yBarToggleLabel = a11yBarToggle?.querySelector(".visually-hidden");

  const STORAGE_KEY = "gecko-poster-a11y-v5";
  const MIN_TEXT = 14; // pt
  const MAX_TEXT = 48; // pt
  const TEXT_STEP = 2;
  const DEFAULT_TEXT = 18; // pt
  const DEFAULT_SPEECH_RATE = 1;
  const SPEECH_RATES = [0.75, 1, 1.25, 1.5];
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
  let speechRate = DEFAULT_SPEECH_RATE;
  let speechVoiceURI = "";
  let queue = [];
  let speaking = false;
  let speechSession = 0;

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
      if (prefs.dyslexiaFont) {
        document.body.classList.add("dyslexia-font");
        btnDyslexia?.setAttribute("aria-pressed", "true");
      }
      if (prefs.captions === false) {
        document.body.classList.add("captions-off");
        btnCaptions?.setAttribute("aria-pressed", "false");
        if (btnCaptions) btnCaptions.textContent = "Captions off";
      }
      if (typeof prefs.colorblindFilter === "string" && COLORBLIND_TYPES.includes(prefs.colorblindFilter)) {
        colorblindFilter = prefs.colorblindFilter;
      }
      if (typeof prefs.speechRate === "number" && SPEECH_RATES.includes(prefs.speechRate)) {
        speechRate = prefs.speechRate;
      }
      if (typeof prefs.speechVoiceURI === "string") {
        speechVoiceURI = prefs.speechVoiceURI;
      }
    } catch {
      /* ignore corrupt prefs */
    }
    applyTextScale();
    applyColorblindFilter();
    applySpeechControls();
  }

  function savePrefs() {
    const prefs = {
      textScale,
      highContrast: document.body.classList.contains("high-contrast"),
      dyslexiaFont: document.body.classList.contains("dyslexia-font"),
      captions: !document.body.classList.contains("captions-off"),
      colorblindFilter,
      speechRate,
      speechVoiceURI,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }

  function getSpeechVoices() {
    if (!speechSupported) return [];
    return window.speechSynthesis.getVoices() || [];
  }

  function populateSpeechVoices() {
    if (!speechVoiceSelect) return;
    const voices = getSpeechVoices();
    const previous = speechVoiceURI || speechVoiceSelect.value;
    speechVoiceSelect.innerHTML = "";
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = "System default";
    speechVoiceSelect.appendChild(defaultOpt);

    voices
      .slice()
      .sort((a, b) => {
        const aEn = (a.lang || "").toLowerCase().startsWith("en") ? 0 : 1;
        const bEn = (b.lang || "").toLowerCase().startsWith("en") ? 0 : 1;
        if (aEn !== bEn) return aEn - bEn;
        return (a.name || "").localeCompare(b.name || "");
      })
      .forEach((voice) => {
        const opt = document.createElement("option");
        opt.value = voice.voiceURI;
        opt.textContent = `${voice.name} (${voice.lang})`;
        speechVoiceSelect.appendChild(opt);
      });

    if (previous && [...speechVoiceSelect.options].some((o) => o.value === previous)) {
      speechVoiceSelect.value = previous;
      speechVoiceURI = previous;
    } else {
      speechVoiceSelect.value = "";
      if (previous) speechVoiceURI = "";
    }
  }

  function applySpeechControls() {
    if (speechRateSelect) speechRateSelect.value = String(speechRate);
    if (speechVoiceSelect) {
      speechVoiceSelect.value =
        speechVoiceURI && [...speechVoiceSelect.options].some((o) => o.value === speechVoiceURI)
          ? speechVoiceURI
          : "";
    }
  }

  function configureUtterance(utter) {
    utter.rate = speechRate;
    utter.pitch = 1;
    if (speechVoiceURI) {
      const voice = getSpeechVoices().find((v) => v.voiceURI === speechVoiceURI);
      if (voice) utter.voice = voice;
    }
  }

  function setVoiceMenuOpen(open) {
    if (!btnVoiceMenu || !voiceMenuPanel) return;
    voiceMenuPanel.hidden = !open;
    btnVoiceMenu.setAttribute("aria-expanded", open ? "true" : "false");
    btnVoiceMenu.classList.toggle("a11y-btn--primary", open);
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

  function stopSpeechQuiet() {
    // Bump session so in-flight onend/onerror handlers from cancel() do not continue.
    speechSession += 1;
    if (speechSupported) window.speechSynthesis.cancel();
    queue = [];
    speaking = false;
    clearSpeakingClass();
  }

  function stopSpeech() {
    stopSpeechQuiet();
    document.body.classList.remove("reading-active");
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
    const session = speechSession;
    document.body.classList.add("reading-active");
    speaking = true;
    btnListenPage?.setAttribute("aria-pressed", "true");
    if (btnListenPage) btnListenPage.textContent = "Listening…";
    if (btnStop) btnStop.disabled = false;
    setStatus(label || "Reading…");

    queue = chunks.filter((c) => c.text && c.text.length);
    let index = 0;

    const isActive = () => session === speechSession && speaking;

    const finishReading = (message) => {
      if (session !== speechSession) return;
      speaking = false;
      document.body.classList.remove("reading-active");
      clearSpeakingClass();
      btnListenPage?.setAttribute("aria-pressed", "false");
      if (btnListenPage) btnListenPage.textContent = "Listen to page";
      if (btnStop) btnStop.disabled = true;
      setStatus(message);
    };

    const speakNext = () => {
      if (!isActive()) return;
      if (index >= queue.length) {
        finishReading("Finished reading.");
        return;
      }

      const item = queue[index];
      clearSpeakingClass();
      if (item.el) item.el.classList.add("is-speaking");

      const utter = new SpeechSynthesisUtterance(item.text);
      configureUtterance(utter);
      utter.onstart = () => {
        if (!isActive()) return;
        setStatus(`Reading: ${item.title || "section"}`);
      };
      utter.onend = () => {
        if (!isActive()) return;
        index += 1;
        speakNext();
      };
      utter.onerror = (event) => {
        if (!isActive()) return;
        // cancel() often reports interrupted/canceled — do not advance the queue
        const err = event?.error || "";
        if (err === "interrupted" || err === "canceled" || err === "cancelled") return;
        index += 1;
        speakNext();
      };
      window.speechSynthesis.speak(utter);
    };

    // Some browsers need a beat after cancel()
    window.setTimeout(() => {
      if (!isActive()) return;
      speakNext();
    }, 60);
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

  btnVoiceMenu?.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = btnVoiceMenu.getAttribute("aria-expanded") !== "true";
    setVoiceMenuOpen(open);
    if (open) {
      populateSpeechVoices();
      applySpeechControls();
      speechRateSelect?.focus();
    }
  });

  voiceMenuPanel?.addEventListener("click", (e) => e.stopPropagation());

  document.addEventListener("click", () => {
    if (btnVoiceMenu?.getAttribute("aria-expanded") === "true") setVoiceMenuOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && btnVoiceMenu?.getAttribute("aria-expanded") === "true") {
      setVoiceMenuOpen(false);
      btnVoiceMenu.focus();
    }
  });

  speechRateSelect?.addEventListener("change", () => {
    const next = Number(speechRateSelect.value);
    speechRate = SPEECH_RATES.includes(next) ? next : DEFAULT_SPEECH_RATE;
    setStatus(`Speech rate set to ${speechRateSelect.selectedOptions[0]?.textContent || speechRate}.`);
    savePrefs();
  });

  speechVoiceSelect?.addEventListener("change", () => {
    speechVoiceURI = speechVoiceSelect.value || "";
    setStatus(`Voice set to ${speechVoiceSelect.selectedOptions[0]?.textContent || "System default"}.`);
    savePrefs();
  });

  if (speechSupported) {
    populateSpeechVoices();
    window.speechSynthesis.addEventListener("voiceschanged", () => {
      populateSpeechVoices();
      applySpeechControls();
    });
  } else {
    if (speechRateSelect) speechRateSelect.disabled = true;
    if (speechVoiceSelect) speechVoiceSelect.disabled = true;
  }

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

  btnDyslexia?.addEventListener("click", () => {
    const on = document.body.classList.toggle("dyslexia-font");
    btnDyslexia.setAttribute("aria-pressed", on ? "true" : "false");
    setStatus(on ? "Dyslexia-friendly font on." : "Dyslexia-friendly font off.");
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
    setStatus(colorblindFilter === "none" ? "Color assist filter off." : `Color assist filter: ${label}.`);
    savePrefs();
  });

  // Accessibility tab toggles the bar open/closed
  function setA11yBarMinimized(minimized) {
    document.body.classList.toggle("a11y-bar-minimized", minimized);
    if (minimized) setVoiceMenuOpen(false);
    a11yBarToggle?.setAttribute("aria-expanded", minimized ? "false" : "true");
    a11yBarToggle?.setAttribute(
      "title",
      minimized ? "Show accessibility controls" : "Hide accessibility controls"
    );
    if (a11yBarToggleLabel) {
      a11yBarToggleLabel.textContent = minimized
        ? "Show accessibility controls"
        : "Hide accessibility controls";
    }
    setStatus(minimized ? "Accessibility controls hidden." : "Accessibility controls shown.");
  }

  a11yBarToggle?.addEventListener("click", () => {
    const minimized = !document.body.classList.contains("a11y-bar-minimized");
    setA11yBarMinimized(minimized);
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
    if (e.key === "Escape" && isSideNavOpen() && !document.getElementById("lightbox")?.open) {
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

  // Zoomable lightbox for Florida map + Results figures
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightbox-img");
  const lightboxStage = document.getElementById("lightbox-stage");
  const lightboxTitle = document.getElementById("lightbox-title");
  const lightboxClose = document.getElementById("lightbox-close");
  const lightboxZoomIn = document.getElementById("lightbox-zoom-in");
  const lightboxZoomOut = document.getElementById("lightbox-zoom-out");
  const lightboxZoomReset = document.getElementById("lightbox-zoom-reset");

  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 8;
  const ZOOM_STEP = 0.25;
  let lbZoom = 1;
  let lbPanX = 0;
  let lbPanY = 0;
  let lbDragging = false;
  let lbDragStartX = 0;
  let lbDragStartY = 0;
  let lbPanStartX = 0;
  let lbPanStartY = 0;
  let lbLastFocus = null;

  function applyLightboxTransform() {
    if (!lightboxImg) return;
    lightboxImg.style.transform = `translate(calc(-50% + ${lbPanX}px), calc(-50% + ${lbPanY}px)) scale(${lbZoom})`;
  }

  function setLightboxZoom(next) {
    lbZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
    applyLightboxTransform();
  }

  function resetLightboxView() {
    lbZoom = 1;
    lbPanX = 0;
    lbPanY = 0;
    applyLightboxTransform();
  }

  function openLightbox(img) {
    if (!lightbox || !lightboxImg) return;
    lbLastFocus = document.activeElement;
    const caption = img.closest("figure")?.querySelector("figcaption");
    const title = (caption?.innerText || img.alt || "Image").replace(/\s+/g, " ").trim();
    lightboxImg.src = img.currentSrc || img.src;
    lightboxImg.alt = img.alt || title;
    if (lightboxTitle) lightboxTitle.textContent = title;
    resetLightboxView();
    if (typeof lightbox.showModal === "function") lightbox.showModal();
    else lightbox.setAttribute("open", "");
    lightboxClose?.focus();
  }

  function closeLightbox() {
    if (!lightbox) return;
    if (typeof lightbox.close === "function") lightbox.close();
    else lightbox.removeAttribute("open");
    lightboxImg.src = "";
    if (lbLastFocus && typeof lbLastFocus.focus === "function") lbLastFocus.focus();
  }

  document.querySelectorAll("#introduction .figure img, #results .figure img").forEach((img) => {
    img.classList.add("zoomable");
    img.setAttribute("tabindex", "0");
    img.setAttribute("role", "button");
    const caption = img.closest("figure")?.querySelector("figcaption");
    const label = (caption?.innerText || img.alt || "image").replace(/\s+/g, " ").trim();
    img.setAttribute("aria-label", `Open larger view: ${label}`);
    img.addEventListener("click", () => openLightbox(img));
    img.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openLightbox(img);
      }
    });
  });

  lightboxClose?.addEventListener("click", closeLightbox);
  lightbox?.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeLightbox();
  });
  lightbox?.addEventListener("click", (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  lightboxZoomIn?.addEventListener("click", () => setLightboxZoom(lbZoom + ZOOM_STEP));
  lightboxZoomOut?.addEventListener("click", () => setLightboxZoom(lbZoom - ZOOM_STEP));
  lightboxZoomReset?.addEventListener("click", resetLightboxView);

  lightboxStage?.addEventListener(
    "wheel",
    (e) => {
      if (!lightbox?.open) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setLightboxZoom(lbZoom + delta);
    },
    { passive: false }
  );

  lightboxStage?.addEventListener("pointerdown", (e) => {
    if (!lightbox?.open) return;
    lbDragging = true;
    lightboxStage.classList.add("is-dragging");
    lbDragStartX = e.clientX;
    lbDragStartY = e.clientY;
    lbPanStartX = lbPanX;
    lbPanStartY = lbPanY;
    lightboxStage.setPointerCapture?.(e.pointerId);
  });

  lightboxStage?.addEventListener("pointermove", (e) => {
    if (!lbDragging) return;
    lbPanX = lbPanStartX + (e.clientX - lbDragStartX);
    lbPanY = lbPanStartY + (e.clientY - lbDragStartY);
    applyLightboxTransform();
  });

  const endLightboxDrag = (e) => {
    if (!lbDragging) return;
    lbDragging = false;
    lightboxStage?.classList.remove("is-dragging");
    if (e?.pointerId != null) lightboxStage?.releasePointerCapture?.(e.pointerId);
  };
  lightboxStage?.addEventListener("pointerup", endLightboxDrag);
  lightboxStage?.addEventListener("pointercancel", endLightboxDrag);

  loadPrefs();
})();
