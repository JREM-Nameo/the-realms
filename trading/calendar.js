import { supabaseClient } from '../js/auth.js';
import {
    fmtMoney, fmtPct, pad2, MONTH_NAMES, escapeHtml, targetForDate, todayStr,
    makeStateSwitcher, fetchUserChallenges, populateChallengeSelect, pickPreferredChallenge,
    dayStatus, challengeEndDate, initSidebarToggle
} from './shared.js';

initSidebarToggle();

const loadingState     = document.getElementById('loadingState');
const signedOutState   = document.getElementById('signedOutState');
const noChallengeState = document.getElementById('noChallengeState');
const calendarState    = document.getElementById('calendarState');
const gateSignInBtn    = document.getElementById('gateSignInBtn');
const challengeSelect  = document.getElementById('challengeSelect');
const calendarChallengeName = document.getElementById('calendarChallengeName');

const prevMonthBtn = document.getElementById('prevMonthBtn');
const nextMonthBtn = document.getElementById('nextMonthBtn');
const monthLabel   = document.getElementById('monthLabel');
const calendarGrid = document.getElementById('calendarGrid');

const dayPopover = document.getElementById('dayPopover');
const popDate    = document.getElementById('popDate');
const popBody     = document.getElementById('popBody');

let currentUser = null;
let challenges = [];
let selectedChallenge = null;
let entries = [];
let entryByDate = new Map(); // date string -> { entry, target, plDollar, plPct, hit }
let viewYear, viewMonth; // 0-indexed month

gateSignInBtn.addEventListener('click', () => window.toggleAuth());

/* ── View switching ── */
const showState = makeStateSwitcher({
    loading: loadingState,
    out: signedOutState,
    'no-challenge': noChallengeState,
    calendar: calendarState
});

/* ── Load challenges, populate selector ── */
async function loadChallenges() {
    try {
        challenges = await fetchUserChallenges(supabaseClient, currentUser.id);
    } catch (error) {
        console.error(error);
        showState('no-challenge');
        return;
    }

    if (!challenges.length) {
        showState('no-challenge');
        return;
    }

    populateChallengeSelect(challengeSelect, challenges);
    const preferred = pickPreferredChallenge(challenges);
    challengeSelect.value = preferred.id;
    selectedChallenge = preferred;

    await loadEntries();
    showState('calendar');
}

challengeSelect.addEventListener('change', async () => {
    selectedChallenge = challenges.find(c => c.id === challengeSelect.value);
    await loadEntries();
});

/* ── Load entries for selected challenge ── */
async function loadEntries() {
    calendarChallengeName.textContent = selectedChallenge.name;

    const { data, error } = await supabaseClient
        .from('daily_entries')
        .select('*')
        .eq('challenge_id', selectedChallenge.id)
        .order('entry_date', { ascending: true });

    if (error) { console.error(error); return; }
    entries = data || [];
    buildEntryMap();

    // Always default to the current month, matching the dashboard's mini calendar.
    const today = new Date();
    viewYear = today.getFullYear();
    viewMonth = today.getMonth();

    closePopover();
    renderCalendar();
}

/* ── Build a date → stats map ── */
function buildEntryMap() {
    entryByDate = new Map();
    const startingBalance = Number(selectedChallenge.starting_balance);

    entries.forEach((e, i) => {
        const prevBalance = i > 0 ? Number(entries[i - 1].balance) : startingBalance;
        const balance = Number(e.balance);
        const target = targetForDate(selectedChallenge, e.entry_date);
        const plDollar = balance - prevBalance;
        const plPct = prevBalance ? (plDollar / prevBalance) * 100 : 0;
        entryByDate.set(e.entry_date, {
            entry: e,
            balance,
            target,
            plDollar,
            plPct,
            hit: balance >= target
        });
    });
}

/* ── Month navigation ── */
prevMonthBtn.addEventListener('click', () => {
    viewMonth--;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    closePopover();
    renderCalendar();
});
nextMonthBtn.addEventListener('click', () => {
    viewMonth++;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    closePopover();
    renderCalendar();
});

