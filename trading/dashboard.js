import { supabaseClient } from '../js/auth.js';
import { fmtMoney, fmtPct, todayStr, pad2, MONTH_NAMES, targetForDay, targetForDate, finalTarget, makeStateSwitcher, daysElapsed, dayStatus, computeStreak, showConfirm } from './shared.js';

/* ── Element refs ── */
const loadingState    = document.getElementById('loadingState');
const signedOutState  = document.getElementById('signedOutState');
const emptyState      = document.getElementById('emptyState');
const dashboardState  = document.getElementById('dashboardState');

const gateSignInBtn   = document.getElementById('gateSignInBtn');
const emptyCreateBtn  = document.getElementById('emptyCreateBtn');
const logBtn          = document.getElementById('logBtn');
const miniChartContainer = document.getElementById('miniChartContainer');
const miniCalStrip       = document.getElementById('miniCalStrip');

const createPopup     = document.getElementById('createPopup');
const cName            = document.getElementById('cName');
const cBalance         = document.getElementById('cBalance');
const cTarget          = document.getElementById('cTarget');
const cDuration        = document.getElementById('cDuration');
const createError      = document.getElementById('createError');
const createSubmitBtn  = document.getElementById('createSubmitBtn');

const logPopup         = document.getElementById('logPopup');
const lBalance          = document.getElementById('lBalance');
const lNote             = document.getElementById('lNote');
const logError          = document.getElementById('logError');
const logSubmitBtn      = document.getElementById('logSubmitBtn');

let currentUser = null;
let currentChallenge = null;
let currentEntries = [];

/* ── Modal open/close (same pattern as the rest of the site) ── */
function makeToggle(popup, onOpen) {
    return function () {
        const opening = !popup.classList.contains('active');
        popup.classList.toggle('active');
        document.body.style.overflow = opening ? 'hidden' : '';
        if (opening && onOpen) onOpen();
    };
}
window.toggleCreate = makeToggle(createPopup, () => { createError.textContent = ''; });
window.toggleLog    = makeToggle(logPopup, () => {
    logError.textContent = '';
    const existing = currentEntries.find(e => e.entry_date === todayStr());
    lBalance.value = existing ? existing.balance : '';
    lNote.value = existing ? (existing.note || '') : '';
});
window.handleCreateOverlayClick = (e) => { if (e.target === e.currentTarget) window.toggleCreate(); };
window.handleLogOverlayClick    = (e) => { if (e.target === e.currentTarget) window.toggleLog(); };

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (createPopup.classList.contains('active')) window.toggleCreate();
    if (logPopup.classList.contains('active')) window.toggleLog();
});

gateSignInBtn.addEventListener('click', () => window.toggleAuth());
emptyCreateBtn.addEventListener('click', () => window.toggleCreate());
logBtn.addEventListener('click', () => window.toggleLog());

/* ── View switching ── */
const showState = makeStateSwitcher({
    loading: loadingState,
    out: signedOutState,
    empty: emptyState,
    dashboard: dashboardState
});

/* ── Core calculations ── */
function computeDashboard(challenge, entries) {
    const startingBalance = Number(challenge.starting_balance);
    const currentBalance = entries.length
        ? Number(entries[entries.length - 1].balance)
        : startingBalance;
    const prevBalance = entries.length > 1
        ? Number(entries[entries.length - 2].balance)
        : startingBalance;

    const todaysTarget = targetForDate(challenge, todayStr());
    const finalTargetVal = finalTarget(challenge);

    const progressPct = finalTargetVal > startingBalance
        ? Math.min(100, Math.max(0, ((currentBalance - startingBalance) / (finalTargetVal - startingBalance)) * 100))
        : 0;

    // Streak and days completed/remaining are based on the actual calendar,
    // via start_date — not on how many entries happen to exist. A skipped
    // day still counts as elapsed and breaks the streak.
    const streak = computeStreak(entries);
    const daysCompleted = daysElapsed(challenge);
    const daysRemaining = Math.max(0, challenge.duration_days - daysCompleted);
    const balanceDelta = currentBalance - prevBalance;
    const balanceDeltaPct = prevBalance ? (balanceDelta / prevBalance) * 100 : 0;
    const targetGap = currentBalance - todaysTarget;

    return {
        currentBalance, todaysTarget, finalTarget: finalTargetVal, progressPct,
        streak, daysCompleted, daysRemaining, balanceDelta, balanceDeltaPct, targetGap
    };
}

