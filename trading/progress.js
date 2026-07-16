import { supabaseClient } from '../js/auth.js';

const signedOutState   = document.getElementById('signedOutState');
const noChallengeState = document.getElementById('noChallengeState');
const progressState    = document.getElementById('progressState');
const gateSignInBtn    = document.getElementById('gateSignInBtn');
const challengeSelect  = document.getElementById('challengeSelect');
const newEntryBtn      = document.getElementById('newEntryBtn');
const entryTableBody   = document.getElementById('entryTableBody');
const progressChallengeName = document.getElementById('progressChallengeName');

const entryPopup        = document.getElementById('entryPopup');
const entryTitle         = document.getElementById('entryTitle');
const eDate               = document.getElementById('eDate');
const eBalance             = document.getElementById('eBalance');
const eNote                = document.getElementById('eNote');
const eScreenshot           = document.getElementById('eScreenshot');
const eScreenshotPreview     = document.getElementById('eScreenshotPreview');
const entryError              = document.getElementById('entryError');
const entrySubmitBtn           = document.getElementById('entrySubmitBtn');

const lightbox      = document.getElementById('lightbox');
const lightboxImg   = document.getElementById('lightboxImg');

let currentUser = null;
let challenges = [];
let selectedChallenge = null;
let entries = [];
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

function todayStr() { return new Date().toISOString().slice(0, 10); }

function openEntryForm(mode, entry) {
    entryError.textContent = '';
    eScreenshot.value = '';
    if (mode === 'edit') {
        editingEntryId = entry.id;
        entryTitle.textContent = 'Edit Entry';
        eDate.value = entry.entry_date;
        eBalance.value = entry.balance;
        eNote.value = entry.note || '';
        if (entry.screenshot_url) {
            eScreenshotPreview.src = entry.screenshot_url;
            eScreenshotPreview.classList.remove('hidden');
        } else {
            eScreenshotPreview.classList.add('hidden');
        }
    } else {
        editingEntryId = null;
        entryTitle.textContent = 'Log an Entry';
        eDate.value = todayStr();
        eBalance.value = '';
        eNote.value = '';
        eScreenshotPreview.classList.add('hidden');
    }
    entryPopup.classList.add('active');
    document.body.style.overflow = 'hidden';
}
newEntryBtn.addEventListener('click', () => openEntryForm('create'));

/* ── View switching ── */
function showState(name) {
    signedOutState.classList.toggle('hidden', name !== 'out');
    noChallengeState.classList.toggle('hidden', name !== 'no-challenge');
    progressState.classList.toggle('hidden', name !== 'progress');
}

/* ── Formatting ── */
const fmtMoney = (n) => '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct   = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

/* ── Load challenges, populate selector ── */
async function loadChallenges() {
    const { data, error } = await supabaseClient
        .from('challenges')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

    if (error) { console.error(error); return; }
    challenges = data || [];

    if (!challenges.length) {
        showState('no-challenge');
        return;
    }

    challengeSelect.innerHTML = challenges.map(c =>
        `<option value="${c.id}">${escapeHtml(c.name)} (${c.status})</option>`
    ).join('');

    const preferred = challenges.find(c => c.status === 'active') || challenges[0];
    challengeSelect.value = preferred.id;
    selectedChallenge = preferred;

    await loadEntries();
    showState('progress');
}

challengeSelect.addEventListener('change', async () => {
    selectedChallenge = challenges.find(c => c.id === challengeSelect.value);
    await loadEntries();
});

