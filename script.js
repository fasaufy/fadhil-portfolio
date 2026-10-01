(() => {
  'use strict';

  const app = document.getElementById('app');
  const track = document.getElementById('track');

  // Positioning is 100% transform-driven; #app must never actually scroll.
  // Native focus-into-view can otherwise nudge its scroll offset (invisibly,
  // since overflow is hidden) and throw off every rect-based measurement.
  app.addEventListener('scroll', () => { app.scrollLeft = 0; app.scrollTop = 0; }, { passive: true });
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxCaption = document.getElementById('lightbox-caption');
  const prevBtn = document.querySelector('.nav-arrow--prev');
  const nextBtn = document.querySelector('.nav-arrow--next');
  const hallway = document.getElementById('hallway');
  const hallwayStage = document.getElementById('hallway-stage');
  const lightSwitch = document.getElementById('light-switch');
  const safeAreaProbe = document.querySelector('.safe-area-probe');
  const tplProject = document.getElementById('tpl-project');
  const tplFrame = document.getElementById('tpl-frame');
  const tplTimelineEntry = document.getElementById('tpl-timeline-entry');

  // Three breakpoint tiers, one shared continuous engine:
  //  < MOBILE_BREAKPOINT       -- mobile canvas (derived from v2 desktop),
  //                               authored at a 393px-wide reference; the
  //                               stage is scaled to fit actual viewport WIDTH.
  //  MOBILE_BREAKPOINT..~1024  -- "tablet" (incl. an unfolded foldable): no
  //                               dedicated canvas, so it reuses the desktop
  //                               canvas's CSS and scales it like desktop does,
  //                               touch-driven with snapping.
  //  >= ~1024                 -- desktop canvas (Figma 489:7505), authored at
  //                               an 800px-tall reference; the stage is scaled
  //                               to fit actual viewport HEIGHT.
  const MOBILE_BREAKPOINT = 768;
  const MOBILE_REFERENCE_WIDTH = 393;
  const DESKTOP_REFERENCE_HEIGHT = 800;

  // The hallway graphic (Figma "Subtract"), in its own local px: the door's
  // centre line, where the graphic sits relative to the 800px canvas, and
  // the horizontal span (door + switch) that must stay on screen.
  const HALLWAY = { doorCenterX: 733.75, doorCenterY: 506, top: -90, keepVisibleW: 660 };

  const FRAME_ART = {
    rectangle: 'assets/Rectangle-frame.png',
    square: 'assets/Square-frame.png',
    renaissance: 'assets/Renaisans-frame.png',
    'renaissance-portrait': 'assets/Renaisans-frame-portrait.png',
    circle: 'assets/Circle-frame.png',
  };

  // Unfolded foldable: two panes split by a vertical hinge. Matches the
  // spec'd (min-width: 768px) and (max-height: 700px), narrowed to touch
  // devices (so a short laptop window doesn't get hinge-snapping) and to a
  // near-square aspect (the 890x626 inner screen is ~1.42:1; a regular
  // phone in landscape is ~2.2:1 and has no hinge). Real viewport-segment
  // reports win when the browser provides them.
  const postureQuery = window.matchMedia(
    '(min-width: 768px) and (max-height: 700px) and (max-aspect-ratio: 16/10) and (pointer: coarse), (horizontal-viewport-segments: 2)'
  );

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = reducedMotionQuery.matches;
  document.body.dataset.reducedMotion = String(reducedMotion);
  reducedMotionQuery.addEventListener('change', (e) => {
    reducedMotion = e.matches;
    document.body.dataset.reducedMotion = String(reducedMotion);
    chooseMode();
  });

  let stops = [];             // flat list of { el, kind, scene, bg, start, width, centerX }
  let mode = 'continuous';    // 'reduced' | 'continuous'
  let currentIndex = 0;       // active stop index, a cache used to detect changes
  let lastFocusedBeforeLightbox = null;
  let lightsOn = false;
  let switchLabels = { off: 'Turn on the lights', on: 'Lights on' };
  let lastInput = 'none';     // 'touch' | 'wheel' | 'key' -- decides whether to re-snap on resize

  // ---------------- content ----------------

  // no-store: the local dev server sends no cache-control headers at all, so
  // without this the browser is free to serve a stale disk-cached copy on a
  // normal refresh (only a hard reload would reliably bust it).
  fetch('data/content.json', { cache: 'no-store' })
    .then((res) => {
      if (!res.ok) throw new Error('Could not load data/content.json (' + res.status + ')');
      return res.json();
    })
    .then((data) => {
      renderContent(data);
      stops = Array.from(document.querySelectorAll('.stop')).map((el) => ({
        el,
        kind: el.dataset.kind,
        scene: el.dataset.scene,
        bg: el.dataset.bg,
      }));
      chooseMode();
      observeViewport();
    })
    .catch((err) => console.error(err));

  function renderContent(data) {
    if (data.hallway) {
      switchLabels = { off: data.hallway.switchLabelOff, on: data.hallway.switchLabelOn };
      lightSwitch.setAttribute('aria-label', switchLabels.off);
    }

    // self-portrait
    const sp = data.main.selfPortrait;
    document.getElementById('portrait-frame').appendChild(buildFrame(sp.photo));
    const wordmarkImg = document.querySelector('.reveal-copy .wordmark');
    wordmarkImg.src = sp.wordmark.src;
    wordmarkImg.alt = sp.wordmark.alt;
    setText('reveal-role', sp.role);
    setText('reveal-tagline', sp.tagline);

    // projects
    const projects = document.getElementById('projects');
    data.main.projects.forEach((project) => projects.appendChild(buildProjectPiece(project)));

    // about: cta
    if (data.about.cta.photo) document.getElementById('cta-frame').appendChild(buildFrame(data.about.cta.photo));
    const ctaBox = document.getElementById('about-cta');
    data.about.cta.lines.forEach((line, i) => {
      const p = document.createElement('p');
      if (i === 0) p.className = 'cta-headline';
      p.innerHTML = linkifyEmail(escapeHtml(line), data.meta.email);
      ctaBox.appendChild(p);
    });

    // about: bio
    setText('bio-name', data.about.bio.name);
    const bioParagraphs = document.getElementById('bio-paragraphs');
    data.about.bio.paragraphs.forEach((para) => {
      const p = document.createElement('p');
      p.textContent = para;
      bioParagraphs.appendChild(p);
    });
    const bioPhotos = document.getElementById('bio-photos');
    data.about.bio.photos.forEach((photo) => bioPhotos.appendChild(buildFrame(photo)));
    const bioTools = document.getElementById('bio-tools');
    const toolsLabel = document.createElement('p');
    toolsLabel.textContent = data.about.bio.tools.label;
    const toolsLines = document.createElement('p');
    toolsLines.className = 'tools-lines';
    toolsLines.innerHTML = data.about.bio.tools.lines.map(escapeHtml).join('<br>');
    bioTools.append(toolsLabel, toolsLines);

    // about: timeline -- two columns, first three entries then the rest
    setText('timeline-header', data.about.timeline.header);
    const groups = [document.getElementById('timeline-entries-group-1'), document.getElementById('timeline-entries-group-2')];
    const TIMELINE_GROUP1_SIZE = 3;
    data.about.timeline.entries.forEach((entry, i) => {
      groups[i < TIMELINE_GROUP1_SIZE ? 0 : 1].appendChild(buildTimelineEntry(entry));
    });
    if (data.about.timeline.photo) document.getElementById('timeline-frame').appendChild(buildFrame(data.about.timeline.photo));

    // about: closer
    const closerText = document.getElementById('timeline-closer-text');
    data.about.timeline.closer.items.forEach((item) => {
      const label = document.createElement('p');
      label.className = 'timeline-closer__label';
      label.textContent = item.label;
      const text = document.createElement('p');
      text.className = 'timeline-closer__line';
      text.textContent = item.text;
      closerText.append(label, text);
    });
    const closerPhotos = document.getElementById('timeline-closer-photos');
    data.about.timeline.closer.photos.forEach((photo) => closerPhotos.appendChild(buildFrame(photo)));

    // about: resume + contact
    const resumeContact = document.getElementById('resume-contact');
    resumeContact.appendChild(buildResumeContactItem(
      data.about.resumeContact.resume.label, data.about.resumeContact.resume.buttonText, '→', data.meta.resumeUrl
    ));
    resumeContact.appendChild(buildResumeContactItem(
      data.about.resumeContact.contact.label, data.about.resumeContact.contact.buttonText, '📧', 'mailto:' + data.meta.email
    ));
  }

  function buildResumeContactItem(label, buttonText, icon, href) {
    const wrap = document.createElement('div');
    wrap.className = 'resume-contact__item';
    const l = document.createElement('p');
    l.className = 'resume-contact__label';
    l.textContent = label;
    const a = document.createElement('a');
    a.className = 'resume-contact__button';
    a.href = href;
    if (href.startsWith('http')) { a.target = '_blank'; a.rel = 'noopener'; }
    const text = document.createElement('span');
    text.textContent = buttonText;
    const iconSpan = document.createElement('span');
    iconSpan.setAttribute('aria-hidden', 'true');
    iconSpan.textContent = icon;
    a.append(text, iconSpan);
    wrap.append(l, a);
    return wrap;
  }

  function buildTimelineEntry(entry) {
    const frag = tplTimelineEntry.content.cloneNode(true);
    frag.querySelector('.timeline-heading').textContent =
      [entry.title, entry.companyLocation, entry.dates].filter(Boolean).join(' · ');
    frag.querySelector('.timeline-desc').textContent = entry.description;
    return frag;
  }

  function buildProjectPiece(project) {
    const frag = tplProject.content.cloneNode(true);
    const section = frag.querySelector('.stop');
    section.dataset.project = project.id;
    section.setAttribute('aria-label', project.title);
    section.querySelector('.project-title').textContent = project.title;
    section.querySelector('.project-meta').textContent = project.meta;
    section.querySelector('.project-desc__text').textContent = project.description + ' ';
    const proof = section.querySelector('.project-proof');
    proof.textContent = project.proof;
    proof.classList.add('weight-' + (project.proofWeight || 'medium'));
    const cluster = section.querySelector('.frame-cluster');
    project.images.forEach((image) => cluster.appendChild(buildFrame(image)));
    return frag;
  }

  function buildFrame(image) {
    const btn = tplFrame.content.firstElementChild.cloneNode(true);
    const type = (image && FRAME_ART[image.frame]) ? image.frame : 'rectangle';
    btn.dataset.frame = type;
    btn.querySelector('.frame__art').src = FRAME_ART[type];
    setupFrame(btn, image);
    return btn;
  }

  function setupFrame(button, image) {
    const img = button.querySelector('.frame__img');
    const hasImage = Boolean(image && image.src);
    img.alt = (image && image.alt) || '';
    button.disabled = !hasImage;
    button.setAttribute('aria-label', hasImage ? 'View larger: ' + img.alt : 'Empty frame');
    if (hasImage) {
      img.dataset.src = image.src;
      img.addEventListener('load', () => button.classList.add('has-image'), { once: true });
      button.addEventListener('click', () => openLightbox(image.src, img.alt));
    }
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function linkifyEmail(safeHtml, email) {
    return safeHtml.replace(email, '<a href="mailto:' + email + '">' + email + '</a>');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // ---------------- lights (the hallway switch) ----------------

  function setLights(on) {
    lightsOn = on;
    app.dataset.lights = on ? 'on' : 'off';
    lightSwitch.setAttribute('aria-pressed', String(on));
    lightSwitch.setAttribute('aria-label', on ? switchLabels.on : switchLabels.off);
    if (on) {
      if (app.dataset.peek !== 'hidden') app.dataset.peek = 'visible';
    } else if (mode === 'continuous') {
      setTarget(0); // switching off again sends you back to the hallway
    }
    updateNavButtons();
  }

  function nudgeSwitch() {
    lightSwitch.classList.remove('is-nudging');
    void lightSwitch.offsetWidth;
    lightSwitch.classList.add('is-nudging');
  }
  lightSwitch.addEventListener('animationend', () => lightSwitch.classList.remove('is-nudging'));
  lightSwitch.addEventListener('click', () => setLights(!lightsOn));

  // First real movement after the lights are on hides the swipe cue for good.
  function markUserMoved() {
    if (lightsOn && app.dataset.peek === 'visible') app.dataset.peek = 'hidden';
  }

  function updateNavButtons() {
    if (mode === 'continuous' && stepTargets.length) {
      prevBtn.disabled = targetScrollX < 1;
      nextBtn.disabled = lightsOn && targetScrollX >= stepTargets[stepTargets.length - 1] - 4;
      return;
    }
    prevBtn.disabled = currentIndex <= (mode === 'reduced' ? 1 : 0);
    nextBtn.disabled = lightsOn && currentIndex >= stops.length - 1;
  }

  // ---------------- mode selection ----------------

  function chooseMode() {
    teardownContinuous();
    teardownReduced();

    if (reducedMotion) {
      mode = 'reduced';
      setupReduced();
    } else {
      mode = 'continuous';
      setupContinuous();
    }
  }

  // Folding/unfolding (466px <-> 890px), rotating, or resizing must re-lay
  // out immediately -- no debounce -- coalesced to one pass per frame.
  let relayoutRaf = null;
  function scheduleRelayout() {
    if (relayoutRaf) return;
    relayoutRaf = requestAnimationFrame(() => { relayoutRaf = null; relayout(); });
  }

  function observeViewport() {
    if ('ResizeObserver' in window) new ResizeObserver(scheduleRelayout).observe(app);
    window.addEventListener('resize', scheduleRelayout);
    window.addEventListener('orientationchange', scheduleRelayout);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', scheduleRelayout);
    postureQuery.addEventListener('change', scheduleRelayout);
  }

  // ---------------- shared: wall background ----------------

  let currentWallBg = null;
  const wallAbout = document.querySelector('.wall-bg--about');

  function setWallScene(bgKey) {
    if (bgKey === currentWallBg) return;
    currentWallBg = bgKey;
    // The main wall stays solid underneath; the about wall is either clipped
    // to the seam (continuous) or simply shown (reduced motion).
    wallAbout.classList.toggle('is-active', bgKey === 'about');
  }

  // ---------------- shared: active-stop side effects ----------------

  function applyActiveStop(index) {
    const stop = stops[index];
    if (!stop) return;
    app.dataset.scene = stop.scene;
    setWallScene(stop.bg);
    app.dataset.atStart = index === 0 ? 'true' : 'false';
    app.dataset.atEnd = index === stops.length - 1 ? 'true' : 'false';
    updateNavButtons();
    hydrateNear(index);
  }

  function hydrateNear(index) {
    for (let i = Math.max(0, index - 1); i <= Math.min(stops.length - 1, index + 2); i++) {
      stops[i].el.querySelectorAll('.frame__img[data-src]').forEach((img) => {
        img.src = img.dataset.src;
        delete img.dataset.src;
      });
    }
  }

  // ================= REDUCED MOTION =================

  let reducedObserver = null;

  function setupReduced() {
    track.style.transform = '';
    setLights(true); // no gated hallway in the plain stacked layout
    reducedObserver = new IntersectionObserver((entries) => {
      let best = null;
      entries.forEach((entry) => { if (!best || entry.intersectionRatio > best.intersectionRatio) best = entry; });
      if (best && best.intersectionRatio > 0.3) {
        const idx = stops.findIndex((s) => s.el === best.target);
        if (idx !== -1) { currentIndex = idx; applyActiveStop(idx); }
      }
    }, { threshold: [0.3, 0.6, 1] });
    stops.forEach((s) => reducedObserver.observe(s.el));
    currentIndex = 1;
    applyActiveStop(1);

    document.addEventListener('keydown', onReducedKeydown);
    prevBtn.addEventListener('click', reducedStepPrev);
    nextBtn.addEventListener('click', reducedStepNext);
  }

  function teardownReduced() {
    if (reducedObserver) { reducedObserver.disconnect(); reducedObserver = null; }
    document.removeEventListener('keydown', onReducedKeydown);
    prevBtn.removeEventListener('click', reducedStepPrev);
    nextBtn.removeEventListener('click', reducedStepNext);
  }

  function reducedStepPrev() { scrollStopIntoView(Math.max(1, currentIndex - 1)); }
  function reducedStepNext() { scrollStopIntoView(Math.min(stops.length - 1, currentIndex + 1)); }
  function scrollStopIntoView(idx) { stops[idx].el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  function onReducedKeydown(e) {
    if (!lightbox.hidden) { if (e.key === 'Escape') closeLightbox(); return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); reducedStepNext(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); reducedStepPrev(); }
  }

  // ================= CONTINUOUS (desktop, tablet, mobile; motion OK) =================

  let stageScale = 1;
  function updateStageScale() {
    stageScale = window.innerWidth < MOBILE_BREAKPOINT
      ? window.innerWidth / MOBILE_REFERENCE_WIDTH
      : window.innerHeight / DESKTOP_REFERENCE_HEIGHT;
    document.documentElement.style.setProperty('--stage-scale', String(stageScale));
  }
  // All scroll/beat/measurement math below is done in the track's own local
  // (pre-scale) coordinate space -- this mirrors window.innerWidth for it.
  function localViewportWidth() { return window.innerWidth / stageScale; }

  // Safe-area insets (notch, rounded corners, home indicator), real px.
  let insets = { top: 0, right: 0, bottom: 0, left: 0 };
  function readInsets() {
    const cs = getComputedStyle(safeAreaProbe);
    insets = {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    };
  }
  // Where "centred" means on screen: the middle of the safe region, not of
  // the raw viewport (they differ in landscape on notched phones).
  function safeCenterScreenX() { return insets.left + (window.innerWidth - insets.left - insets.right) / 2; }
  function centerLocal() { return safeCenterScreenX() / stageScale; }

  // Hinge position on screen (real px) when unfolded, else null.
  let hingeScreenX = null;
  function updatePosture() {
    let hinge = null;
    const segs = window.viewport && window.viewport.segments;
    if (segs && segs.length === 2) hinge = (segs[0].x + segs[0].width + segs[1].x) / 2;
    else if (postureQuery.matches) hinge = window.innerWidth / 2;
    hingeScreenX = hinge;
    app.dataset.posture = hinge === null ? 'flat' : 'unfolded';
  }

  let scrollX = 0, targetScrollX = 0, maxScrollX = 0;
  let rafId = null;
  let settleTimer = null;
  let beatRanges = [];  // beats: settle fully into view
  let snapItems = [];   // key frames + placards: touch snapping / hinge avoidance

  // Room-seam hard cut: the about wall is pinned opaque and its visible
  // region is drawn with a clip-path locked to the seam's on-screen position
  // -- a real wall ending where the rooms meet, not a dissolve.
  const seamEl = document.querySelector('.room-seam');
  let seamNaturalCenter = null;

  function measureSeam() {
    const trackRect = track.getBoundingClientRect();
    const r = seamEl.getBoundingClientRect();
    seamNaturalCenter = (r.left - trackRect.left) + r.width / 2;
  }

  function updateSeamHardCut() {
    if (seamNaturalCenter === null) return;
    const seamX = stageScale * (seamNaturalCenter - scrollX);
    wallAbout.style.clipPath = 'inset(0 0 0 ' + Math.max(0, seamX) + 'px)';
  }

  // ---- hallway: positioned so the door is centred and the switch stays on
  // screen, then zoomed away (you walk through the door) over the first
  // screen of scroll. ----
  let hallwayScale = 1;
  function layoutHallway() {
    hallwayScale = Math.min(window.innerHeight / DESKTOP_REFERENCE_HEIGHT, window.innerWidth / HALLWAY.keepVisibleW);
  }

  function updateHallway() {
    const introLen = (stops[0] && stops[0].width) || localViewportWidth();
    const p = clamp(scrollX / introLen, 0, 1);
    const zoom = 1 + p * p * 2.4;
    const hs = hallwayScale;
    const baseLeft = safeCenterScreenX() - HALLWAY.doorCenterX * hs;
    const baseTop = HALLWAY.top * hs;
    const ax = safeCenterScreenX();
    const ay = baseTop + HALLWAY.doorCenterY * hs;
    const left = ax + (baseLeft - ax) * zoom;
    const top = ay + (baseTop - ay) * zoom;
    hallwayStage.style.transform = 'translate(' + left + 'px,' + top + 'px) scale(' + (hs * zoom) + ')';
    const fade = clamp((p - 0.5) / 0.42, 0, 1);
    hallway.style.opacity = String(1 - fade * fade * (3 - 2 * fade));
    hallway.style.visibility = p >= 0.995 ? 'hidden' : '';
    lightSwitch.style.pointerEvents = p > 0.15 ? 'none' : '';
  }

  function setupContinuous() {
    track.style.transition = '';
    if (seamEl) wallAbout.style.opacity = '1';
    setLights(false);
    scrollX = 0; targetScrollX = 0;
    relayout({ keepPosition: false });
    applyActiveStop(0);

    window.addEventListener('wheel', onContinuousWheel, { passive: false });
    window.addEventListener('touchstart', onContinuousTouchStart, { passive: true });
    window.addEventListener('touchmove', onContinuousTouchMove, { passive: false });
    window.addEventListener('touchend', onContinuousTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onContinuousTouchEnd, { passive: true });
    document.addEventListener('keydown', onContinuousKeydown);
    track.addEventListener('focusin', onContinuousFocusIn);
    prevBtn.addEventListener('click', continuousStepPrev);
    nextBtn.addEventListener('click', continuousStepNext);
  }

  function teardownContinuous() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
    track.style.transition = '';
    track.style.transform = '';
    wallAbout.style.opacity = ''; wallAbout.style.clipPath = '';
    hallway.style.opacity = ''; hallway.style.visibility = '';
    window.removeEventListener('wheel', onContinuousWheel);
    window.removeEventListener('touchstart', onContinuousTouchStart);
    window.removeEventListener('touchmove', onContinuousTouchMove);
    window.removeEventListener('touchend', onContinuousTouchEnd);
    window.removeEventListener('touchcancel', onContinuousTouchEnd);
    document.removeEventListener('keydown', onContinuousKeydown);
    track.removeEventListener('focusin', onContinuousFocusIn);
    prevBtn.removeEventListener('click', continuousStepPrev);
    nextBtn.removeEventListener('click', continuousStepNext);
    touchActive = false;
    touchIsHorizontal = null;
  }

  // One full re-measure, keeping the visitor anchored to what they were
  // looking at (the same point of the same stop stays centred) so folding,
  // unfolding or rotating never jumps them somewhere else.
  function relayout(opts) {
    if (mode !== 'continuous' || !stops.length) return;
    const keep = !opts || opts.keepPosition !== false;
    const anchor = keep ? captureAnchor() : null;

    updateStageScale();
    readInsets();
    updatePosture();
    layoutHallway();
    sizeSpacers();
    measureStops();
    measureSeam();
    measureSnapItems();

    if (anchor) {
      const s = stops[anchor.index];
      scrollX = targetScrollX = clamp(s.start + anchor.frac * s.width - centerLocal(), 0, maxScrollX);
    }
    refreshRaster();
    applyTransform();
    syncActiveFromScroll(true);

    // Snap points changed with the layout -- settle onto a valid one for the
    // new posture (e.g. move a frame off the hinge right after unfolding).
    if (keep && lightsOn && (lastInput === 'touch' || hingeScreenX !== null)) setTarget(snapTargetFor(scrollX));
  }

  function captureAnchor() {
    if (!stops.length || stops[0].width === undefined) return null;
    const center = scrollX + centerLocal();
    let index = 0;
    for (let i = 0; i < stops.length; i++) if (stops[i].start <= center) index = i;
    const s = stops[index];
    return { index, frac: s.width ? (center - s.start) / s.width : 0.5 };
  }

  // A scale change under will-change:transform can leave a layer rasterised
  // at the old scale (blurry after unfolding). Dropping and re-adding the
  // hint forces a crisp re-raster at the new device-pixel size.
  function refreshRaster() {
    track.style.willChange = 'auto';
    hallwayStage.style.willChange = 'auto';
    requestAnimationFrame(() => {
      track.style.willChange = '';
      hallwayStage.style.willChange = '';
    });
  }

  function sizeSpacers() {
    // Reset first: stops are measured relative to an untransformed track so
    // sizes stay in local (pre-scale) units regardless of any scale/scroll
    // left over from a previous frame (important across a resize).
    track.style.transform = '';
    const vw = localViewportWidth();
    const insetL = insets.left / stageScale, insetR = insets.right / stageScale;
    const safeW = vw - insetL - insetR;

    document.querySelectorAll('.beat').forEach((beat) => { beat.style.width = vw + 'px'; });

    document.querySelectorAll('.scene').forEach((scene) => {
      const lead = scene.querySelector('.spacer--lead');
      const trail = scene.querySelector('.spacer--trail');
      lead.style.width = '0px'; trail.style.width = '0px';
      const pieces = scene.querySelectorAll('.stop');
      if (!pieces.length) return;
      const firstW = pieces[0].getBoundingClientRect().width;
      const lastW = pieces[pieces.length - 1].getBoundingClientRect().width;
      lead.style.width = (Math.max(0, (safeW - firstW) / 2) + insetL) + 'px';
      trail.style.width = (Math.max(0, (safeW - lastW) / 2) + insetR) + 'px';
    });
  }

  function measureStops() {
    const trackRect = track.getBoundingClientRect();
    stops.forEach((s) => {
      const r = s.el.getBoundingClientRect();
      s.start = r.left - trackRect.left;
      s.width = r.width;
      s.centerX = s.start + r.width / 2;
    });
    beatRanges = stops.map((s, i) => ({ ...s, index: i })).filter((s) => s.kind === 'beat');
    maxScrollX = Math.max(0, trackRect.width - localViewportWidth());
  }

  let stepTargets = []; // scrollX positions the arrows / keys step between

  function measureSnapItems() {
    const trackRect = track.getBoundingClientRect();
    snapItems = Array.from(track.querySelectorAll('.frame, [data-snap]'))
      .map((el) => {
        const r = el.getBoundingClientRect();
        const left = r.left - trackRect.left;
        const stopEl = el.closest('.stop');
        return { left, right: left + r.width, center: left + r.width / 2, stop: stops.findIndex((s) => s.el === stopEl) };
      })
      .filter((it) => it.right > it.left)
      .sort((a, b) => a.center - b.center);
    buildStepTargets();
  }

  // One step per stop when it fits on screen; a piece wider than the safe
  // screen area (most pieces on phones/tablets) is paged through in
  // screen-sized chunks of its own artworks, placard first, so a step never
  // lands on the middle of a piece with its placard cut off.
  function buildStepTargets() {
    const c = centerLocal();
    const safeW = (window.innerWidth - insets.left - insets.right) / stageScale;
    const raw = [];
    stops.forEach((s, i) => {
      if (s.kind === 'beat') { raw.push({ x: s.centerX - c, beat: true }); return; }
      if (s.width <= safeW * 0.96) { raw.push({ x: s.centerX - c }); return; }
      const items = snapItems.filter((it) => it.stop === i).sort((a, b) => a.left - b.left);
      if (!items.length) { raw.push({ x: s.centerX - c }); return; }
      let start = items[0].left, end = items[0].right;
      for (let k = 1; k < items.length; k++) {
        const it = items[k];
        if (Math.max(end, it.right) - start <= safeW * 0.92) { end = Math.max(end, it.right); continue; }
        raw.push({ x: (start + end) / 2 - c });
        start = it.left; end = it.right;
      }
      raw.push({ x: (start + end) / 2 - c });
    });
    // Unfolded: every step is a crease-safe position up front, so stepping
    // can never land with an artwork or placard across the hinge.
    const xs = raw.map((t) => {
      const x = clamp(t.x, 0, maxScrollX);
      return (hingeScreenX !== null && !t.beat) ? creaseSafeTarget(x) : x;
    });
    stepTargets = [];
    xs.sort((a, b) => a - b).forEach((x) => {
      if (!stepTargets.length || x - stepTargets[stepTargets.length - 1] > 2) stepTargets.push(x);
    });
  }

  function applyTransform() {
    track.style.transform = 'scale(' + stageScale + ') translateX(' + (-scrollX) + 'px)';
    updateSeamHardCut();
    updateHallway();
  }

  function nearestStopIndex(centerPoint) {
    let best = 0, bestDist = Infinity;
    stops.forEach((s, i) => {
      const d = Math.abs(s.centerX - centerPoint);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    return best;
  }

  function beatContaining(centerPoint) {
    return beatRanges.find((b) => centerPoint >= b.start && centerPoint <= b.start + b.width) || null;
  }

  function tick() {
    const diff = targetScrollX - scrollX;
    if (Math.abs(diff) < 0.5) {
      scrollX = targetScrollX;
      applyTransform();
      syncActiveFromScroll();
      rafId = null;
      return;
    }
    scrollX += diff * 0.18;
    applyTransform();
    syncActiveFromScroll();
    rafId = requestAnimationFrame(tick);
  }

  function kick() {
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  function syncActiveFromScroll(force) {
    const idx = nearestStopIndex(scrollX + centerLocal());
    if (force || idx !== currentIndex) { currentIndex = idx; applyActiveStop(idx); }
    else updateNavButtons();
  }

  function setTarget(px) {
    targetScrollX = clamp(px, 0, maxScrollX);
    kick();
  }

  function settleToBeatIfNeeded() {
    const c = centerLocal();
    const beat = beatContaining(targetScrollX + c);
    if (beat) setTarget(beat.centerX - c);
  }

  // ---- snapping (touch) ----
  // Flat: settle with the nearest artwork/placard centred. Unfolded: settle
  // where no artwork or placard straddles the hinge, preferring each piece
  // centred in the left or right pane -- a two-pane wall, not a stretched
  // phone. Beats (the hallway) always settle fully into view.
  function snapTargetFor(projected) {
    const c = centerLocal();
    const beat = beatContaining(projected + c);
    if (beat) return clamp(beat.centerX - c, 0, maxScrollX);
    if (!snapItems.length) return projected;
    if (hingeScreenX !== null) return creaseSafeTarget(projected);

    let best = projected, bestDist = Infinity;
    snapItems.forEach((it) => {
      const x = clamp(it.center - c, 0, maxScrollX);
      const d = Math.abs(x - projected);
      if (d < bestDist) { bestDist = d; best = x; }
    });
    return best;
  }

  function creaseSafeTarget(projected) {
    const vwL = localViewportWidth();
    const hinge = hingeScreenX / stageScale;           // hinge offset within the viewport, local
    const gap = 12 / stageScale;                        // keep this clear of the fold on either side
    const leftPaneCenter = (insets.left / stageScale + hinge - gap) / 2;
    const rightPaneCenter = (hinge + gap + vwL - insets.right / stageScale) / 2;

    const candidates = [];
    snapItems.forEach((it) => {
      candidates.push(it.center - leftPaneCenter, it.center - rightPaneCenter);
      candidates.push(it.left - hinge - gap, it.right - hinge + gap);
    });

    const reach = vwL * 0.75;
    let best = null, bestScore = Infinity;
    for (const raw of candidates) {
      const x = clamp(raw, 0, maxScrollX);
      if (Math.abs(x - projected) > reach) continue;
      const hingeAt = x + hinge;
      let straddling = 0;
      for (const it of snapItems) {
        if (it.right <= x || it.left >= x + vwL) continue;   // off screen
        if (it.left < hingeAt + gap && it.right > hingeAt - gap) straddling++;
      }
      const score = straddling * vwL + Math.abs(x - projected);
      if (score < bestScore) { bestScore = score; best = x; }
    }
    return best === null ? clamp(projected, 0, maxScrollX) : best;
  }

  function onContinuousWheel(e) {
    if (!lightbox.hidden) return;
    e.preventDefault();
    if (!lightsOn) { nudgeSwitch(); return; }
    lastInput = 'wheel';
    markUserMoved();
    const delta = Math.max(-160, Math.min(160, Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY));
    setTarget(targetScrollX + delta / stageScale);

    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      // Trackpad on a touch-first device (or unfolded posture): treat like
      // a swipe and snap; plain desktop scrolling only settles beats.
      if (hingeScreenX !== null) setTarget(snapTargetFor(targetScrollX));
      else settleToBeatIfNeeded();
    }, 140);
  }

  // Touch drag -- direct manipulation with momentum: the content follows the
  // finger 1:1, and on release the recent velocity is projected forward and
  // settled onto a snap point.
  let touchActive = false;
  let touchStartX = 0, touchStartY = 0, touchLastX = 0;
  let touchIsHorizontal = null;
  let touchSamples = [];
  let touchNudged = false;

  function onContinuousTouchStart(e) {
    if (!lightbox.hidden || !e.touches.length) return;
    touchActive = true;
    touchStartX = touchLastX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchIsHorizontal = null;
    touchSamples = [{ t: e.timeStamp, x: touchStartX }];
    touchNudged = false;
    if (rafId) { targetScrollX = scrollX; } // catch a moving strip under the finger
  }

  function onContinuousTouchMove(e) {
    if (!touchActive || !e.touches.length) return;
    const x = e.touches[0].clientX, y = e.touches[0].clientY;
    if (touchIsHorizontal === null) {
      const dx = x - touchStartX, dy = y - touchStartY;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) touchIsHorizontal = Math.abs(dx) > Math.abs(dy);
    }
    if (!touchIsHorizontal) { touchLastX = x; return; }
    e.preventDefault();
    if (!lightsOn) {
      if (!touchNudged) { nudgeSwitch(); touchNudged = true; }
      return;
    }
    lastInput = 'touch';
    markUserMoved();
    setTarget(targetScrollX - (x - touchLastX) / stageScale);
    touchLastX = x;
    touchSamples.push({ t: e.timeStamp, x });
    const cutoff = e.timeStamp - 100;
    while (touchSamples.length > 2 && touchSamples[0].t < cutoff) touchSamples.shift();
  }

  function onContinuousTouchEnd() {
    if (touchActive && touchIsHorizontal && lightsOn) {
      const a = touchSamples[0], b = touchSamples[touchSamples.length - 1];
      const dt = b && a ? b.t - a.t : 0;
      const velocity = dt > 0 ? (b.x - a.x) / dt : 0;        // screen px per ms
      const projected = targetScrollX - (velocity * 260) / stageScale;
      setTarget(snapTargetFor(clamp(projected, 0, maxScrollX)));
    }
    touchActive = false;
    touchIsHorizontal = null;
  }

  function continuousStepPrev() { continuousStepTo(-1); }
  function continuousStepNext() {
    if (!lightsOn) { setLights(true); return; }
    continuousStepTo(1);
  }
  function continuousStepTo(delta) {
    lastInput = 'key';
    markUserMoved();
    if (!stepTargets.length) return;
    const here = targetScrollX;
    let target;
    if (delta > 0) target = stepTargets.find((x) => x > here + 4);
    else target = [...stepTargets].reverse().find((x) => x < here - 4);
    if (target === undefined) return;
    setTarget(target);
  }

  function onContinuousKeydown(e) {
    if (!lightbox.hidden) { if (e.key === 'Escape') closeLightbox(); return; }
    const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown';
    const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp';
    if (!forward && !back) return;
    e.preventDefault();
    if (forward) continuousStepNext(); else continuousStepPrev();
  }

  function onContinuousFocusIn(e) {
    const stopEl = e.target.closest('.stop');
    if (!stopEl) return;
    if (!lightsOn) setLights(true);
    const idx = stops.findIndex((s) => s.el === stopEl);
    if (idx !== -1) setTarget(stops[idx].centerX - centerLocal());
  }

  // ================= Lightbox (shared) =================

  // Caption reads from the asset's own filename (e.g. "wave-web homepage.jpg"
  // -> "Wave web homepage") rather than the alt text, which stays on the img
  // element for accessibility.
  function captionFromSrc(src) {
    const filename = src.split('/').pop().replace(/\.[^./]+$/, '');
    const spaced = filename.replace(/[-_]+/g, ' ').trim();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }

  function openLightbox(src, alt) {
    lastFocusedBeforeLightbox = document.activeElement;
    lightboxImg.src = src;
    lightboxImg.alt = alt || '';
    lightboxCaption.textContent = captionFromSrc(src);
    lightbox.hidden = false;
    document.querySelector('.lightbox__close').focus();
    document.addEventListener('keydown', trapTabInLightbox);
  }

  function closeLightbox() {
    lightbox.hidden = true;
    lightboxImg.src = '';
    document.removeEventListener('keydown', trapTabInLightbox);
    if (lastFocusedBeforeLightbox) lastFocusedBeforeLightbox.focus();
  }

  function trapTabInLightbox(e) {
    if (e.key !== 'Tab') return;
    const focusables = lightbox.querySelectorAll('button, [href], img');
    if (!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  document.querySelectorAll('[data-lightbox-close]').forEach((el) => el.addEventListener('click', closeLightbox));
})();
