import { supabaseClient } from '../js/auth.js';

/* ── Element refs ── */
const signedOutState  = document.getElementById('signedOutState');
const emptyState      = document.getElementById('emptyState');
const dashboardState  = document.getElementById('dashboardState');

const gateSignInBtn   = document.getElementById('gateSignInBtn');
const emptyCreateBtn  = document.getElementById('emptyCreateBtn');
const logBtn          = document.getElementById('logBtn');

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
    lBalance.value = '';
    lNote.value = '';
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
function showState(name) {
    signedOutState.classList.toggle('hidden', name !== 'out');
    emptyState.classList.toggle('hidden', name !== 'empty');
    dashboardState.classList.toggle('hidden', name !== 'dashboard');
}

/* ── Formatting helpers ── */
const fmtMoney = (n) => '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct   = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

function daysBetween(a, b) {
    const MS = 24 * 60 * 60 * 1000;
    const da = new Date(a + 'T00:00:00');
    const db = new Date(b + 'T00:00:00');
    return Math.round((db - da) / MS);
}
function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

/* ── Core calculations ── */
function computeDashboard(challenge, entries) {
    const rate = challenge.daily_target_percent / 100;
    const dayNumber = entries.length; // entries already logged (day 0 = start)
    const startingBalance = Number(challenge.starting_balance);
    const currentBalance = entries.length
        ? Number(entries[entries.length - 1].balance)
        : startingBalance;
    const prevBalance = entries.length > 1
        ? Number(entries[entries.length - 2].balance)
        : startingBalance;

    const todaysTarget = startingBalance * Math.pow(1 + rate, dayNumber + 1);
    const finalTarget   = startingBalance * Math.pow(1 + rate, challenge.duration_days);

    const progressPct = finalTarget > startingBalance
        ? Math.min(100, Math.max(0, ((currentBalance - startingBalance) / (finalTarget - startingBalance)) * 100))
        : 0;

    // Streak: consecutive calendar days counting back from the most recent entry
    let streak = 0;
    if (entries.length) {
        streak = 1;
        for (let i = entries.length - 1; i > 0; i--) {
            const diff = daysBetween(entries[i - 1].entry_date, entries[i].entry_date);
            if (diff === 1) streak++; else break;
        }
    }

    const daysCompleted = dayNumber;
    const daysRemaining = Math.max(0, challenge.duration_days - dayNumber);
    const balanceDelta = currentBalance - prevBalance;
    const balanceDeltaPct = prevBalance ? (balanceDelta / prevBalance) * 100 : 0;
    const targetGap = currentBalance - todaysTarget;

    return {
        currentBalance, todaysTarget, finalTarget, progressPct,
        streak, daysCompleted, daysRemaining, balanceDelta, balanceDeltaPct, targetGap
    };
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

    if (chErr) { console.error(chErr); return; }

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

    if (enErr) { console.error(enErr); return; }
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
