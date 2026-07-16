import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

export const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const authPopup      = document.getElementById('authPopup');
const authTabs       = document.getElementById('authTabs');
const authEmail      = document.getElementById('authEmail');
const authPassword   = document.getElementById('authPassword');
const authError      = document.getElementById('authError');
const authSubmitBtn  = document.getElementById('authSubmitBtn');
const googleBtn      = document.getElementById('googleBtn');
const signInBtn      = document.getElementById('signInBtn');
const signOutBtn     = document.getElementById('signOutBtn');
const signedInIndicator = document.getElementById('signedInIndicator');
const signedInEmail      = document.getElementById('signedInEmail');

let authTab = 'signin';

/* ── Modal open/close (matches the Donate QR popup pattern) ── */
window.toggleAuth = function () {
    const opening = !authPopup.classList.contains('active');
    authPopup.classList.toggle('active');
    document.body.style.overflow = opening ? 'hidden' : '';
    if (opening) authError.textContent = '';
};

window.handleAuthOverlayClick = function (e) {
    if (e.target === e.currentTarget) window.toggleAuth();
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && authPopup.classList.contains('active')) window.toggleAuth();
});

signInBtn.addEventListener('click', () => window.toggleAuth());

/* ── Tabs ── */
authTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.mode-btn');
    if (!btn) return;
    authTab = btn.dataset.tab;
    [...authTabs.children].forEach(b => b.classList.toggle('active', b === btn));
    authSubmitBtn.textContent = authTab === 'signin' ? 'Sign In' : 'Sign Up';
    authError.textContent = '';
});

/* ── Email/password ── */
authSubmitBtn.addEventListener('click', async () => {
    authError.textContent = '';
    const email = authEmail.value.trim();
    const password = authPassword.value;
    if (!email || !password) {
        authError.textContent = 'Enter both email and password.';
        return;
    }
    authSubmitBtn.disabled = true;
    try {
        const { error } = authTab === 'signin'
            ? await supabaseClient.auth.signInWithPassword({ email, password })
            : await supabaseClient.auth.signUp({ email, password });
        if (error) {
            authError.textContent = error.message;
        } else if (authTab === 'signup') {
            authError.textContent = 'Check your email to confirm your account, then sign in.';
        } else {
            window.toggleAuth();
        }
    } catch (err) {
        authError.textContent = 'Something went wrong. Please try again.';
    } finally {
        authSubmitBtn.disabled = false;
    }
});

/* ── Google ── */
googleBtn.addEventListener('click', () => {
    supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.href }
    });
});

/* ── Sign out ── */
signOutBtn.addEventListener('click', () => supabaseClient.auth.signOut());

/* ── Nav reflects auth state on every page load and change ── */
supabaseClient.auth.onAuthStateChange((_event, session) => {
    const user = session ? session.user : null;
    signInBtn.classList.toggle('hidden', !!user);
    signOutBtn.classList.toggle('hidden', !user);
    signedInIndicator.classList.toggle('hidden', !user);
    signedInEmail.textContent = user ? user.email : '';
});