/* ── Load entries for selected challenge ── */
async function loadEntries() {
    progressChallengeName.textContent = selectedChallenge.name;

    const { data, error } = await supabaseClient
        .from('daily_entries')
        .select('*')
        .eq('challenge_id', selectedChallenge.id)
        .order('entry_date', { ascending: true });

    if (error) { console.error(error); return; }
    entries = data || [];
    renderTable();
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/* ── Render entry table ── */
function renderTable() {
    if (!entries.length) {
        entryTableBody.innerHTML = `<tr><td colspan="9" class="activity-empty">No entries yet — log your first day.</td></tr>`;
        return;
    }

    const rate = selectedChallenge.daily_target_percent / 100;
    const startingBalance = Number(selectedChallenge.starting_balance);

    const rows = entries.map((e, i) => {
        const prevBalance = i > 0 ? Number(entries[i - 1].balance) : startingBalance;
        const balance = Number(e.balance);
        const plDollar = balance - prevBalance;
        const plPct = prevBalance ? (plDollar / prevBalance) * 100 : 0;
        const target = startingBalance * Math.pow(1 + rate, i + 1);
        const gap = balance - target;

        const thumb = e.screenshot_url
            ? `<button class="thumb-btn" data-view="${e.screenshot_url}"><img src="${e.screenshot_url}" alt="Screenshot"></button>`
            : '';

        return `<tr>
            <td>${e.entry_date}</td>
            <td>${fmtMoney(balance)}</td>
            <td class="${plDollar >= 0 ? 'positive' : 'negative'}">${plDollar >= 0 ? '+' : ''}${fmtMoney(plDollar)}</td>
            <td class="${plDollar >= 0 ? 'positive' : 'negative'}">${fmtPct(plPct)}</td>
            <td>${fmtMoney(target)}</td>
            <td class="${gap >= 0 ? 'positive' : 'negative'}">${gap >= 0 ? '+' : ''}${fmtMoney(gap)}</td>
            <td class="entry-note-cell">${e.note ? escapeHtml(e.note) : '—'}</td>
            <td>${thumb}</td>
            <td>
                <button class="chip-btn" data-edit="${e.id}">Edit</button>
                <button class="chip-btn danger" data-delete="${e.id}">Delete</button>
            </td>
        </tr>`;
    }).reverse(); // most recent first

    entryTableBody.innerHTML = rows.join('');
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
        const ok = window.confirm('Delete this entry? This cannot be undone.');
        if (!ok) return;
        const { error } = await supabaseClient.from('daily_entries').delete().eq('id', deleteBtn.dataset.delete);
        if (error) { alert(error.message); return; }
        await loadEntries();
    }
});

/* ── Save entry (create or edit), with optional screenshot upload ── */
entrySubmitBtn.addEventListener('click', async () => {
    entryError.textContent = '';
    const date = eDate.value;
    const balance = parseFloat(eBalance.value);
    const note = eNote.value.trim() || null;
    const file = eScreenshot.files[0];

    if (!date || !(balance >= 0)) {
        entryError.textContent = 'Enter a valid date and balance.';
        return;
    }

    entrySubmitBtn.disabled = true;
    try {
        const { data: saved, error: saveErr } = editingEntryId
            ? await supabaseClient
                .from('daily_entries')
                .update({ entry_date: date, balance, note })
                .eq('id', editingEntryId)
                .select()
                .single()
            : await supabaseClient
                .from('daily_entries')
                .upsert({
                    challenge_id: selectedChallenge.id,
                    entry_date: date,
                    balance,
                    note
                }, { onConflict: 'challenge_id,entry_date' })
                .select()
                .single();

        if (saveErr) { entryError.textContent = saveErr.message; return; }

        if (file) {
            const ext = file.name.split('.').pop();
            const path = `${currentUser.id}/${selectedChallenge.id}/${saved.entry_date}-${Date.now()}.${ext}`;
            const { error: uploadErr } = await supabaseClient.storage
                .from('daily-screenshots')
                .upload(path, file, { upsert: true });

            if (uploadErr) { entryError.textContent = `Saved, but screenshot upload failed: ${uploadErr.message}`; }
            else {
                const { data: pub } = supabaseClient.storage.from('daily-screenshots').getPublicUrl(path);
                await supabaseClient
                    .from('daily_entries')
                    .update({ screenshot_url: pub.publicUrl })
                    .eq('id', saved.id);
            }
        }

        window.toggleEntry();
        await loadEntries();
    } catch (err) {
        entryError.textContent = 'Something went wrong. Please try again.';
    } finally {
        entrySubmitBtn.disabled = false;
    }
});

/* ── Auth state ── */
supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentUser = session ? session.user : null;
    if (!currentUser) { showState('out'); return; }
    loadChallenges();
});

supabaseClient.auth.getSession().then(({ data: { session } }) => {
    currentUser = session ? session.user : null;
    if (!currentUser) showState('out'); else loadChallenges();
});