/* ── Mini equity chart (compact version of the Analytics chart) ── */
function buildMiniChartSvg(challenge, entries) {
    const startingBalance = Number(challenge.starting_balance);
    const durationDays = Math.max(1, challenge.duration_days);

    const targetPoints = [];
    for (let d = 0; d <= durationDays; d++) {
        targetPoints.push({ x: d, y: targetForDay(challenge, d) });
    }
    const actualPoints = [{ x: 0, y: startingBalance }];
    entries.forEach((e, i) => actualPoints.push({ x: i + 1, y: Number(e.balance) }));

    const allY = [...targetPoints.map(p => p.y), ...actualPoints.map(p => p.y)];
    const yMin = Math.min(...allY) * 0.97;
    const yMax = Math.max(...allY) * 1.03;
    const xMax = durationDays;

    const W = 400, H = 120, margin = 6;
    const chartW = W - margin * 2;
    const chartH = H - margin * 2;
    const sx = (x) => margin + (xMax > 0 ? (x / xMax) * chartW : 0);
    const sy = (y) => margin + chartH - ((y - yMin) / (yMax - yMin || 1)) * chartH;

    const targetPath = targetPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
    const actualPath = actualPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
    const last = actualPoints[actualPoints.length - 1];

    return `
    <svg viewBox="0 0 ${W} ${H}" class="mini-chart-svg" xmlns="http://www.w3.org/2000/svg">
        <path d="${targetPath}" class="chart-line-target" fill="none" />
        <path d="${actualPath}" class="chart-line-actual" fill="none" />
        <circle cx="${sx(last.x).toFixed(1)}" cy="${sy(last.y).toFixed(1)}" r="3.5" class="chart-point" />
    </svg>`;
}

/* ── Mini monthly calendar (current month) ── */
function buildMiniMonthCalendar(challenge, entries) {
    const entryByDate = new Map();
    entries.forEach((e) => entryByDate.set(e.entry_date, e));

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const todayDateStr = `${year}-${pad2(month + 1)}-${pad2(today.getDate())}`;

    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

    let cellsHtml = '';
    for (let cell = 0; cell < totalCells; cell++) {
        const dayNum = cell - firstWeekday + 1;

        if (dayNum < 1 || dayNum > daysInMonth) {
            cellsHtml += `<span class="mini-cal-cell mini-cal-cell-pad"></span>`;
            continue;
        }

        const dateStr = `${year}-${pad2(month + 1)}-${pad2(dayNum)}`;
        const status = dayStatus(challenge, dateStr, entryByDate.get(dateStr));
        let dotClass = 'cal-dot-none';
        if (status === 'hit') dotClass = 'cal-dot-hit';
        else if (status === 'miss' || status === 'missed') dotClass = 'cal-dot-miss';
        const isToday = dateStr === todayDateStr;

        cellsHtml += `
            <span class="mini-cal-cell${isToday ? ' mini-cal-cell-today' : ''}">
                <span class="mini-cal-daynum">${dayNum}</span>
                <span class="cal-dot ${dotClass}"></span>
            </span>`;
    }

    return `
        <div class="mini-cal-weekdays">
            <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
        </div>
        <div class="mini-cal-days">${cellsHtml}</div>`;
}

function renderMiniWidgets() {
    miniChartContainer.innerHTML = buildMiniChartSvg(currentChallenge, currentEntries);
    miniCalStrip.innerHTML = buildMiniMonthCalendar(currentChallenge, currentEntries);
    document.getElementById('miniCalTitle').textContent = MONTH_NAMES[new Date().getMonth()];
}

/* ── Render ── */
function render() {
    if (!currentChallenge) return;

    document.getElementById('challengeName').textContent = currentChallenge.name;
    document.getElementById('challengeStatus').textContent =
        currentChallenge.status.charAt(0).toUpperCase() + currentChallenge.status.slice(1) + ' Challenge';

    const c = computeDashboard(currentChallenge, currentEntries);

    document.getElementById('statBalance').textContent = fmtMoney(c.currentBalance);
    const deltaEl = document.getElementById('statBalanceDelta');
    if (currentEntries.length > 1) {
        deltaEl.textContent = `${fmtMoney(Math.abs(c.balanceDelta))} (${fmtPct(c.balanceDeltaPct)}) vs yesterday`;
        deltaEl.className = 'stat-foot ' + (c.balanceDelta >= 0 ? 'positive' : 'negative');
    } else {
        deltaEl.textContent = 'Starting balance';
        deltaEl.className = 'stat-foot';
    }

    document.getElementById('statTarget').textContent = fmtMoney(c.todaysTarget);
    const gapEl = document.getElementById('statTargetGap');
    gapEl.textContent = c.targetGap >= 0
        ? `${fmtMoney(c.targetGap)} ahead of target`
        : `${fmtMoney(Math.abs(c.targetGap))} behind target`;
    gapEl.className = 'stat-foot ' + (c.targetGap >= 0 ? 'positive' : 'negative');

    document.getElementById('statProgress').textContent = `${c.progressPct.toFixed(1)}%`;
    document.getElementById('statProgressBar').style.width = `${c.progressPct}%`;

    document.getElementById('statStreak').textContent = `${c.streak} day${c.streak === 1 ? '' : 's'}`;
    document.getElementById('statDays').textContent = `${c.daysCompleted}/${currentChallenge.duration_days} days`;

    const list = document.getElementById('activityList');
    if (!currentEntries.length) {
        list.innerHTML = `<li class="activity-empty">No entries yet — log today's balance to get started.</li>`;
    } else {
        const recent = [...currentEntries].reverse().slice(0, 5);
        list.innerHTML = recent.map((e, i) => {
            const idxInFull = currentEntries.length - 1 - i;
            const prev = idxInFull > 0 ? Number(currentEntries[idxInFull - 1].balance) : Number(currentChallenge.starting_balance);
            const delta = Number(e.balance) - prev;
            const deltaClass = delta >= 0 ? 'positive' : 'negative';
            return `<li class="activity-row">
                <span class="activity-date">${e.entry_date}</span>
                <span class="activity-balance">${fmtMoney(e.balance)}</span>
                <span class="activity-delta ${deltaClass}">${delta >= 0 ? '+' : ''}${fmtMoney(delta)}</span>
            </li>`;
        }).join('');
    }

    showState('dashboard');
    renderMiniWidgets();
}

