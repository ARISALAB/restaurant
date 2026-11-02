// Δείχνει «Πίνακας διαχείρισης» στο μενού όταν ο χρήστης είναι ήδη συνδεδεμένος
// (για τις σελίδες λειτουργιών / τιμών). Δεν αλλάζει τίποτα αν δεν είναι συνδεδεμένος.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const app = initializeApp({
  apiKey: "AIzaSyCEkDMQ2Q3N886s8SyG03p6ZgzwO3N4pX4",
  authDomain: "tablereserve.gr",
  databaseURL: "https://reser-dfb9a-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "reser-dfb9a"
});

const isEl = (document.documentElement.lang || 'el').toLowerCase().startsWith('el');
const adminUrl = '/admin?lang=' + (isEl ? 'el' : 'en');
const label = isEl ? 'Πίνακας διαχείρισης' : 'Dashboard';

const css = document.createElement('style');
css.textContent = `
.nav-user{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--text,#ede8df);font-size:13px;font-weight:500;padding:5px 16px 5px 5px;border:0.5px solid var(--border2,rgba(255,255,255,.07));border-radius:40px;min-width:0}
.nav-user img,.nav-user .nu-i{width:30px;height:30px;border-radius:50%;flex-shrink:0}
.nav-user img{object-fit:cover}
.nav-user .nu-i{background:var(--accent,#2563eb);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600}
.nav-user .nu-t{min-width:0}
.nav-user .nu-n{display:block;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nav-user .nu-l{display:block;font-size:11px;color:var(--muted,#c8c4bb);font-weight:400;white-space:nowrap}
@media(max-width:600px){.nav-user{padding:3px}.nav-user .nu-t{display:none}}
`;
document.head.appendChild(css);

onAuthStateChanged(getAuth(app), user => {
  if (!user) return;
  const navR = document.querySelector('nav .nav-r');
  if (!navR || navR.querySelector('.nav-user')) return;
  const name = user.displayName || user.email || '';

  const a = document.createElement('a');
  a.className = 'nav-user';
  a.href = adminUrl;
  if (user.photoURL) {
    const img = document.createElement('img');
    img.src = user.photoURL; img.alt = ''; img.referrerPolicy = 'no-referrer';
    a.appendChild(img);
  } else {
    const i = document.createElement('span');
    i.className = 'nu-i'; i.textContent = name.charAt(0).toUpperCase();
    a.appendChild(i);
  }
  const t = document.createElement('span'); t.className = 'nu-t';
  const n = document.createElement('span'); n.className = 'nu-n'; n.textContent = name;
  const l = document.createElement('span'); l.className = 'nu-l'; l.textContent = label + ' →';
  t.append(n, l); a.appendChild(t);

  // Αντικαθιστά «Σύνδεση» + «Ξεκινήστε δωρεάν» με τον λογαριασμό του χρήστη
  navR.querySelectorAll('.nav-login, .nav-cta').forEach(el => el.style.display = 'none');
  navR.insertBefore(a, navR.querySelector('.mnav'));

  // Και στο μενού του κινητού
  document.querySelectorAll('.mnav-p a[href^="/admin"]').forEach(el => el.textContent = label);
});