/* ── Render month grid ── */
function renderCalendar() {
    monthLabel.textContent = `${MONTH_NAMES[viewMonth]} ${viewYear}`;

    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

    const startDate = selectedChallenge.start_date;
    const endDate = challengeEndDate(selectedChallenge);
    const today = todayStr();

    let html = '';
    for (let cell = 0; cell < totalCells; cell++) {
        const dayNum = cell - firstWeekday + 1;

        if (dayNum < 1 || dayNum > daysInMonth) {
            html += `<div class="cal-cell cal-cell-pad"></div>`;
            continue;
        }

        const dateStr = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(dayNum)}`;
        const inRange = dateStr >= startDate && dateStr <= endDate;
        const stats = entryByDate.get(dateStr);
        const status = dayStatus(selectedChallenge, dateStr, stats ? stats.entry : null);

        let dotClass = 'cal-dot-none';
        if (status === 'hit') dotClass = 'cal-dot-hit';
        else if (status === 'miss' || status === 'missed') dotClass = 'cal-dot-miss';

        const extra = stats ? `
                <span class="cal-balance">${fmtMoney(stats.balance)}</span>
                <span class="cal-pl ${stats.plDollar >= 0 ? 'positive' : 'negative'}">${fmtPct(stats.plPct)}</span>` : '';

        const cellClasses = ['cal-cell'];
        if (!inRange) cellClasses.push('cal-cell-outside');
        if (dateStr === today) cellClasses.push('cal-cell-today');

        html += `
            <button type="button" class="${cellClasses.join(' ')}" data-date="${dateStr}">
                <span class="cal-daynum">${dayNum}</span>
                <span class="cal-dot ${dotClass}"></span>
                ${extra}
            </button>`;
    }

    calendarGrid.innerHTML = html;
}

/* ── Click a day → popover ── */
calendarGrid.addEventListener('click', (e) => {
    const cell = e.target.closest('.cal-cell:not(.cal-cell-pad)');
    if (!cell) return;
    const dateStr = cell.dataset.date;
    const stats = entryByDate.get(dateStr);
    const status = dayStatus(selectedChallenge, dateStr, stats ? stats.entry : null);

    popDate.textContent = formatLongDate(dateStr);
    popBody.innerHTML = buildPopoverBody(dateStr, stats, status);

    positionPopover(cell);
    dayPopover.classList.remove('hidden');
});

function buildPopoverBody(dateStr, stats, status) {
    if (stats) {
        return `
            <div class="day-pop-row"><span>Balance</span><span>${fmtMoney(stats.balance)}</span></div>
            <div class="day-pop-row"><span>P/L $</span><span class="${stats.plDollar >= 0 ? 'positive' : 'negative'}">${stats.plDollar >= 0 ? '+' : ''}${fmtMoney(stats.plDollar)}</span></div>
            <div class="day-pop-row"><span>P/L %</span><span class="${stats.plDollar >= 0 ? 'positive' : 'negative'}">${fmtPct(stats.plPct)}</span></div>
            <div class="day-pop-row"><span>Target</span><span>${fmtMoney(stats.target)}</span></div>
            <div class="day-pop-row"><span>vs Target</span><span class="${stats.hit ? 'positive' : 'negative'}">${stats.hit ? 'Hit' : 'Missed'}</span></div>
            ${stats.entry.note ? `<p class="day-pop-note">${escapeHtml(stats.entry.note)}</p>` : ''}
        `;
    }

    const target = targetForDate(selectedChallenge, dateStr);

    switch (status) {
        case 'missed':
            return `
                <p class="day-pop-note day-pop-missed">No entry logged — this day was skipped.</p>
                <div class="day-pop-row"><span>Target</span><span>${fmtMoney(target)}</span></div>
                <a class="day-pop-link" href="progress.html">Log this day →</a>
            `;
        case 'pending':
            return `
                <p class="day-pop-note">Not logged yet — there's still time today.</p>
                <div class="day-pop-row"><span>Target</span><span>${fmtMoney(target)}</span></div>
                <a class="day-pop-link" href="progress.html">Log today →</a>
            `;
        case 'upcoming':
            return `<p class="day-pop-note">This day hasn't arrived yet.</p>`;
        default: // outside the challenge's start–end range
            return `<p class="day-pop-note">Outside this challenge's date range.</p>`;
    }
}

function formatLongDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function positionPopover(cell) {
    const rect = cell.getBoundingClientRect();
    const popW = 220;
    let left = rect.left + rect.width / 2 - popW / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - popW - 12));
    const top = rect.bottom + window.scrollY + 8;
    dayPopover.style.left = `${left}px`;
    dayPopover.style.top = `${top}px`;
}

function closePopover() {
    dayPopover.classList.add('hidden');
}

document.addEventListener('click', (e) => {
    if (dayPopover.classList.contains('hidden')) return;
    if (dayPopover.contains(e.target) || e.target.closest('.cal-cell')) return;
    closePopover();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePopover();
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
