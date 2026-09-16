const SUPABASE_URL = 'https://egghqvhnyqtligxvzzhi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnZ2hxdmhueXF0bGlneHZ6emhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0OTkxODIsImV4cCI6MjEwNTA3NTE4Mn0.IewBEqUWIHxqIYmxWjY-MjrPhLxa0LWPkUVtfoggRlg';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
const authListeners = [];

function onAuthChange(fn) {
  authListeners.push(fn);
}

function notifyAuthListeners() {
  authListeners.forEach(fn => fn(currentUser));
}

// Not called automatically here — Supabase can resolve getSession() and fire
// its INITIAL_SESSION event faster (via microtasks) than the browser finishes
// loading the later <script> tags that register onAuthChange listeners
// (favorites.js, common.js, the page script). Calling initAuth() too early
// would silently drop that first notification. Instead, the last script
// loaded on each page calls initAuth() once every listener is registered.
async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  currentUser = session ? session.user : null;
  notifyAuthListeners();

  sb.auth.onAuthStateChange((_event, session) => {
    currentUser = session ? session.user : null;
    notifyAuthListeners();
  });
}

async function signInWithGoogle() {
  await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
}

async function signInWithEmail(email) {
  return sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname }
  });
}

async function signOut() {
  await sb.auth.signOut();
}
