/**
 * Artemis II Photo Archive — embeddable browser
 *
 * Uses NASA Image Library API (https://images-api.nasa.gov) directly from the
 * browser. Public, CORS-enabled, no API key required.
 *
 * Default query: keywords=Artemis II (4,600+ results). Search box overrides.
 * Each page renders 24 thumbnails with lazy loading; click → lightbox with
 * the large variant + metadata. Keyboard arrow navigation in the lightbox.
 *
 * Embeddable via iframe. URL params:
 *   ?q=...        custom query (defaults to keywords=Artemis II)
 *   ?p=2          start at page 2
 */
(function () {
    'use strict';

    const API_BASE = 'https://images-api.nasa.gov/search';
    const ASSETS_BASE = 'https://images-assets.nasa.gov/image';
    const PAGE_SIZE = 24;
    const DEFAULT_QUERY = 'Artemis II';
    // Filter to mission-year photos by default — surfaces the in-flight imagery
    // (Earthsets, lunar close-ups, crew portraits) instead of pre-launch ground
    // shots which dominate the unfiltered "Artemis II" keyword search.
    const DEFAULT_YEAR_START = '2026';

    const $ = (id) => document.getElementById(id);
    const els = {
        form: $('apb-search-form'),
        q: $('apb-q'),
        status: $('apb-status'),
        grid: $('apb-grid'),
        pager: $('apb-pager'),
        prev: $('apb-prev'),
        next: $('apb-next'),
        pageInfo: $('apb-page-info'),
        lightbox: $('apb-lightbox'),
        lbImg: $('apb-lightbox-img'),
        lbTitle: $('apb-lightbox-title'),
        lbDate: $('apb-lightbox-date'),
        lbPhotographer: $('apb-lightbox-photographer'),
        lbDesc: $('apb-lightbox-desc'),
        lbNasa: $('apb-lightbox-nasa'),
        lbOrig: $('apb-lightbox-orig'),
        lbClose: $('apb-lightbox-close'),
        lbPrev: $('apb-lightbox-prev'),
        lbNext: $('apb-lightbox-next'),
    };

    const state = {
        query: DEFAULT_QUERY,
        page: 1,
        totalHits: 0,
        items: [],
        lbIndex: -1,
    };

    /* ===========================================================
       URL state — sync ?q and ?p so the browser's back/forward and
       sharable URLs work as expected.
       =========================================================== */
    function readUrlState() {
        const sp = new URLSearchParams(location.search);
        const q = sp.get('q');
        const p = parseInt(sp.get('p') || '1', 10);
        if (q) state.query = q;
        if (p > 0) state.page = p;
        if (q) els.q.value = q;
    }

    function writeUrlState(replace = false) {
        const sp = new URLSearchParams();
        if (state.query !== DEFAULT_QUERY) sp.set('q', state.query);
        if (state.page > 1) sp.set('p', String(state.page));
        const newUrl = sp.toString() ? `?${sp}` : location.pathname;
        if (replace) history.replaceState(null, '', newUrl);
        else history.pushState(null, '', newUrl);
    }

    /* ===========================================================
       API call — NASA Image Library returns:
         collection.items[].data[]    metadata array (1 item)
         collection.items[].links[]   link array (the .href is a thumb)
       We construct the larger variants ourselves from nasa_id since
       the search response only provides thumbs.
       =========================================================== */
    async function fetchPage(query, page) {
        setStatus('Loading…');
        clearGrid();

        const url = new URL(API_BASE);
        url.searchParams.set('keywords', query);
        url.searchParams.set('media_type', 'image');
        url.searchParams.set('page', String(page));
        url.searchParams.set('page_size', String(PAGE_SIZE));
        // Surface in-flight imagery first when the user hasn't customized the search.
        // (Drop the year filter if they typed a custom query — let them search the
        // full archive including pre-launch content.)
        if (query === DEFAULT_QUERY) {
            url.searchParams.set('year_start', DEFAULT_YEAR_START);
        }

        let resp;
        try {
            resp = await fetch(url.toString(), { mode: 'cors' });
        } catch (e) {
            setStatus(`Network error: ${e.message}`, true);
            return;
        }
        if (!resp.ok) {
            setStatus(`API error: HTTP ${resp.status}`, true);
            return;
        }

        let data;
        try {
            data = await resp.json();
        } catch (e) {
            setStatus(`Bad response: ${e.message}`, true);
            return;
        }

        const items = (data.collection && data.collection.items) || [];
        const totalHits = (data.collection && data.collection.metadata && data.collection.metadata.total_hits) || 0;

        state.totalHits = totalHits;
        state.items = items.map(normalizeItem).filter(Boolean);

        if (state.items.length === 0) {
            setStatus(totalHits === 0 ? `No photos found for "${query}".` : 'No photos on this page.', true);
            updatePager();
            return;
        }

        const totalPages = Math.ceil(totalHits / PAGE_SIZE);
        setStatus(`${totalHits.toLocaleString()} photos · page ${page} of ${totalPages.toLocaleString()}`);
        renderGrid(state.items);
        updatePager();
    }

    function normalizeItem(raw) {
        const data = (raw.data && raw.data[0]) || null;
        const links = raw.links || [];
        if (!data || !data.nasa_id) return null;

        const id = data.nasa_id;
        // The thumbnail URL — use what the API provides directly when possible
        const thumbLink = links.find(l => l.rel === 'preview') || links[0];
        const thumbUrl = (thumbLink && thumbLink.href) || `${ASSETS_BASE}/${id}/${id}~thumb.jpg`;

        return {
            id,
            title: data.title || 'Untitled',
            description: data.description || data.description_508 || '',
            photographer: data.photographer || data.secondary_creator || 'NASA',
            dateCreated: data.date_created || '',
            keywords: data.keywords || [],
            thumbUrl,
            // Asset URLs we construct directly — saves a per-photo asset-manifest call
            largeUrl: `${ASSETS_BASE}/${id}/${id}~large.jpg`,
            origUrl: `${ASSETS_BASE}/${id}/${id}~orig.jpg`,
            nasaUrl: `https://images.nasa.gov/details/${id}`,
        };
    }

    function setStatus(msg, isError = false) {
        els.status.textContent = msg || '';
        els.status.classList.toggle('is-error', !!isError);
    }

    /* ===========================================================
       Grid render — keep DOM small; use IntersectionObserver-driven
       native lazy-loading via loading="lazy".
       =========================================================== */
    function clearGrid() {
        while (els.grid.firstChild) els.grid.removeChild(els.grid.firstChild);
    }

    function renderGrid(items) {
        const frag = document.createDocumentFragment();
        items.forEach((item, idx) => {
            const cell = document.createElement('div');
            cell.className = 'apb-cell';
            cell.tabIndex = 0;
            cell.setAttribute('role', 'button');
            cell.setAttribute('aria-label', item.title);
            cell.dataset.idx = String(idx);

            const img = document.createElement('img');
            img.src = item.thumbUrl;
            img.alt = item.title;
            img.loading = 'lazy';
            img.decoding = 'async';
            img.onerror = () => {
                // If the API thumb URL fails, try our constructed thumb
                if (img.dataset.fallback) return;
                img.dataset.fallback = '1';
                img.src = `${ASSETS_BASE}/${item.id}/${item.id}~thumb.jpg`;
            };

            const title = document.createElement('div');
            title.className = 'apb-cell-title';
            title.textContent = item.title;

            cell.appendChild(img);
            cell.appendChild(title);
            cell.addEventListener('click', () => openLightbox(idx));
            cell.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openLightbox(idx);
                }
            });
            frag.appendChild(cell);
        });
        els.grid.appendChild(frag);
    }

    function updatePager() {
        const totalPages = Math.max(1, Math.ceil(state.totalHits / PAGE_SIZE));
        els.prev.disabled = state.page <= 1;
        els.next.disabled = state.page >= totalPages;
        els.pageInfo.textContent = state.totalHits
            ? `Page ${state.page} / ${totalPages.toLocaleString()}`
            : '—';
    }

    /* ===========================================================
       Lightbox
       =========================================================== */
    function openLightbox(idx) {
        if (idx < 0 || idx >= state.items.length) return;
        state.lbIndex = idx;
        renderLightbox();
        els.lightbox.hidden = false;
        document.body.style.overflow = 'hidden';
    }

    function closeLightbox() {
        els.lightbox.hidden = true;
        document.body.style.overflow = '';
        // Free the loaded image so it doesn't sit in memory
        els.lbImg.src = '';
    }

    function renderLightbox() {
        const item = state.items[state.lbIndex];
        if (!item) return;
        els.lbImg.src = item.largeUrl;
        els.lbImg.alt = item.title;
        els.lbImg.onerror = () => {
            // Fall back to thumb if large fails
            if (els.lbImg.dataset.fallback) return;
            els.lbImg.dataset.fallback = '1';
            els.lbImg.src = item.thumbUrl;
        };
        els.lbImg.dataset.fallback = '';
        els.lbTitle.textContent = item.title;
        els.lbDate.textContent = formatDate(item.dateCreated);
        els.lbPhotographer.textContent = `Photo: ${item.photographer || 'NASA'}`;
        els.lbDesc.textContent = item.description || '';
        els.lbNasa.href = item.nasaUrl;
        els.lbOrig.href = item.origUrl;
    }

    function formatDate(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    function lightboxNav(delta) {
        const next = state.lbIndex + delta;
        if (next < 0 || next >= state.items.length) return;
        state.lbIndex = next;
        renderLightbox();
    }

    /* ===========================================================
       Wiring
       =========================================================== */
    els.form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = els.q.value.trim();
        state.query = v || DEFAULT_QUERY;
        state.page = 1;
        writeUrlState();
        fetchPage(state.query, state.page);
    });

    els.prev.addEventListener('click', () => {
        if (state.page <= 1) return;
        state.page -= 1;
        writeUrlState();
        fetchPage(state.query, state.page);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    els.next.addEventListener('click', () => {
        const totalPages = Math.ceil(state.totalHits / PAGE_SIZE);
        if (state.page >= totalPages) return;
        state.page += 1;
        writeUrlState();
        fetchPage(state.query, state.page);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    els.lbClose.addEventListener('click', closeLightbox);
    els.lbPrev.addEventListener('click', () => lightboxNav(-1));
    els.lbNext.addEventListener('click', () => lightboxNav(1));
    els.lightbox.addEventListener('click', (e) => {
        if (e.target === els.lightbox) closeLightbox();
    });

    document.addEventListener('keydown', (e) => {
        if (els.lightbox.hidden) return;
        if (e.key === 'Escape') closeLightbox();
        else if (e.key === 'ArrowLeft') lightboxNav(-1);
        else if (e.key === 'ArrowRight') lightboxNav(1);
    });

    window.addEventListener('popstate', () => {
        readUrlState();
        fetchPage(state.query, state.page);
    });

    // Initial load
    readUrlState();
    writeUrlState(true); // canonicalize URL
    fetchPage(state.query, state.page);
})();
