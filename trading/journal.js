import { supabaseClient } from '../js/auth.js';
import {
    fmtMoney, fmtPct, todayStr, escapeHtml, makeStateSwitcher, showConfirm, initSidebarToggle
} from './shared.js';

initSidebarToggle();

const loadingState   = document.getElementById('loadingState');
const signedOutState = document.getElementById('signedOutState');
const journalState   = document.getElementById('journalState');
const gateSignInBtn  = document.getElementById('gateSignInBtn');
const newEntryBtn    = document.getElementById('newEntryBtn');
const entryTableBody = document.getElementById('entryTableBody');
const filterRow      = document.getElementById('filterRow');

const statTotalTrades = document.getElementById('statTotalTrades');
const statWinRate     = document.getElementById('statWinRate');
const statNetPl       = document.getElementById('statNetPl');

const entryPopup            = document.getElementById('entryPopup');
const entryTitle            = document.getElementById('entryTitle');
const eDate                 = document.getElementById('eDate');
const eSymbol                = document.getElementById('eSymbol');
const eDirection              = document.getElementById('eDirection');
const eEntryPrice              = document.getElementById('eEntryPrice');
const eExitPrice                = document.getElementById('eExitPrice');
const ePl                        = document.getElementById('ePl');
const eNote                       = document.getElementById('eNote');
const eScreenshot                  = document.getElementById('eScreenshot');
const eScreenshotPreview            = document.getElementById('eScreenshotPreview');
const entryError                     = document.getElementById('entryError');
const entrySubmitBtn                  = document.getElementById('entrySubmitBtn');

const lightbox    = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');

let currentUser = null;
let entries = [];
let activeFilter = 'all';
let editingEntryId = null; // null = new entry

/* ── Modal helpers ── */
window.toggleEntry = function () {
    const opening = !entryPopup.classList.contains('active');
    entryPopup.classList.toggle('active');
    document.body.style.overflow = opening ? 'hidden' : '';
    if (!opening) editingEntryId = null;
};
window.handleEntryOverlayClick = (e) => { if (e.target === e.currentTarget) window.toggleEntry(); };

window.toggleLightbox = function () {
    lightbox.classList.toggle('active');
};
window.handleLightboxClick = (e) => { if (e.target === e.currentTarget) window.toggleLightbox(); };

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (entryPopup.classList.contains('active')) window.toggleEntry();
    if (lightbox.classList.contains('active')) window.toggleLightbox();
});

gateSignInBtn.addEventListener('click', () => window.toggleAuth());

function openEntryForm(mode, entry) {
    entryError.textContent = '';
    eScreenshot.value = '';
    if (mode === 'edit') {
        editingEntryId = entry.id;
        entryTitle.textContent = 'Edit Trade';
        eDate.value = entry.trade_date;
        eSymbol.value = entry.symbol;
        eDirection.value = entry.direction;
        eEntryPrice.value = entry.entry_price ?? '';
        eExitPrice.value = entry.exit_price ?? '';
        ePl.value = entry.pl_dollar;
        eNote.value = entry.note || '';
        if (entry.screenshot_url) {
            eScreenshotPreview.src = entry.screenshot_url;
            eScreenshotPreview.classList.remove('hidden');
        } else {
            eScreenshotPreview.classList.add('hidden');
        }
    } else {
        editingEntryId = null;
        entryTitle.textContent = 'Log a Trade';
        eDate.value = todayStr();
        eSymbol.value = '';
        eDirection.value = 'long';
        eEntryPrice.value = '';
        eExitPrice.value = '';
        ePl.value = '';
        eNote.value = '';
        eScreenshotPreview.classList.add('hidden');
    }
    entryPopup.classList.add('active');
    document.body.style.overflow = 'hidden';
}
newEntryBtn.addEventListener('click', () => openEntryForm('create'));

/* ── Filters ── */
filterRow.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-chip');
    if (!btn) return;
    activeFilter = btn.dataset.filter;
    [...filterRow.children].forEach(b => b.classList.toggle('active', b === btn));
    renderTable();
});

function filteredEntries() {
    switch (activeFilter) {
        case 'long': return entries.filter(e => e.direction === 'long');
        case 'short': return entries.filter(e => e.direction === 'short');
        case 'win': return entries.filter(e => Number(e.pl_dollar) >= 0);
        case 'loss': return entries.filter(e => Number(e.pl_dollar) < 0);
        default: return entries;
    }
}

/* ── View switching ── */
const showState = makeStateSwitcher({
    loading: loadingState,
    out: signedOutState,
    journal: journalState
});

/* ── Load entries ── */
async function loadEntries() {
    const { data, error } = await supabaseClient
        .from('journal_entries')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('trade_date', { ascending: false })
        .order('created_at', { ascending: false });

    if (error) {
        console.error(error);
        showState('journal');
        entryTableBody.innerHTML = `<tr><td colspan="9" class="activity-empty">Couldn't load your journal. Please refresh and try again.</td></tr>`;
        return;
    }
    entries = data || [];
    renderStats();
    renderTable();
    showState('journal');
}

/* ── Stats ── */
function renderStats() {
    const total = entries.length;
    const wins = entries.filter(e => Number(e.pl_dollar) >= 0).length;
    const netPl = entries.reduce((sum, e) => sum + Number(e.pl_dollar), 0);

    statTotalTrades.textContent = total;
    statWinRate.textContent = total ? `${((wins / total) * 100).toFixed(1)}%` : '—';
    statNetPl.textContent = (netPl >= 0 ? '+' : '') + fmtMoney(netPl);
    statNetPl.className = 'stat-value ' + (netPl >= 0 ? 'positive' : 'negative');
}

