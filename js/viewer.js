/* ═══════════════════════════════════════════════════════
   viewer.js — Unified document viewer (PDF, DOCX, TXT,
   PPTX, Image, YouTube). All files open inside the app.
   + renderInto() for Workspace multi-tab rendering.
   ═══════════════════════════════════════════════════════ */

const Viewer = (() => {
  let pdfDoc = null;
  let pdfScale = 1.3;
  let pdfPage = 1;
  let pdfTotal = 0;
  let imgScale = 1;
  let thumbsVisible = false;
  let currentFileId = null;
  let pdfScrollObserver = null;
  const CIRCUMFERENCE = 553;

  /* ── Worker ─────────────────────────────────────────── */
  function initWorker() {
    if (typeof pdfjsLib !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }

  /* ── Elements ───────────────────────────────────────── */
  const el = id => document.getElementById(id);

  /* ── Open file by ID (modal viewer — unchanged) ────── */
  async function open(fileId) {
    const meta = FileMeta.getById(fileId);
    if (!meta) { showToast('File not found', 'error'); return; }

    currentFileId = fileId;

    // Show modal
    const modal = el('viewer-modal');
    modal.classList.remove('hidden');
    el('viewer-filename').textContent = meta.name;
    el('viewer-main').innerHTML = `<div class="spinner" style="margin-top:80px;"></div>`;

    // Hide all controls
    el('pdf-controls').classList.add('hidden');
    el('pdf-controls').style.display = 'none';
    el('img-controls').classList.add('hidden');
    el('img-controls').style.display = 'none';

    try {
      if (meta.type === 'youtube') {
        await openYouTube(meta);
      } else {
        const fileObj = await FileStore.get(fileId);
        if (!fileObj || !fileObj.data) throw new Error('File data not found');

        if (meta.type === 'pdf') await openPDF(fileObj.data, meta);
        else if (meta.type === 'image') await openImage(fileObj.data, meta);
        else if (meta.type === 'txt') await openTXT(fileObj.data, meta);
        else if (meta.type === 'docx' || meta.type === 'doc') await openDOCX(fileObj.data, meta);
        else if (meta.type === 'pptx' || meta.type === 'ppt') await openPPTX(fileObj.data, meta);
        else openUnsupported(meta);
      }
    } catch (err) {
      el('viewer-main').innerHTML = `
        <div class="unsupported-viewer">
          <div style="font-size:3rem;margin-bottom:12px;">⚠️</div>
          <h3>Could not open file</h3>
          <p>${escapeHtml(err.message)}</p>
        </div>`;
      showToast('Failed to open file: ' + err.message, 'error');
    }
  }

  /* ══════════════════════════════════════════════════════
     renderInto() — Render a file into an arbitrary container
     Used by Workspace for multi-tab rendering.
     Returns a cleanup function to dispose resources.
     ══════════════════════════════════════════════════════ */
  async function renderInto(fileId, containerEl) {
    const meta = FileMeta.getById(fileId);
    if (!meta) { containerEl.innerHTML = `<div class="ws-render-error">File not found</div>`; return null; }

    containerEl.innerHTML = `<div class="spinner" style="margin-top:80px;"></div>`;

    const state = { pdfDoc: null, observer: null, destroyed: false };

    try {
      if (meta.type === 'youtube') {
        renderYouTubeInto(meta, containerEl);
      } else {
        const fileObj = await FileStore.get(fileId);
        if (!fileObj || !fileObj.data) throw new Error('File data not found');
        if (state.destroyed) return null;

        if (meta.type === 'pdf') await renderPDFInto(fileObj.data, meta, containerEl, state);
        else if (meta.type === 'image') renderImageInto(fileObj.data, meta, containerEl);
        else if (meta.type === 'txt') renderTXTInto(fileObj.data, meta, containerEl);
        else if (meta.type === 'docx' || meta.type === 'doc') await renderDOCXInto(fileObj.data, meta, containerEl);
        else if (meta.type === 'pptx' || meta.type === 'ppt') renderPPTXInto(meta, containerEl);
        else renderUnsupportedInto(meta, containerEl);
      }
    } catch (err) {
      if (!state.destroyed) {
        containerEl.innerHTML = `
          <div class="unsupported-viewer">
            <div style="font-size:3rem;margin-bottom:12px;">⚠️</div>
            <h3>Could not open file</h3>
            <p>${escapeHtml(err.message)}</p>
          </div>`;
      }
    }

    // Return cleanup function
    return () => {
      state.destroyed = true;
      if (state.observer) { state.observer.disconnect(); state.observer = null; }
      if (state.pdfDoc) { state.pdfDoc.destroy?.(); state.pdfDoc = null; }
      containerEl.innerHTML = '';
    };
  }

  /* ── Standalone renderers (for Workspace) ──────────── */

  async function renderPDFInto(data, meta, container, state) {
    if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js not loaded');

    const loadingTask = pdfjsLib.getDocument({ data: data.slice(0) });
    const pdf = await loadingTask.promise;
    if (state.destroyed) { pdf.destroy?.(); return; }
    state.pdfDoc = pdf;

    const total = pdf.numPages;
    const scale = 1.3;
    const dpr = window.devicePixelRatio || 1;

    // Build toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'ws-pdf-toolbar';
    toolbar.innerHTML = `
      <button class="btn-icon ws-pdf-prev" title="Previous page"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button>
      <div class="ws-pdf-page-info">
        <input class="ws-pdf-page-input" type="number" min="1" max="${total}" value="1" />
        <span>/ ${total}</span>
      </div>
      <button class="btn-icon ws-pdf-next" title="Next page"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></button>
      <div style="width:1px;height:20px;background:var(--border);margin:0 4px;"></div>
      <button class="btn-icon ws-pdf-zout" title="Zoom out"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg></button>
      <span class="ws-pdf-zoom-label">130%</span>
      <button class="btn-icon ws-pdf-zin" title="Zoom in"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg></button>
    `;

    const wrap = document.createElement('div');
    wrap.className = 'ws-pdf-pages-wrap';

    container.innerHTML = '';
    container.appendChild(toolbar);
    container.appendChild(wrap);

    let currentScale = scale;
    let currentPage = 1;

    // Render all pages
    async function renderAllPagesWS() {
      if (state.destroyed) return;
      
      const prevScrollTop = container.scrollTop;
      const prevScrollHeight = container.scrollHeight;
      const scrollPercent = prevScrollHeight > 0 ? (prevScrollTop / prevScrollHeight) : 0;

      wrap.innerHTML = '';
      if (state.observer) state.observer.disconnect();

      state.observer = new IntersectionObserver(entries => {
        const vis = entries.find(e => e.isIntersecting);
        if (vis) {
          const pn = parseInt(vis.target.dataset.page);
          if (currentPage !== pn) {
            currentPage = pn;
            const inp = toolbar.querySelector('.ws-pdf-page-input');
            if (inp) inp.value = pn;
          }
        }
      }, { root: container, threshold: 0.35 });

      for (let i = 1; i <= total; i++) {
        const pw = document.createElement('div');
        pw.className = 'pdf-page-wrap';
        pw.dataset.page = i;
        wrap.appendChild(pw);
        if (!state.destroyed) {
          const page = await pdf.getPage(i);
          const vp = page.getViewport({ scale: currentScale });
          const canvas = document.createElement('canvas');
          canvas.width = vp.width * dpr;
          canvas.height = vp.height * dpr;
          canvas.style.width = `${vp.width}px`;
          canvas.style.height = `${vp.height}px`;
          pw.appendChild(canvas);
          const ctx = canvas.getContext('2d');
          ctx.scale(dpr, dpr);
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
        }
        state.observer.observe(pw);
      }

      if (prevScrollHeight > 0) {
        container.scrollTop = scrollPercent * container.scrollHeight;
      }
    }

    await renderAllPagesWS();

    // Bind toolbar
    function goToPageWS(n) {
      currentPage = Math.max(1, Math.min(n, total));
      const inp = toolbar.querySelector('.ws-pdf-page-input');
      if (inp) inp.value = currentPage;
      const t = wrap.querySelector(`[data-page="${currentPage}"]`);
      if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    toolbar.querySelector('.ws-pdf-prev')?.addEventListener('click', () => goToPageWS(currentPage - 1));
    toolbar.querySelector('.ws-pdf-next')?.addEventListener('click', () => goToPageWS(currentPage + 1));
    toolbar.querySelector('.ws-pdf-page-input')?.addEventListener('change', e => goToPageWS(parseInt(e.target.value)));
    toolbar.querySelector('.ws-pdf-zin')?.addEventListener('click', () => {
      currentScale = Math.min(3, +(currentScale + 0.2).toFixed(1));
      toolbar.querySelector('.ws-pdf-zoom-label').textContent = Math.round(currentScale * 100) + '%';
      renderAllPagesWS();
    });
    toolbar.querySelector('.ws-pdf-zout')?.addEventListener('click', () => {
      currentScale = Math.max(0.5, +(currentScale - 0.2).toFixed(1));
      toolbar.querySelector('.ws-pdf-zoom-label').textContent = Math.round(currentScale * 100) + '%';
      renderAllPagesWS();
    });
  }

  function renderImageInto(data, meta, container) {
    const blob = new Blob([data]);
    const url = URL.createObjectURL(blob);
    let scale = 1;

    container.innerHTML = `
      <div class="ws-img-toolbar">
        <button class="btn-icon ws-img-zout" title="Zoom out"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg></button>
        <span class="ws-img-zoom-label">100%</span>
        <button class="btn-icon ws-img-zin" title="Zoom in"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg></button>
      </div>
      <div class="image-viewer">
        <img src="${url}" alt="${escapeHtml(meta.name)}" class="ws-viewer-img" draggable="false" />
      </div>`;

    const img = container.querySelector('.ws-viewer-img');
    const imgContainer = container.querySelector('.image-viewer');
    const zLabel = container.querySelector('.ws-img-zoom-label');

    function updateZoom() { if (zLabel) zLabel.textContent = Math.round(scale * 100) + '%'; }

    container.querySelector('.ws-img-zin')?.addEventListener('click', () => {
      scale = Math.min(5, +(scale + 0.2).toFixed(1));
      if (img) img.style.transform = `scale(${scale})`;
      updateZoom();
    });
    container.querySelector('.ws-img-zout')?.addEventListener('click', () => {
      scale = Math.max(0.3, +(scale - 0.2).toFixed(1));
      if (img) img.style.transform = `scale(${scale})`;
      updateZoom();
    });

    imgContainer?.addEventListener('wheel', e => {
      e.preventDefault();
      scale = Math.max(0.3, Math.min(5, scale - e.deltaY * 0.002));
      if (img) img.style.transform = `scale(${scale})`;
      updateZoom();
    }, { passive: false });
  }

  function renderTXTInto(data, meta, container) {
    const text = new TextDecoder().decode(data);
    container.innerHTML = `
      <div class="text-viewer">
        <h2 style="margin-bottom:16px;font-size:1.1rem;">${escapeHtml(meta.name)}</h2>
        <pre style="white-space:pre-wrap;word-break:break-word;font-size:0.88rem;line-height:1.75;color:var(--text);">${escapeHtml(text)}</pre>
      </div>`;
  }

  async function renderDOCXInto(data, meta, container) {
    if (typeof mammoth === 'undefined') {
      container.innerHTML = `<div class="unsupported-viewer"><div style="font-size:3rem;">📝</div><h3>${escapeHtml(meta.name)}</h3><p>Word document viewer loading…<br>Try refreshing if it doesn't load.</p></div>`;
      return;
    }
    try {
      let arrayBuffer = data;
      if (data instanceof Uint8Array) arrayBuffer = data.buffer;
      else if (data instanceof Blob) arrayBuffer = await data.arrayBuffer();
      else if (data && data.data instanceof ArrayBuffer) arrayBuffer = data.data;
      else if (data && data.data instanceof Uint8Array) arrayBuffer = data.data.buffer;

      const result = await mammoth.convertToHtml({ arrayBuffer });
      container.innerHTML = `<div class="text-viewer">${result.value}</div>`;
    } catch (err) {
      container.innerHTML = `<div class="unsupported-viewer"><div style="font-size:3rem;">⚠️</div><h3>Failed to parse Word Document</h3><p>${escapeHtml(err.message)}</p></div>`;
    }
  }

  function renderPPTXInto(meta, container) {
    container.innerHTML = `
      <div class="text-viewer">
        <div style="text-align:center;padding:20px 0 28px;">
          <div style="font-size:3rem;margin-bottom:12px;">📊</div>
          <h2 style="color:var(--text);margin-bottom:8px;">${escapeHtml(meta.name)}</h2>
          <p style="color:var(--text-3);font-size:0.875rem;max-width:380px;margin:0 auto 20px;">
            PowerPoint files are stored securely in your library. 
            For full slide rendering, you can view the file below.
          </p>
          <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-lg);padding:16px;font-size:0.82rem;color:var(--text-3);text-align:left;">
            <strong style="color:var(--text);">📌 File info</strong><br>
            Name: ${escapeHtml(meta.name)}<br>
            Type: PowerPoint Presentation<br>
            Uploaded: ${formatDate(meta.uploadedAt)}
            ${meta.subjectId ? `<br>Subject: ${(LS.get('subjects',[]).find(s=>s.id===meta.subjectId)||{}).name||''}` : ''}
          </div>
        </div>
      </div>`;
  }

  function renderYouTubeInto(meta, container) {
    if (!meta.youtubeId) {
      container.innerHTML = `<div class="unsupported-viewer"><h3>Invalid YouTube link</h3></div>`;
      return;
    }
    container.innerHTML = `
      <div class="yt-viewer">
        <iframe src="https://www.youtube.com/embed/${encodeURIComponent(meta.youtubeId)}"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen
                title="${escapeHtml(meta.name)}">
        </iframe>
      </div>`;
  }

  function renderUnsupportedInto(meta, container) {
    container.innerHTML = `
      <div class="unsupported-viewer">
        <div style="font-size:3rem;">${getFileIcon(meta.type)}</div>
        <h3 style="margin:12px 0 6px;">${escapeHtml(meta.name)}</h3>
        <p>This file type cannot be previewed in the browser.</p>
      </div>`;
  }

  /* ══════════════════════════════════════════════════════
     Original modal-only renderers (unchanged)
     ══════════════════════════════════════════════════════ */

  /* ── PDF ─────────────────────────────────────────────── */
  async function openPDF(data, meta) {
    if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js not loaded');

    el('pdf-controls').classList.remove('hidden');
    el('pdf-controls').style.display = 'flex';

    const loadingTask = pdfjsLib.getDocument({ data: data.slice(0) });
    pdfDoc = await loadingTask.promise;
    pdfTotal = pdfDoc.numPages;
    pdfPage = 1;
    pdfScale = 1.3;

    el('pdf-total-pages').textContent = `/ ${pdfTotal}`;
    el('pdf-page-input').value = 1;
    el('pdf-page-input').max = pdfTotal;
    updateZoomLabel();

    await renderAllPages();

    // Build thumbnails (async, non-blocking)
    buildThumbnails();
  }

  async function renderAllPages() {
    const mainEl = el('viewer-main');
    const prevScrollTop = mainEl.scrollTop;
    const prevScrollHeight = mainEl.scrollHeight;
    const scrollPercent = prevScrollHeight > 0 ? (prevScrollTop / prevScrollHeight) : 0;

    const wrap = document.createElement('div');
    wrap.className = 'pdf-pages-wrap';
    mainEl.innerHTML = '';
    mainEl.appendChild(wrap);

    if (pdfScrollObserver) {
      pdfScrollObserver.disconnect();
    }

    pdfScrollObserver = new IntersectionObserver(entries => {
      // Find the first intersecting page
      const visibleEntry = entries.find(e => e.isIntersecting);
      if (visibleEntry) {
        const pageNum = parseInt(visibleEntry.target.dataset.page);
        if (pdfPage !== pageNum) {
          pdfPage = pageNum;
          el('pdf-page-input').value = pageNum;
          document.querySelectorAll('.thumb-item').forEach(t => {
            t.classList.toggle('active', parseInt(t.dataset.page) === pageNum);
          });
        }
      }
    }, {
      root: mainEl,
      threshold: 0.35 // Trigger when 35% of the page container is inside viewport bounds
    });

    for (let i = 1; i <= pdfTotal; i++) {
      const pageWrap = document.createElement('div');
      pageWrap.className = 'pdf-page-wrap';
      pageWrap.id = `pdf-p-${i}`;
      pageWrap.dataset.page = i;
      wrap.appendChild(pageWrap);
      await renderPageToEl(i, pageWrap);
      pdfScrollObserver.observe(pageWrap);
    }

    if (prevScrollHeight > 0) {
      mainEl.scrollTop = scrollPercent * mainEl.scrollHeight;
    }
  }

  async function renderPageToEl(pageNum, container) {
    const page = await pdfDoc.getPage(pageNum);
    const vp = page.getViewport({ scale: pdfScale });
    const canvas = document.createElement('canvas');
    
    // Retina/High-DPI resolution scaling
    const dpr = window.devicePixelRatio || 1;
    canvas.width = vp.width * dpr;
    canvas.height = vp.height * dpr;
    canvas.style.width = `${vp.width}px`;
    canvas.style.height = `${vp.height}px`;

    container.innerHTML = '';
    container.appendChild(canvas);
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    await page.render({ canvasContext: ctx, viewport: vp }).promise;
  }

  async function buildThumbnails() {
    const panel = el('pdf-thumbs-panel');
    if (!panel || !pdfDoc) return;
    panel.innerHTML = '';

    for (let i = 1; i <= pdfTotal; i++) {
      const item = document.createElement('div');
      item.className = `thumb-item${i === pdfPage ? ' active' : ''}`;
      item.dataset.page = i;
      item.innerHTML = `<div class="thumb-label">p. ${i}</div>`;
      panel.appendChild(item);

      // Render tiny canvas
      try {
        const page = await pdfDoc.getPage(i);
        const vp = page.getViewport({ scale: 0.18 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        item.insertBefore(canvas, item.firstChild);
        page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
      } catch {}

      item.addEventListener('click', () => goToPage(parseInt(item.dataset.page)));
    }
  }

  function goToPage(n) {
    pdfPage = Math.max(1, Math.min(n, pdfTotal));
    el('pdf-page-input').value = pdfPage;
    const target = document.getElementById(`pdf-p-${pdfPage}`);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Update active thumb
    document.querySelectorAll('.thumb-item').forEach(t => {
      t.classList.toggle('active', parseInt(t.dataset.page) === pdfPage);
    });
  }

  function changePDFScale(delta) {
    if (!pdfDoc) return;
    pdfScale = Math.max(0.5, Math.min(3, +(pdfScale + delta).toFixed(1)));
    updateZoomLabel();
    renderAllPages().then(() => buildThumbnails());
  }

  function updateZoomLabel() {
    const lbl = el('pdf-zoom-label');
    if (lbl) lbl.textContent = Math.round(pdfScale * 100) + '%';
  }

  async function searchPDF(query) {
    if (!pdfDoc || !query.trim()) return;
    const q = query.toLowerCase();
    for (let i = 1; i <= pdfTotal; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map(it => it.str).join(' ').toLowerCase();
      if (text.includes(q)) { goToPage(i); showToast(`Found on page ${i}`, 'success'); return; }
    }
    showToast(`"${query}" not found`, 'warning');
  }

  function addBookmark() {
    if (!pdfDoc || !currentFileId) return;
    const bookmarks = LS.get('bookmarks', []);
    if (bookmarks.find(b => b.fileId === currentFileId && b.page === pdfPage)) {
      showToast('Page already bookmarked', 'info'); return;
    }
    bookmarks.push({ id: Date.now().toString(), fileId: currentFileId, page: pdfPage, at: new Date().toISOString() });
    LS.set('bookmarks', bookmarks);
    showToast(`Page ${pdfPage} bookmarked!`, 'success');
  }

  /* ── Image ───────────────────────────────────────────── */
  async function openImage(data, meta) {
    imgScale = 1;
    el('img-controls').classList.remove('hidden');
    el('img-controls').style.display = 'flex';
    updateImgZoom();

    const blob = new Blob([data]);
    const url = URL.createObjectURL(blob);
    const main = el('viewer-main');
    main.innerHTML = `
      <div class="image-viewer">
        <img src="${url}" alt="${escapeHtml(meta.name)}" id="viewer-img" draggable="false" />
      </div>`;

    // Pinch zoom (touch) & wheel zoom
    const img = document.getElementById('viewer-img');
    let isDragging = false, startX, startY, scrollLeft, scrollTop;

    main.addEventListener('wheel', e => {
      e.preventDefault();
      imgScale = Math.max(0.3, Math.min(5, imgScale - e.deltaY * 0.002));
      img.style.transform = `scale(${imgScale})`;
      updateImgZoom();
    }, { passive: false });

    main.addEventListener('mousedown', e => {
      isDragging = true;
      startX = e.pageX - main.offsetLeft;
      startY = e.pageY - main.offsetTop;
      scrollLeft = main.scrollLeft;
      scrollTop = main.scrollTop;
      main.style.cursor = 'grabbing';
    });
    main.addEventListener('mouseup', () => { isDragging = false; main.style.cursor = 'default'; });
    main.addEventListener('mousemove', e => {
      if (!isDragging) return;
      main.scrollLeft = scrollLeft - (e.pageX - main.offsetLeft - startX);
      main.scrollTop  = scrollTop  - (e.pageY - main.offsetTop  - startY);
    });
  }

  function changeImgScale(delta) {
    imgScale = Math.max(0.3, Math.min(5, +(imgScale + delta).toFixed(1)));
    const img = document.getElementById('viewer-img');
    if (img) img.style.transform = `scale(${imgScale})`;
    updateImgZoom();
  }

  function updateImgZoom() {
    const lbl = el('img-zoom-label');
    if (lbl) lbl.textContent = Math.round(imgScale * 100) + '%';
  }

  /* ── TXT ─────────────────────────────────────────────── */
  async function openTXT(data, meta) {
    const text = new TextDecoder().decode(data);
    el('viewer-main').innerHTML = `
      <div class="text-viewer">
        <h2 style="margin-bottom:16px;font-size:1.1rem;">${escapeHtml(meta.name)}</h2>
        <pre style="white-space:pre-wrap;word-break:break-word;font-size:0.88rem;line-height:1.75;color:var(--text);">${escapeHtml(text)}</pre>
      </div>`;
  }

  /* ── DOCX ────────────────────────────────────────────── */
  async function openDOCX(data, meta) {
    if (typeof mammoth === 'undefined') {
      el('viewer-main').innerHTML = `<div class="unsupported-viewer"><div style="font-size:3rem;">📝</div><h3>${escapeHtml(meta.name)}</h3><p>Word document viewer loading…<br>Try refreshing if it doesn't load.</p></div>`;
      return;
    }
    try {
      let arrayBuffer = data;
      if (data instanceof Uint8Array) {
        arrayBuffer = data.buffer;
      } else if (data instanceof ArrayBuffer) {
        arrayBuffer = data;
      } else if (data instanceof Blob) {
        arrayBuffer = await data.arrayBuffer();
      } else if (data && data.data instanceof ArrayBuffer) {
        arrayBuffer = data.data;
      } else if (data && data.data instanceof Uint8Array) {
        arrayBuffer = data.data.buffer;
      }
      
      const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
      el('viewer-main').innerHTML = `<div class="text-viewer">${result.value}</div>`;
    } catch (err) {
      console.error(err);
      el('viewer-main').innerHTML = `<div class="unsupported-viewer"><div style="font-size:3rem;">⚠️</div><h3>Failed to parse Word Document</h3><p>${escapeHtml(err.message)}</p></div>`;
    }
  }

  /* ── PPTX (text extraction) ──────────────────────────── */
  async function openPPTX(data, meta) {
    try {
      // Try to extract text from PPTX (which is a ZIP)
      // Since we don't have JSZip loaded, show a preview message
      el('viewer-main').innerHTML = `
        <div class="text-viewer">
          <div style="text-align:center;padding:20px 0 28px;">
            <div style="font-size:3rem;margin-bottom:12px;">📊</div>
            <h2 style="color:var(--text);margin-bottom:8px;">${escapeHtml(meta.name)}</h2>
            <p style="color:var(--text-3);font-size:0.875rem;max-width:380px;margin:0 auto 20px;">
              PowerPoint files are stored securely in your library. 
              For full slide rendering, you can view the file below.
            </p>
            <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-lg);padding:16px;font-size:0.82rem;color:var(--text-3);text-align:left;">
              <strong style="color:var(--text);">📌 File info</strong><br>
              Name: ${escapeHtml(meta.name)}<br>
              Type: PowerPoint Presentation<br>
              Uploaded: ${formatDate(meta.uploadedAt)}
              ${meta.subjectId ? `<br>Subject: ${(LS.get('subjects',[]).find(s=>s.id===meta.subjectId)||{}).name||''}` : ''}
            </div>
          </div>
        </div>`;
    } catch (err) {
      openUnsupported(meta);
    }
  }

  /* ── YouTube ─────────────────────────────────────────── */
  async function openYouTube(meta) {
    if (!meta.youtubeId) {
      el('viewer-main').innerHTML = `<div class="unsupported-viewer"><h3>Invalid YouTube link</h3></div>`;
      return;
    }
    el('viewer-main').innerHTML = `
      <div class="yt-viewer">
        <iframe src="https://www.youtube.com/embed/${encodeURIComponent(meta.youtubeId)}"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen
                title="${escapeHtml(meta.name)}">
        </iframe>
      </div>`;
  }

  /* ── Unsupported ─────────────────────────────────────── */
  function openUnsupported(meta) {
    el('viewer-main').innerHTML = `
      <div class="unsupported-viewer">
        <div style="font-size:3rem;">${getFileIcon(meta.type)}</div>
        <h3 style="margin:12px 0 6px;">${escapeHtml(meta.name)}</h3>
        <p>This file type cannot be previewed in the browser.</p>
      </div>`;
  }

  /* ── Close ───────────────────────────────────────────── */
  function close() {
    const modal = el('viewer-modal');
    modal.classList.add('hidden');
    pdfDoc = null;
    currentFileId = null;
    if (pdfScrollObserver) {
      pdfScrollObserver.disconnect();
      pdfScrollObserver = null;
    }
    el('pdf-thumbs-panel').classList.add('hidden');
    el('viewer-main').innerHTML = '';
    thumbsVisible = false;
  }

  /* ── Fullscreen ──────────────────────────────────────── */
  function toggleFullscreen() {
    const container = el('viewer-modal');
    if (!document.fullscreenElement) {
      container.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  }

  /* ── Extract PDF text (for notes) ───────────────────── */
  async function extractPDFText(fileId, maxPages = 10) {
    const fileObj = await FileStore.get(fileId);
    if (!fileObj || !fileObj.data) return '';
    const loadingTask = pdfjsLib.getDocument({ data: fileObj.data.slice(0) });
    const pdf = await loadingTask.promise;
    let text = '';
    const limit = Math.min(maxPages, pdf.numPages);
    for (let i = 1; i <= limit; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(it => it.str).join(' ') + '\n\n';
    }
    return text;
  }

  /* ── Bind events ─────────────────────────────────────── */
  function bindEvents() {
    // Close
    el('viewer-close').addEventListener('click', close);
    el('viewer-modal').addEventListener('click', e => {
      if (e.target === el('viewer-modal')) close();
    });

    // Fullscreen
    el('viewer-fullscreen').addEventListener('click', toggleFullscreen);

    // PDF controls
    el('pdf-prev').addEventListener('click', () => goToPage(pdfPage - 1));
    el('pdf-next').addEventListener('click', () => goToPage(pdfPage + 1));
    el('pdf-page-input').addEventListener('change', e => goToPage(parseInt(e.target.value)));
    el('pdf-zoom-in').addEventListener('click', () => changePDFScale(0.2));
    el('pdf-zoom-out').addEventListener('click', () => changePDFScale(-0.2));
    el('pdf-bookmark').addEventListener('click', addBookmark);
    el('pdf-search').addEventListener('keydown', e => { if (e.key === 'Enter') searchPDF(e.target.value); });

    // Thumbnails toggle
    el('pdf-thumbs-btn').addEventListener('click', () => {
      thumbsVisible = !thumbsVisible;
      el('pdf-thumbs-panel').classList.toggle('hidden', !thumbsVisible);
    });

    // Image controls
    el('img-zoom-in').addEventListener('click', () => changeImgScale(0.2));
    el('img-zoom-out').addEventListener('click', () => changeImgScale(-0.2));

    // PDF keyboard shortcuts
    document.addEventListener('keydown', e => {
      if (el('viewer-modal').classList.contains('hidden')) return;
      if (document.activeElement.tagName === 'INPUT') return;

      if (e.key === 'Escape') close();
      if (pdfDoc) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goToPage(pdfPage + 1); }
        if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); goToPage(pdfPage - 1); }
        if (e.key === '+' || e.key === '=') { e.preventDefault(); changePDFScale(0.2); }
        if (e.key === '-') { e.preventDefault(); changePDFScale(-0.2); }
      }
    });

    // Page scroll observer takes care of active tracking cleanly without event listener
    // Keep focus inside viewer on load
    el('viewer-main').focus();
  }

  function init() {
    initWorker();
    bindEvents();
  }

  return { init, open, close, extractPDFText, renderInto };
})();
