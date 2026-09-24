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
  const tplProject = document.getElementById('tpl-project');
  const tplFrame = document.getElementById('tpl-frame');
  const tplTimelineEntry = document.getElementById('tpl-timeline-entry');

  // Three breakpoint tiers, one shared continuous engine:
  //  < MOBILE_BREAKPOINT       -- dedicated mobile canvas (Figma 356:16677),
  //                               authored at a 393px-wide reference; the
  //                               stage is scaled to fit actual viewport WIDTH.
  //  MOBILE_BREAKPOINT..~1024  -- "tablet": no dedicated canvas exists, so
  //                               this tier reuses the desktop canvas's own
  //                               CSS (unconditional rules, untouched by the
  //                               mobile media query below) and scales it
  //                               exactly like desktop does, just touch-driven.
  //  >= ~1024                 -- desktop canvas (Figma 303:12912), authored
  //                               at a 710px-tall reference; the stage is
  //                               scaled to fit actual viewport HEIGHT (no
  //                               vertical scroll exists, so height must fit
  //                               exactly regardless of screen size).
  const MOBILE_BREAKPOINT = 768;
  const MOBILE_REFERENCE_WIDTH = 393;
  const DESKTOP_REFERENCE_HEIGHT = 710;

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = reducedMotionQuery.matches;
  document.body.dataset.reducedMotion = String(reducedMotion);
  reducedMotionQuery.addEventListener('change', (e) => {
    reducedMotion = e.matches;
    document.body.dataset.reducedMotion = String(reducedMotion);
    chooseMode();
  });

  let stops = [];             // flat list of { el, kind, scene } in document order
  let mode = 'continuous';    // 'reduced' | 'continuous'
  let currentIndex = 0;       // active stop index, a cache used to detect changes
  let lastFocusedBeforeLightbox = null;

  // ---------------- content ----------------

  // no-store: the local dev server sends no cache-control headers at all, so
  // without this the browser is free to serve a stale disk-cached copy on a
  // normal refresh (only a hard reload would reliably bust it) -- easy to
  // end up editing content and still seeing old image paths/text.
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
      window.addEventListener('resize', debounce(onResize, 150));
    })
    .catch((err) => console.error(err));

  function renderContent(data) {
    setText('intro1-text', data.intro1.text);
    setText('intro2-text', data.intro2.text);

    // self-portrait
    const portraitFrame = document.querySelector('.frame--portrait');
    setupFrame(portraitFrame, data.main.selfPortrait.photo);
    const wordmarkImg = document.querySelector('.reveal-copy .wordmark');
    wordmarkImg.src = data.main.selfPortrait.wordmark.src;
    wordmarkImg.alt = data.main.selfPortrait.wordmark.alt;
    setText('reveal-role', data.main.selfPortrait.role);
    setText('reveal-tagline', data.main.selfPortrait.tagline);

    // projects
    const projectsGroup = document.getElementById('projects-scroll-group');
    data.main.projects.forEach((project) => {
      projectsGroup.appendChild(buildProjectPiece(project));
    });

    // about: cta
    const ctaBox = document.getElementById('about-cta');
    data.about.cta.lines.forEach((line, i) => {
      const p = document.createElement('p');
      if (i === 0) p.className = 'cta-headline';
      p.innerHTML = linkifyEmail(escapeHtml(line), data.meta.email);
      ctaBox.appendChild(p);
    });
    ctaBox.classList.add('about-cta');

    // about: bio
    setText('bio-name', data.about.bio.name);
    const bioParagraphs = document.getElementById('bio-paragraphs');
    data.about.bio.paragraphs.forEach((para) => {
      const p = document.createElement('p');
      p.textContent = para;
      bioParagraphs.appendChild(p);
    });
    const bioPhotos = document.getElementById('bio-photos');
    bioPhotos.className = 'bio-photos';
    data.about.bio.photos.forEach((photo) => {
      const frag = tplFrame.content.cloneNode(true);
      const btn = frag.querySelector('.frame');
      setupFrame(btn, photo);
      bioPhotos.appendChild(frag);
    });
    const bioTools = document.getElementById('bio-tools');
    const toolsLabel = document.createElement('p');
    toolsLabel.textContent = data.about.bio.tools.label;
    bioTools.appendChild(toolsLabel);
    const toolsLines = document.createElement('p');
    toolsLines.className = 'tools-lines';
    toolsLines.innerHTML = data.about.bio.tools.lines.map(escapeHtml).join('<br>');
    bioTools.appendChild(toolsLines);

    // about: timeline
    setText('timeline-header', data.about.timeline.header);
    const entriesGroup1 = document.getElementById('timeline-entries-group-1');
    const entriesGroup2 = document.getElementById('timeline-entries-group-2');
    const TIMELINE_GROUP1_SIZE = 3; // entries through "Late Checkout"; the rest form the next mobile section
    data.about.timeline.entries.forEach((entry, i) => {
      const group = i < TIMELINE_GROUP1_SIZE ? entriesGroup1 : entriesGroup2;
      group.appendChild(buildTimelineEntry(entry));
    });

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
    data.about.timeline.closer.photos.forEach((photo) => {
      const frag = tplFrame.content.cloneNode(true);
      const btn = frag.querySelector('.frame');
      setupFrame(btn, photo);
      closerPhotos.appendChild(frag);
    });

    // about: resume + contact
    const resumeContact = document.getElementById('resume-contact');
    resumeContact.classList.add('resume-contact');
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
    frag.querySelector('.timeline-dates').textContent = entry.dates;
    const heading = frag.querySelector('.timeline-entry__heading');
    if (entry.title) {
      heading.querySelector('.timeline-title').textContent = entry.title;
      heading.querySelector('.timeline-company').textContent = entry.companyLocation;
    } else {
      heading.remove();
    }
    frag.querySelector('.timeline-desc').textContent = entry.description;
    return frag;
  }

  function buildProjectPiece(project) {
    const frag = tplProject.content.cloneNode(true);
    const section = frag.querySelector('.stop');
    section.dataset.project = project.id;
    section.dataset.bg = 'main';
    section.setAttribute('aria-label', project.title);
    section.querySelector('.project-title').textContent = project.title;
    section.querySelector('.project-meta').textContent = project.meta;
    section.querySelector('.project-desc__text').textContent = project.description + ' ';
    const proof = section.querySelector('.project-proof');
    proof.textContent = project.proof;
    proof.classList.add('weight-' + (project.proofWeight || 'medium'));
    const cluster = section.querySelector('.frame-cluster');
    project.images.forEach((image) => {
      const frameFrag = tplFrame.content.cloneNode(true);
      const btn = frameFrag.querySelector('.frame');
      setupFrame(btn, image);
      cluster.appendChild(frameFrag);
    });
    return frag;
  }

  function setupFrame(button, image) {
    const img = button.querySelector('.frame__img');
    const hasImage = Boolean(image && image.src);
    img.alt = (image && image.alt) || '';
    button.disabled = !hasImage;
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

  function onResize() {
    if (mode === 'continuous') {
      updateStageScale();
      sizeSpacers();
      measureStops();
      measureSeamPillar();
      applyTransform();
    }
  }

  function debounce(fn, wait) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  }

  // ---------------- shared: wall background crossfade ----------------

  let currentWallBg = null;
  const wallLayers = Array.from(document.querySelectorAll('.wall-bg'));

  function setWallScene(bgKey) {
    if (bgKey === currentWallBg) return;
    currentWallBg = bgKey;
    wallLayers.forEach((layer) => {
      const isMatch = layer.dataset.bg === bgKey;
      // The "about" wall is a hard cut drawn on top of "main", not a fade --
      // main must stay solid underneath it rather than fading back out.
      const staysSolidBehindAbout = layer.dataset.bg === 'main' && bgKey === 'about';
      layer.classList.toggle('is-active', isMatch || staysSolidBehindAbout);
    });
  }

  // ---------------- shared: active-stop side effects ----------------

  function applyActiveStop(index) {
    const stop = stops[index];
    if (!stop) return;
    app.dataset.scene = stop.scene;
    setWallScene(stop.bg);
    app.dataset.activePiece = stop.el.classList.contains('piece--portrait') ? 'portrait' : '';
    app.dataset.atStart = index === 0 ? 'true' : 'false';
    app.dataset.atEnd = index === stops.length - 1 ? 'true' : 'false';
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === stops.length - 1;
    hydrateNear(index);
  }

  function hydrateNear(index) {
    for (let i = Math.max(0, index - 1); i <= Math.min(stops.length - 1, index + 1); i++) {
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
    reducedObserver = new IntersectionObserver((entries) => {
      let best = null;
      entries.forEach((entry) => { if (!best || entry.intersectionRatio > best.intersectionRatio) best = entry; });
      if (best && best.intersectionRatio > 0.5) {
        const idx = stops.findIndex((s) => s.el === best.target);
        if (idx !== -1) { currentIndex = idx; applyActiveStop(idx); }
      }
    }, { threshold: [0.5, 0.75, 1] });
    stops.forEach((s) => reducedObserver.observe(s.el));
    applyActiveStop(0);

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

  function reducedStepPrev() { scrollStopIntoView(Math.max(0, currentIndex - 1)); }
  function reducedStepNext() { scrollStopIntoView(Math.min(stops.length - 1, currentIndex + 1)); }
  function scrollStopIntoView(idx) { stops[idx].el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  function onReducedKeydown(e) {
    if (!lightbox.hidden) { if (e.key === 'Escape') closeLightbox(); return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); reducedStepNext(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); reducedStepPrev(); }
  }

  // ================= CONTINUOUS (desktop + mobile, motion OK) =================

  let stageScale = 1;
  function updateStageScale() {
    stageScale = window.innerWidth < MOBILE_BREAKPOINT
      ? window.innerWidth / MOBILE_REFERENCE_WIDTH
      : window.innerHeight / DESKTOP_REFERENCE_HEIGHT;
  }
  // All scroll/beat/measurement math below is done in the track's own local
  // (pre-scale) coordinate space -- this mirrors window.innerWidth for it.
  function localViewportWidth() { return window.innerWidth / stageScale; }

  let scrollX = 0, targetScrollX = 0, maxScrollX = 0;
  let rafId = null;
  let settleTimer = null;
  let beatRanges = []; // [{start,end,centerX,index}]

  // Room-seam hard cut: the "about" wall is pinned fully opaque and its
  // visible region is drawn with a clip-path locked to the pillar's on-screen
  // position, instead of a fade -- a real wall ending where the pillar stands,
  // not a dissolve. The pillar also gets a slight parallax drift for depth.
  const seamPillarEl = document.querySelector('.room-seam__pillar');
  const seamWallAbout = document.querySelector('.wall-bg--about');
  const SEAM_PARALLAX_SPEED = 0.94; // pillar drifts ~6% slower than the walls around it
  let seamPillarNaturalCenter = null;

  function measureSeamPillar() {
    if (!seamPillarEl) return;
    seamPillarEl.style.transform = '';
    const trackRect = track.getBoundingClientRect();
    const pr = seamPillarEl.getBoundingClientRect();
    seamPillarNaturalCenter = (pr.left - trackRect.left) + pr.width / 2;
  }

  function updateSeamHardCut() {
    if (!seamPillarEl || !seamWallAbout || seamPillarNaturalCenter === null) return;
    // seamPillarNaturalCenter/scrollX are local (pre-scale) units; the rest
    // of this function draws in real screen px, so bring it into that space.
    const naturalScreenX = stageScale * (seamPillarNaturalCenter - scrollX);
    const viewportCenterX = window.innerWidth / 2;
    const seamX = viewportCenterX + (naturalScreenX - viewportCenterX) * SEAM_PARALLAX_SPEED;
    // The pillar's own transform is nested inside the track's scale, so its
    // offset must be pre-divided by stageScale to land on the intended
    // on-screen px amount instead of being scaled a second time.
    seamPillarEl.style.transform = 'translateX(' + ((seamX - naturalScreenX) / stageScale) + 'px)';
    seamWallAbout.style.clipPath = 'inset(0 0 0 ' + seamX + 'px)';
  }

  function setupContinuous() {
    track.style.transition = '';
    updateStageScale();
    sizeSpacers();
    measureStops();
    measureSeamPillar();
    if (seamWallAbout) seamWallAbout.style.opacity = '1';
    scrollX = 0; targetScrollX = 0;
    applyTransform();
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
    if (seamWallAbout) { seamWallAbout.style.opacity = ''; seamWallAbout.style.clipPath = ''; }
    if (seamPillarEl) seamPillarEl.style.transform = '';
    window.removeEventListener('wheel', onContinuousWheel);
    window.removeEventListener('touchstart', onContinuousTouchStart);
    window.removeEventListener('touchmove', onContinuousTouchMove);
    window.removeEventListener('touchend', onContinuousTouchEnd);
    window.removeEventListener('touchcancel', onContinuousTouchEnd);
    document.removeEventListener('keydown', onContinuousKeydown);
    track.removeEventListener('focusin', onContinuousFocusIn);
    prevBtn.removeEventListener('click', continuousStepPrev);
    nextBtn.removeEventListener('click', continuousStepNext);
    continuousTouchActive = false;
    continuousTouchIsHorizontal = null;
  }

  function sizeSpacers() {
    // Reset first: stops are measured relative to an untransformed track so
    // sizes stay in local (pre-scale) units regardless of any scale/scroll
    // left over from a previous frame (important across a resize).
    track.style.transform = '';
    const vw = localViewportWidth();

    // Beats use a CSS-native 100vw/100dvh, which is measured against the
    // REAL viewport, not the track's local (pre-scale) space -- once a
    // stage scale is in play that renders too narrow/wide by a factor of
    // stageScale. Pin their local width explicitly so the rendered (scaled)
    // result exactly fills the real viewport, same as everything else here.
    document.querySelectorAll('.beat').forEach((beat) => { beat.style.width = vw + 'px'; });

    document.querySelectorAll('.scene').forEach((scene) => {
      const lead = scene.querySelector('.spacer--lead');
      const trail = scene.querySelector('.spacer--trail');
      lead.style.width = '0px'; trail.style.width = '0px';
      const pieces = scene.querySelectorAll('.stop');
      if (!pieces.length) return;
      const firstW = pieces[0].getBoundingClientRect().width;
      const lastW = pieces[pieces.length - 1].getBoundingClientRect().width;
      lead.style.width = Math.max(0, (vw - firstW) / 2) + 'px';
      trail.style.width = Math.max(0, (vw - lastW) / 2) + 'px';
    });
  }

  function measureStops() {
    // Positions are measured relative to the track's own rect, so the result
    // is correct whether or not a translateX is currently applied to it --
    // the current offset cancels out of (elementLeft - trackLeft).
    const trackRect = track.getBoundingClientRect();
    stops.forEach((s) => {
      const r = s.el.getBoundingClientRect();
      s.start = r.left - trackRect.left;
      s.width = r.width;
      s.centerX = s.start + r.width / 2;
    });
    beatRanges = stops
      .map((s, i) => ({ ...s, index: i }))
      .filter((s) => s.kind === 'beat');
    maxScrollX = Math.max(0, trackRect.width - localViewportWidth());
  }

  function applyTransform() {
    track.style.transform = 'scale(' + stageScale + ') translateX(' + (-scrollX) + 'px)';
    updateSeamHardCut();
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

  function syncActiveFromScroll() {
    const centerPoint = scrollX + localViewportWidth() / 2;
    const idx = nearestStopIndex(centerPoint);
    if (idx !== currentIndex) { currentIndex = idx; applyActiveStop(idx); }
  }

  function setTarget(px) {
    targetScrollX = Math.max(0, Math.min(maxScrollX, px));
    kick();
  }

  function settleToBeatIfNeeded() {
    const centerPoint = targetScrollX + localViewportWidth() / 2;
    const beat = beatContaining(centerPoint);
    if (beat) setTarget(beat.centerX - localViewportWidth() / 2);
  }

  function onContinuousWheel(e) {
    if (!lightbox.hidden) return;
    e.preventDefault();
    const delta = Math.max(-160, Math.min(160, e.deltaY));
    setTarget(targetScrollX + delta / stageScale);

    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(settleToBeatIfNeeded, 140);
  }

  // Touch drag -- the same direct-manipulation physics as the wheel handler
  // above, just fed by finger position instead of wheel deltas. This is what
  // lets mobile use the exact same continuous engine as desktop rather than
  // a separate discrete/paged interaction.
  let continuousTouchActive = false;
  let continuousTouchStartX = 0, continuousTouchStartY = 0, continuousTouchLastX = 0;
  let continuousTouchIsHorizontal = null;

  function onContinuousTouchStart(e) {
    if (!lightbox.hidden || !e.touches.length) return;
    continuousTouchActive = true;
    continuousTouchStartX = continuousTouchLastX = e.touches[0].clientX;
    continuousTouchStartY = e.touches[0].clientY;
    continuousTouchIsHorizontal = null;
  }

  function onContinuousTouchMove(e) {
    if (!continuousTouchActive || !e.touches.length) return;
    const x = e.touches[0].clientX, y = e.touches[0].clientY;
    if (continuousTouchIsHorizontal === null) {
      const totalDx = x - continuousTouchStartX, totalDy = y - continuousTouchStartY;
      if (Math.abs(totalDx) > 8 || Math.abs(totalDy) > 8) continuousTouchIsHorizontal = Math.abs(totalDx) > Math.abs(totalDy);
    }
    if (!continuousTouchIsHorizontal) { continuousTouchLastX = x; return; }
    e.preventDefault();
    const dx = x - continuousTouchLastX;
    setTarget(targetScrollX - dx / stageScale);
    continuousTouchLastX = x;
  }

  function onContinuousTouchEnd() {
    if (continuousTouchActive && continuousTouchIsHorizontal) settleToBeatIfNeeded();
    continuousTouchActive = false;
    continuousTouchIsHorizontal = null;
  }

  function continuousStepPrev() { continuousStepTo(-1); }
  function continuousStepNext() { continuousStepTo(1); }
  function continuousStepTo(delta) {
    const centerPoint = targetScrollX + localViewportWidth() / 2;
    const from = nearestStopIndex(centerPoint);
    const to = Math.max(0, Math.min(stops.length - 1, from + delta));
    setTarget(stops[to].centerX - localViewportWidth() / 2);
  }

  function onContinuousKeydown(e) {
    if (!lightbox.hidden) { if (e.key === 'Escape') closeLightbox(); return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); continuousStepNext(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); continuousStepPrev(); }
  }

  function onContinuousFocusIn(e) {
    const stopEl = e.target.closest('.stop');
    if (!stopEl) return;
    const idx = stops.findIndex((s) => s.el === stopEl);
    if (idx !== -1) setTarget(stops[idx].centerX - localViewportWidth() / 2);
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