/* ── Render table ── */
function renderTable() {
    const rows = filteredEntries();

    if (!rows.length) {
        entryTableBody.innerHTML = `<tr><td colspan="9" class="activity-empty">No ${activeFilter === 'all' ? '' : activeFilter + ' '}trades yet.</td></tr>`;
        return;
    }

    entryTableBody.innerHTML = rows.map((e) => {
        const pl = Number(e.pl_dollar);
        const thumb = e.screenshot_url
            ? `<button class="thumb-btn" data-view="${e.screenshot_url}"><img src="${e.screenshot_url}" alt="Screenshot"></button>`
            : '';

        return `<tr>
            <td>${e.trade_date}</td>
            <td>${escapeHtml(e.symbol)}</td>
            <td><span class="direction-badge ${e.direction}">${e.direction === 'long' ? 'Long' : 'Short'}</span></td>
            <td>${e.entry_price != null ? e.entry_price : '—'}</td>
            <td>${e.exit_price != null ? e.exit_price : '—'}</td>
            <td class="${pl >= 0 ? 'positive' : 'negative'}">${pl >= 0 ? '+' : ''}${fmtMoney(pl)}</td>
            <td class="entry-note-cell">${e.note ? escapeHtml(e.note) : '—'}</td>
            <td>${thumb}</td>
            <td>
                <button class="chip-btn" data-edit="${e.id}">Edit</button>
                <button class="chip-btn danger" data-delete="${e.id}">Delete</button>
            </td>
        </tr>`;
    }).join('');
}

/* ── Table interactions (edit / delete / view screenshot) ── */
entryTableBody.addEventListener('click', async (e) => {
    const thumbBtn = e.target.closest('.thumb-btn');
    if (thumbBtn) {
        lightboxImg.src = thumbBtn.dataset.view;
        window.toggleLightbox();
        return;
    }

    const editBtn = e.target.closest('[data-edit]');
    if (editBtn) {
        const entry = entries.find(en => en.id === editBtn.dataset.edit);
        if (entry) openEntryForm('edit', entry);
        return;
    }

    const deleteBtn = e.target.closest('[data-delete]');
    if (deleteBtn) {
        const ok = await showConfirm({
            title: 'Delete this trade?',
            message: 'This will permanently remove this journal entry. This cannot be undone.',
            confirmLabel: 'Delete Trade',
            danger: true
        });
        if (!ok) return;
        const { error } = await supabaseClient.from('journal_entries').delete().eq('id', deleteBtn.dataset.delete);
        if (error) { alert(error.message); return; }
        await loadEntries();
    }
});

/* ── Save trade (create or edit), with optional screenshot upload ── */
entrySubmitBtn.addEventListener('click', async () => {
    entryError.textContent = '';
    const date = eDate.value;
    const symbol = eSymbol.value.trim();
    const direction = eDirection.value;
    const entryPrice = eEntryPrice.value === '' ? null : parseFloat(eEntryPrice.value);
    const exitPrice = eExitPrice.value === '' ? null : parseFloat(eExitPrice.value);
    const pl = parseFloat(ePl.value);
    const note = eNote.value.trim() || null;
    const file = eScreenshot.files[0];

    if (!date || !symbol || isNaN(pl)) {
        entryError.textContent = 'Enter at least a date, symbol, and P/L.';
        return;
    }

    entrySubmitBtn.disabled = true;
    let uploadedPath = null; // tracked so we can clean up if the DB save fails after a successful upload
    try {
        let screenshotUrl; // left undefined = don't touch screenshot_url on this save
        if (file) {
            const ext = file.name.split('.').pop();
            const path = `${currentUser.id}/journal/${date}-${Date.now()}.${ext}`;
            const { error: uploadErr } = await supabaseClient.storage
                .from('daily-screenshots')
                .upload(path, file, { upsert: true });

            if (uploadErr) {
                entryError.textContent = `Screenshot upload failed: ${uploadErr.message}`;
                return;
            }
            uploadedPath = path;
            const { data: pub } = supabaseClient.storage.from('daily-screenshots').getPublicUrl(path);
            screenshotUrl = pub.publicUrl;
        }

        const payload = {
            trade_date: date, symbol, direction,
            entry_price: entryPrice, exit_price: exitPrice,
            pl_dollar: pl, note
        };
        if (screenshotUrl) payload.screenshot_url = screenshotUrl;

        const { error: saveErr } = editingEntryId
            ? await supabaseClient.from('journal_entries').update(payload).eq('id', editingEntryId)
            : await supabaseClient.from('journal_entries').insert({ user_id: currentUser.id, ...payload });

        if (saveErr) {
            entryError.textContent = saveErr.message;
            if (uploadedPath) {
                await supabaseClient.storage.from('daily-screenshots').remove([uploadedPath]);
            }
            return;
        }

        window.toggleEntry();
        await loadEntries();
    } catch (err) {
        entryError.textContent = 'Something went wrong. Please try again.';
        if (uploadedPath) {
            await supabaseClient.storage.from('daily-screenshots').remove([uploadedPath]).catch(() => {});
        }
    } finally {
        entrySubmitBtn.disabled = false;
    }
});

/* ── Auth state ── */
supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentUser = session ? session.user : null;
    if (!currentUser) { showState('out'); return; }
    loadEntries();
});

supabaseClient.auth.getSession().then(({ data: { session } }) => {
    currentUser = session ? session.user : null;
    if (!currentUser) showState('out'); else loadEntries();
});
