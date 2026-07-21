import { supabaseClient } from '../js/auth.js';
import { fmtMoney, finalTarget, escapeHtml, todayStr, makeStateSwitcher, fetchUserChallenges, showConfirm, initSidebarToggle } from './shared.js';

initSidebarToggle();

const loadingState   = document.getElementById('loadingState');
const signedOutState = document.getElementById('signedOutState');
const managedState    = document.getElementById('managedState');
const gateSignInBtn   = document.getElementById('gateSignInBtn');
const newChallengeBtn = document.getElementById('newChallengeBtn');
const challengeList   = document.getElementById('challengeList');
const filterRow       = document.getElementById('filterRow');

const formPopup      = document.getElementById('formPopup');
const formTitle      = document.getElementById('formTitle');
const fName           = document.getElementById('fName');
const fBalance        = document.getElementById('fBalance');
const fTarget         = document.getElementById('fTarget');
const fDuration       = document.getElementById('fDuration');
const formError       = document.getElementById('formError');
const formSubmitBtn   = document.getElementById('formSubmitBtn');

let currentUser = null;
let challenges = [];
let activeFilter = 'all';
let editingId = null; // null = creating, otherwise editing this challenge's id

/* ── Modal open/close ── */
function openForm(mode, challenge) {
    editingId = mode === 'edit' ? challenge.id : null;
    formError.textContent = '';
    if (mode === 'edit') {
        formTitle.textContent = 'Edit Challenge';
        formSubmitBtn.textContent = 'Save Changes';
        fName.value = challenge.name;
        fBalance.value = challenge.starting_balance;
        fTarget.value = challenge.daily_target_percent;
        fDuration.value = challenge.duration_days;
    } else {
        formTitle.textContent = 'Start a Challenge';
        formSubmitBtn.textContent = 'Create Challenge';
        fName.value = '';
        fBalance.value = '';
        fTarget.value = '';
        fDuration.value = '';
    }
    formPopup.classList.add('active');
    document.body.style.overflow = 'hidden';
}
window.toggleForm = function () {
    const opening = !formPopup.classList.contains('active');
    formPopup.classList.toggle('active');
    document.body.style.overflow = opening ? 'hidden' : '';
    if (!opening) editingId = null;
};
window.handleFormOverlayClick = (e) => { if (e.target === e.currentTarget) window.toggleForm(); };

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && formPopup.classList.contains('active')) window.toggleForm();
});

gateSignInBtn.addEventListener('click', () => window.toggleAuth());
newChallengeBtn.addEventListener('click', () => openForm('create'));

/* ── Filters ── */
filterRow.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-chip');
    if (!btn) return;
    activeFilter = btn.dataset.filter;
    [...filterRow.children].forEach(b => b.classList.toggle('active', b === btn));
    renderList();
});

/* ── View switching ── */
const showState = makeStateSwitcher({
    loading: loadingState,
    out: signedOutState,
    managed: managedState
});

/* ── Render ── */
function renderList() {
    const filtered = activeFilter === 'all'
        ? challenges
        : challenges.filter(c => c.status === activeFilter);

    if (!filtered.length) {
        challengeList.innerHTML = `<li class="activity-empty">No ${activeFilter === 'all' ? '' : activeFilter + ' '}challenges yet.</li>`;
        return;
    }

    challengeList.innerHTML = filtered.map(c => {
        const finalTargetVal = finalTarget(c);
        const actions = [];

        if (c.status === 'active') {
            actions.push(`<button class="chip-btn" data-action="pause" data-id="${c.id}">Pause</button>`);
            actions.push(`<button class="chip-btn" data-action="complete" data-id="${c.id}">Mark Complete</button>`);
        } else if (c.status === 'paused') {
            actions.push(`<button class="chip-btn" data-action="resume" data-id="${c.id}">Resume</button>`);
        }
        if (c.status !== 'archived') {
            actions.push(`<button class="chip-btn" data-action="archive" data-id="${c.id}">Archive</button>`);
        }
        actions.push(`<button class="chip-btn" data-action="duplicate" data-id="${c.id}">Duplicate</button>`);
        actions.push(`<button class="chip-btn" data-action="edit" data-id="${c.id}">Edit</button>`);
        actions.push(`<button class="chip-btn danger" data-action="delete" data-id="${c.id}">Delete</button>`);

        return `
        <li class="challenge-card">
            <div class="challenge-info">
                <div class="challenge-name-row">
                    <span class="challenge-name">${escapeHtml(c.name)}</span>
                    <span class="status-badge ${c.status}">${c.status}</span>
                </div>
                <div class="challenge-meta">
                    <span>${fmtMoney(c.starting_balance)} → ${fmtMoney(finalTargetVal)}</span>
                    <span>${c.daily_target_percent}%/day</span>
                    <span>${c.duration_days} days</span>
                    <span>Started ${c.start_date}</span>
                </div>
            </div>
            <div class="challenge-actions">${actions.join('')}</div>
        </li>`;
    }).join('');
}