/* ── Data loading ── */
async function loadDashboard() {
    const { data: challenges, error: chErr } = await supabaseClient
        .from('challenges')
        .select('*')
        .eq('user_id', currentUser.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1);

    if (chErr) { console.error(chErr); showState('empty'); return; }

    if (!challenges || !challenges.length) {
        currentChallenge = null;
        showState('empty');
        return;
    }

    currentChallenge = challenges[0];

    const { data: entries, error: enErr } = await supabaseClient
        .from('daily_entries')
        .select('*')
        .eq('challenge_id', currentChallenge.id)
        .order('entry_date', { ascending: true });

    if (enErr) { console.error(enErr); showState('empty'); return; }
    currentEntries = entries || [];

    render();
}

/* ── Create challenge ── */
createSubmitBtn.addEventListener('click', async () => {
    createError.textContent = '';
    const name = cName.value.trim();
    const balance = parseFloat(cBalance.value);
    const target = parseFloat(cTarget.value);
    const duration = parseInt(cDuration.value, 10);

    if (!name || !(balance > 0) || !(target > 0) || !(duration > 0)) {
        createError.textContent = 'Fill in every field with a valid value.';
        return;
    }

    createSubmitBtn.disabled = true;
    try {
        const { data, error } = await supabaseClient
            .from('challenges')
            .insert({
                user_id: currentUser.id,
                name,
                starting_balance: balance,
                daily_target_percent: target,
                duration_days: duration,
                start_date: todayStr(),
                status: 'active'
            })
            .select()
            .single();

        if (error) { createError.textContent = error.message; return; }

        currentChallenge = data;
        currentEntries = [];
        window.toggleCreate();
        render();
    } catch (err) {
        createError.textContent = 'Something went wrong. Please try again.';
    } finally {
        createSubmitBtn.disabled = false;
    }
});

/* ── Log today's balance ── */
logSubmitBtn.addEventListener('click', async () => {
    logError.textContent = '';
    const balance = parseFloat(lBalance.value);
    if (!(balance >= 0)) {
        logError.textContent = 'Enter a valid balance.';
        return;
    }

    // Guard against silently overwriting an already-logged entry for today.
    const existing = currentEntries.find(e => e.entry_date === todayStr());
    if (existing) {
        const ok = await showConfirm({
            title: "Update today's entry?",
            message: `You already logged ${fmtMoney(existing.balance)} today. This will replace it with ${fmtMoney(balance)}.`,
            confirmLabel: 'Update Entry'
        });
        if (!ok) return;
    }

    logSubmitBtn.disabled = true;
    try {
        const { data, error } = await supabaseClient
            .from('daily_entries')
            .upsert({
                challenge_id: currentChallenge.id,
                entry_date: todayStr(),
                balance,
                note: lNote.value.trim() || null
            }, { onConflict: 'challenge_id,entry_date' })
            .select()
            .single();

        if (error) { logError.textContent = error.message; return; }

        const idx = currentEntries.findIndex(e => e.entry_date === todayStr());
        if (idx >= 0) currentEntries[idx] = data; else currentEntries.push(data);

        window.toggleLog();
        render();
    } catch (err) {
        logError.textContent = 'Something went wrong. Please try again.';
    } finally {
        logSubmitBtn.disabled = false;
    }
});

/* ── Auth state drives which screen shows ── */
supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentUser = session ? session.user : null;
    if (!currentUser) {
        showState('out');
        return;
    }
    loadDashboard();
});

supabaseClient.auth.getSession().then(({ data: { session } }) => {
    currentUser = session ? session.user : null;
    if (!currentUser) {
        showState('out');
    } else {
        loadDashboard();
    }
});