/* ── Load ── */
async function loadChallenges() {
    try {
        challenges = await fetchUserChallenges(supabaseClient, currentUser.id);
    } catch (error) {
        console.error(error);
        // Surface the failure instead of leaving the loading spinner stuck forever.
        showState('managed');
        challengeList.innerHTML = `<li class="activity-empty">Couldn't load your challenges. Please refresh and try again.</li>`;
        return;
    }
    renderList();
    showState('managed');
}

/* ── Create / Edit submit ── */
formSubmitBtn.addEventListener('click', async () => {
    formError.textContent = '';
    const name = fName.value.trim();
    const balance = parseFloat(fBalance.value);
    const target = parseFloat(fTarget.value);
    const duration = parseInt(fDuration.value, 10);

    if (!name || !(balance > 0) || !(target > 0) || !(duration > 0)) {
        formError.textContent = 'Fill in every field with a valid value.';
        return;
    }

    formSubmitBtn.disabled = true;
    try {
        if (editingId) {
            const { error } = await supabaseClient
                .from('challenges')
                .update({
                    name,
                    starting_balance: balance,
                    daily_target_percent: target,
                    duration_days: duration
                })
                .eq('id', editingId);
            if (error) { formError.textContent = error.message; return; }
        } else {
            const { error } = await supabaseClient
                .from('challenges')
                .insert({
                    user_id: currentUser.id,
                    name,
                    starting_balance: balance,
                    daily_target_percent: target,
                    duration_days: duration,
                    start_date: todayStr(),
                    status: 'active'
                });
            if (error) { formError.textContent = error.message; return; }
        }
        window.toggleForm();
        await loadChallenges();
    } catch (err) {
        formError.textContent = 'Something went wrong. Please try again.';
    } finally {
        formSubmitBtn.disabled = false;
    }
});

/* ── Card actions ── */
challengeList.addEventListener('click', async (e) => {
    const btn = e.target.closest('.chip-btn');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const challenge = challenges.find(c => c.id === id);
    if (!challenge) return;

    if (action === 'edit') {
        openForm('edit', challenge);
        return;
    }

    if (action === 'delete') {
        const ok = await showConfirm({
            title: 'Delete this challenge?',
            message: `Deleting "${escapeHtml(challenge.name)}" will also permanently delete all of its logged entries. This cannot be undone.`,
            confirmLabel: 'Delete Challenge',
            danger: true
        });
        if (!ok) return;
        const { error } = await supabaseClient.from('challenges').delete().eq('id', id);
        if (error) { alert(error.message); return; }
        await loadChallenges();
        return;
    }

    if (action === 'duplicate') {
        const { error } = await supabaseClient.from('challenges').insert({
            user_id: currentUser.id,
            name: `${challenge.name} (Copy)`,
            starting_balance: challenge.starting_balance,
            daily_target_percent: challenge.daily_target_percent,
            duration_days: challenge.duration_days,
            start_date: todayStr(),
            status: 'active'
        });
        if (error) { alert(error.message); return; }
        await loadChallenges();
        return;
    }

    const statusMap = { pause: 'paused', resume: 'active', complete: 'completed', archive: 'archived' };
    if (statusMap[action]) {
        const { error } = await supabaseClient
            .from('challenges')
            .update({ status: statusMap[action] })
            .eq('id', id);
        if (error) { alert(error.message); return; }
        await loadChallenges();
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
