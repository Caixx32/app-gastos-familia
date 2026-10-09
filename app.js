import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, connectAuthEmulator, onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, connectFirestoreEmulator, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, onSnapshot, setDoc, deleteDoc, writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig, FAMILIA } from './firebase-config.js';

const STORAGE_KEY = 'gastos-familia-v1';

const DEFAULT_SETTINGS = {
  members: ['Persona 1', 'Persona 2'],
  categories: [
    { name: 'Supermercado', emoji: '🛒' },
    { name: 'Casa', emoji: '🏠' },
    { name: 'Servicios', emoji: '💡' },
    { name: 'Transporte', emoji: '🚗' },
    { name: 'Salud', emoji: '💊' },
    { name: 'Educación', emoji: '📚' },
    { name: 'Ocio', emoji: '🎉' },
    { name: 'Restaurantes', emoji: '🍽️' },
    { name: 'Ropa', emoji: '👕' },
    { name: 'Otros', emoji: '📦' },
  ],
  currency: 'ARS',
  budget: null,
};

// ---------- Estado ----------
// Los ajustes viven en el documento familias/{FAMILIA} y cada gasto en familias/{FAMILIA}/gastos/{id}.
// Ambos se escuchan en tiempo real, así que lo que carga uno aparece enseguida en el otro celular.

const state = {
  ...structuredClone(DEFAULT_SETTINGS),
  expenses: [], // { id, amount, description, category, member, date: 'YYYY-MM-DD', createdAt, createdBy }
};

const today = new Date();
let currentMonth = { year: today.getFullYear(), month: today.getMonth() }; // month: 0-11

let auth = null;
let db = null;
let familyRef = null;
let expensesRef = null;
let unsubscribers = [];

// ---------- Utilidades ----------

const $ = (sel) => document.querySelector(sel);

// Formato local de cada moneda, para que se vea "$ 15.000" y no "15.000,00 ARS".
const CURRENCY_LOCALES = {
  ARS: 'es-AR', UYU: 'es-UY', CLP: 'es-CL', MXN: 'es-MX', COP: 'es-CO', PEN: 'es-PE', USD: 'es-US', EUR: 'es-ES',
};

function formatMoney(value) {
  const digits = Number.isInteger(Math.round(value * 100) / 100) ? 0 : 2;
  return new Intl.NumberFormat(CURRENCY_LOCALES[state.currency] || 'es', {
    style: 'currency',
    currency: state.currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: 'always',
  }).format(value);
}

function isoDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthKey({ year, month }) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function categoryEmoji(name) {
  return state.categories.find((c) => c.name === name)?.emoji || '📦';
}

function expensesOfMonth() {
  const key = monthKey(currentMonth);
  return state.expenses.filter((e) => e.date.startsWith(key));
}

function sumBy(list, field) {
  const totals = new Map();
  for (const e of list) totals.set(e[field], (totals.get(e[field]) || 0) + e.amount);
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const child of children) node.append(child);
  return node;
}

function fillSelect(select, options, { allLabel } = {}) {
  const previous = select.value;
  select.replaceChildren();
  if (allLabel) select.append(el('option', { value: '', textContent: allLabel }));
  for (const opt of options) select.append(el('option', { value: opt.value, textContent: opt.label }));
  if ([...select.options].some((o) => o.value === previous)) select.value = previous;
}

// Las escrituras se aplican al instante en pantalla y Firestore las sube cuando hay conexión,
// así que no se esperan; solo se avisa si el servidor las rechaza.
function write(promise) {
  promise.catch((err) => {
    console.error(err);
    alert(`No se pudo guardar el cambio: ${err.message}`);
  });
}

function saveSettings(changes) {
  write(setDoc(familyRef, changes, { merge: true }));
}

// ---------- Pantallas ----------

function showScreen(name) {
  document.body.dataset.screen = name; // 'config' | 'login' | 'app'
}

function setSyncStatus(text, kind) {
  const node = $('#sync-status');
  node.textContent = text;
  node.dataset.kind = kind;
}

let pendingWrites = false;
let fromCache = true;

function updateSyncStatus() {
  if (!navigator.onLine) setSyncStatus(pendingWrites ? 'Sin conexión · se sube al volver' : 'Sin conexión', 'offline');
  else if (pendingWrites) setSyncStatus('Subiendo…', 'pending');
  else if (fromCache) setSyncStatus('Conectando…', 'pending');
  else setSyncStatus('Sincronizado', 'ok');
}

window.addEventListener('online', updateSyncStatus);
window.addEventListener('offline', updateSyncStatus);

// ---------- Render ----------

function renderMonthLabel() {
  const date = new Date(currentMonth.year, currentMonth.month, 1);
  $('#month-label').textContent = capitalize(date.toLocaleDateString('es', { month: 'long', year: 'numeric' }));
}

function renderBreakdown(list, rows, labelFor) {
  list.replaceChildren();
  if (rows.length === 0) {
    list.append(el('li', {}, el('span', { className: 'empty-row', textContent: 'Sin gastos todavía' })));
    return;
  }
  const max = rows[0][1];
  for (const [key, amount] of rows) {
    const fill = el('div', { className: 'bar-fill' });
    fill.style.width = `${(amount / max) * 100}%`;
    list.append(el('li', {},
      el('span', { textContent: labelFor(key) }),
      el('span', { className: 'amount', textContent: formatMoney(amount) }),
      el('div', { className: 'bar' }, fill),
    ));
  }
}

function renderSummary() {
  const list = expensesOfMonth();
  const total = list.reduce((acc, e) => acc + e.amount, 0);
  $('#total-mes').textContent = formatMoney(total);

  const fill = $('#budget-fill');
  fill.classList.remove('warn', 'over');
  if (state.budget) {
    const pct = (total / state.budget) * 100;
    fill.style.width = `${Math.min(pct, 100)}%`;
    if (pct >= 100) fill.classList.add('over');
    else if (pct >= 80) fill.classList.add('warn');
    const remaining = state.budget - total;
    $('#budget-label').textContent = remaining >= 0
      ? `Quedan ${formatMoney(remaining)} de ${formatMoney(state.budget)}`
      : `Se pasaron ${formatMoney(-remaining)} del presupuesto (${formatMoney(state.budget)})`;
  } else {
    fill.style.width = '0';
    $('#budget-label').textContent = 'Sin presupuesto (configuralo en Ajustes)';
  }

  renderBreakdown($('#por-categoria'), sumBy(list, 'category'), (c) => `${categoryEmoji(c)} ${c}`);
  renderBreakdown($('#por-persona'), sumBy(list, 'member'), (m) => m);
}

function renderExpenses() {
  const member = $('#filtro-persona').value;
  const category = $('#filtro-categoria').value;
  const text = $('#filtro-texto').value.trim().toLowerCase();

  const list = expensesOfMonth()
    .filter((e) => !member || e.member === member)
    .filter((e) => !category || e.category === category)
    .filter((e) => !text || (e.description || '').toLowerCase().includes(text) || e.category.toLowerCase().includes(text))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));

  const ul = $('#lista-gastos');
  ul.replaceChildren();
  $('#lista-vacia').hidden = list.length > 0;

  let lastDate = null;
  for (const e of list) {
    if (e.date !== lastDate) {
      lastDate = e.date;
      const [y, m, d] = e.date.split('-').map(Number);
      const label = new Date(y, m - 1, d).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
      ul.append(el('li', { className: 'day-header', textContent: capitalize(label) }));
    }
    const button = el('button', { type: 'button', className: 'expense' },
      el('span', { className: 'icon', textContent: categoryEmoji(e.category) }),
      el('span', { className: 'info' },
        el('div', { className: 'title', textContent: e.description || e.category }),
        el('div', { className: 'meta', textContent: `${e.category} · ${e.member}` }),
      ),
      el('span', { className: 'amount', textContent: formatMoney(e.amount) }),
    );
    button.addEventListener('click', () => openExpenseDialog(e));
    ul.append(el('li', {}, button));
  }
}

function renderSettings() {
  const members = $('#lista-personas');
  members.replaceChildren();
  for (const name of state.members) {
    const remove = el('button', { type: 'button', textContent: '✕', title: `Quitar ${name}` });
    remove.addEventListener('click', () => removeMember(name));
    members.append(el('li', {}, el('span', { textContent: name }), remove));
  }

  const cats = $('#lista-categorias');
  cats.replaceChildren();
  for (const cat of state.categories) {
    const remove = el('button', { type: 'button', textContent: '✕', title: `Quitar ${cat.name}` });
    remove.addEventListener('click', () => removeCategory(cat.name));
    cats.append(el('li', {}, el('span', { textContent: `${cat.emoji} ${cat.name}` }), remove));
  }

  $('#moneda').value = state.currency;
  if (document.activeElement !== $('#presupuesto')) $('#presupuesto').value = state.budget ?? '';
  $('#cuenta-email').textContent = auth?.currentUser?.email ?? '';
}

function renderSelects() {
  const memberOpts = state.members.map((m) => ({ value: m, label: m }));
  const catOpts = state.categories.map((c) => ({ value: c.name, label: `${c.emoji} ${c.name}` }));
  fillSelect($('#filtro-persona'), memberOpts, { allLabel: 'Todas las personas' });
  fillSelect($('#filtro-categoria'), catOpts, { allLabel: 'Todas las categorías' });
  // Los desplegables del formulario se rellenan al abrirlo para no pisar lo que se está escribiendo.
  if (!$('#dialogo-gasto').open) {
    fillSelect($('#g-persona'), memberOpts);
    fillSelect($('#g-categoria'), catOpts);
  }
}

function render() {
  renderMonthLabel();
  renderSelects();
  renderSummary();
  renderExpenses();
  renderSettings();
}

// ---------- Sincronización ----------

function startSync(user) {
  stopSync();
  let settingsLoaded = false;

  unsubscribers.push(onSnapshot(familyRef, { includeMetadataChanges: true }, (snap) => {
    if (snap.exists()) {
      Object.assign(state, structuredClone(DEFAULT_SETTINGS), snap.data());
    } else if (!snap.metadata.fromCache) {
      // Primera vez que alguien entra: se crea el libro con los ajustes por defecto.
      write(setDoc(familyRef, DEFAULT_SETTINGS));
    }
    if (!snap.metadata.fromCache && !settingsLoaded) {
      settingsLoaded = true;
      offerLocalMigration(user);
    }
    render();
  }, onSyncError));

  unsubscribers.push(onSnapshot(expensesRef, { includeMetadataChanges: true }, (snap) => {
    state.expenses = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    pendingWrites = snap.metadata.hasPendingWrites;
    fromCache = snap.metadata.fromCache;
    updateSyncStatus();
    render();
  }, onSyncError));
}

function stopSync() {
  for (const unsubscribe of unsubscribers) unsubscribe();
  unsubscribers = [];
  state.expenses = [];
}

function onSyncError(err) {
  console.error(err);
  if (err.code === 'permission-denied') {
    setSyncStatus('Sin permiso', 'offline');
    alert(`La cuenta ${auth.currentUser?.email} no tiene permiso para ver los gastos. Revisá los correos en las reglas de Firestore (ver README).`);
  } else {
    setSyncStatus('Error de conexión', 'offline');
  }
}

// La versión anterior guardaba todo solo en el celular. Si quedan gastos de esa época, se ofrece subirlos.
function offerLocalMigration(user) {
  const flag = `${STORAGE_KEY}-subido-${user.uid}`;
  if (localStorage.getItem(flag)) return;
  let local;
  try {
    local = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    local = null;
  }
  const expenses = Array.isArray(local?.expenses) ? local.expenses : [];
  if (expenses.length === 0) return;
  if (confirm(`Hay ${expenses.length} gastos guardados solo en este celular. ¿Subirlos al libro compartido?`)) {
    importExpenses(expenses);
  }
  localStorage.setItem(flag, '1');
}

function expenseData(e) {
  return {
    amount: Number(e.amount),
    description: String(e.description ?? ''),
    category: String(e.category),
    member: String(e.member),
    date: String(e.date),
    createdAt: Number(e.createdAt) || Date.now(),
    createdBy: e.createdBy ?? auth.currentUser?.email ?? null,
  };
}

// Sube gastos conservando su id, así importar dos veces el mismo archivo no los duplica.
function importExpenses(expenses) {
  for (let i = 0; i < expenses.length; i += 400) {
    const batch = writeBatch(db);
    for (const e of expenses.slice(i, i + 400)) {
      const ref = e.id ? doc(expensesRef, String(e.id)) : doc(expensesRef);
      batch.set(ref, expenseData(e));
    }
    write(batch.commit());
  }
}

// ---------- Acciones ----------

function removeMember(name) {
  if (state.members.length <= 1) return alert('Tiene que haber al menos una persona.');
  const used = state.expenses.some((e) => e.member === name);
  if (used && !confirm(`${name} tiene gastos registrados. Se mantienen en el historial. ¿Quitar igualmente?`)) return;
  saveSettings({ members: state.members.filter((m) => m !== name) });
}

function removeCategory(name) {
  if (state.categories.length <= 1) return alert('Tiene que haber al menos una categoría.');
  const used = state.expenses.some((e) => e.category === name);
  if (used && !confirm(`Hay gastos en "${name}". Se mantienen en el historial. ¿Quitar igualmente?`)) return;
  saveSettings({ categories: state.categories.filter((c) => c.name !== name) });
}

let editingId = null;

function openExpenseDialog(expense = null) {
  editingId = expense?.id ?? null;
  $('#dialogo-titulo').textContent = expense ? 'Editar gasto' : 'Nuevo gasto';
  $('#g-borrar').hidden = !expense;

  fillSelect($('#g-persona'), state.members.map((m) => ({ value: m, label: m })));
  fillSelect($('#g-categoria'), state.categories.map((c) => ({ value: c.name, label: `${c.emoji} ${c.name}` })));
  // Si el gasto usa una persona/categoría ya eliminada, se añade temporalmente al desplegable.
  for (const [select, value] of [[$('#g-persona'), expense?.member], [$('#g-categoria'), expense?.category]]) {
    if (value && ![...select.options].some((o) => o.value === value)) {
      select.append(el('option', { value, textContent: value }));
    }
  }

  $('#g-importe').value = expense?.amount ?? '';
  $('#g-descripcion').value = expense?.description ?? '';
  $('#g-categoria').value = expense?.category ?? state.categories[0].name;
  $('#g-persona').value = expense?.member ?? (localStorage.getItem(`${STORAGE_KEY}-last-member`) || state.members[0]);
  if (!$('#g-persona').value) $('#g-persona').value = state.members[0];

  if (expense) {
    $('#g-fecha').value = expense.date;
  } else {
    const isCurrentMonth = currentMonth.year === today.getFullYear() && currentMonth.month === today.getMonth();
    $('#g-fecha').value = isCurrentMonth ? isoDate(today) : isoDate(new Date(currentMonth.year, currentMonth.month, 1));
  }

  $('#dialogo-gasto').showModal();
}

$('#form-gasto').addEventListener('submit', (ev) => {
  const amount = Math.round(parseFloat($('#g-importe').value) * 100) / 100;
  if (!(amount > 0)) {
    ev.preventDefault();
    return;
  }
  const data = {
    amount,
    description: $('#g-descripcion').value.trim(),
    category: $('#g-categoria').value,
    member: $('#g-persona').value,
    date: $('#g-fecha').value,
  };
  if (editingId) {
    write(setDoc(doc(expensesRef, editingId), data, { merge: true }));
  } else {
    write(setDoc(doc(expensesRef), { ...data, createdAt: Date.now(), createdBy: auth.currentUser.email }));
  }
  localStorage.setItem(`${STORAGE_KEY}-last-member`, data.member);

  // Muestra el mes del gasto recién guardado.
  const [y, m] = data.date.split('-').map(Number);
  currentMonth = { year: y, month: m - 1 };
  render();
});

$('#g-cancelar').addEventListener('click', () => $('#dialogo-gasto').close());

$('#g-borrar').addEventListener('click', () => {
  if (!editingId || !confirm('¿Borrar este gasto?')) return;
  write(deleteDoc(doc(expensesRef, editingId)));
  $('#dialogo-gasto').close();
});

$('#nuevo-gasto').addEventListener('click', () => openExpenseDialog());

$('#prev-month').addEventListener('click', () => {
  const d = new Date(currentMonth.year, currentMonth.month - 1, 1);
  currentMonth = { year: d.getFullYear(), month: d.getMonth() };
  render();
});

$('#next-month').addEventListener('click', () => {
  const d = new Date(currentMonth.year, currentMonth.month + 1, 1);
  currentMonth = { year: d.getFullYear(), month: d.getMonth() };
  render();
});

for (const id of ['#filtro-persona', '#filtro-categoria', '#filtro-texto']) {
  $(id).addEventListener('input', renderExpenses);
}

document.querySelectorAll('.tabbar button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${btn.dataset.view}`));
    window.scrollTo(0, 0);
  });
});

$('#form-persona').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const name = $('#nueva-persona').value.trim();
  if (!name) return;
  if (state.members.includes(name)) return alert('Esa persona ya existe.');
  saveSettings({ members: [...state.members, name] });
  $('#nueva-persona').value = '';
});

$('#form-categoria').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const name = $('#nueva-categoria').value.trim();
  const emoji = $('#nueva-categoria-emoji').value.trim() || '📦';
  if (!name) return;
  if (state.categories.some((c) => c.name === name)) return alert('Esa categoría ya existe.');
  saveSettings({ categories: [...state.categories, { name, emoji }] });
  $('#nueva-categoria').value = '';
  $('#nueva-categoria-emoji').value = '';
});

$('#moneda').addEventListener('change', (ev) => saveSettings({ currency: ev.target.value }));

$('#presupuesto').addEventListener('change', (ev) => {
  const value = parseFloat(ev.target.value);
  saveSettings({ budget: value > 0 ? value : null });
});

$('#cerrar-sesion').addEventListener('click', () => {
  if (confirm('¿Cerrar sesión en este celular?')) signOut(auth);
});

// ---------- Exportar / importar ----------

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('#exportar-json').addEventListener('click', () => {
  const { members, categories, currency, budget, expenses } = state;
  const data = { members, categories, currency, budget, expenses };
  download(`gastos-familia-${isoDate(new Date())}.json`, JSON.stringify(data, null, 2), 'application/json');
});

$('#exportar-csv').addEventListener('click', () => {
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Fecha', 'Descripción', 'Categoría', 'Persona', 'Importe']];
  for (const e of [...state.expenses].sort((a, b) => a.date.localeCompare(b.date))) {
    rows.push([e.date, e.description, e.category, e.member, String(e.amount).replace('.', ',')]);
  }
  // BOM + punto y coma para que Excel en español lo abra bien.
  const csv = '﻿' + rows.map((r) => r.map(escape).join(';')).join('\r\n');
  download(`gastos-familia-${isoDate(new Date())}.csv`, csv, 'text/csv;charset=utf-8');
});

$('#importar').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.expenses)) throw new Error('Formato no válido');
    if (!confirm(`Se van a agregar ${data.expenses.length} gastos al libro compartido (los que ya estén no se duplican). ¿Continuar?`)) return;
    importExpenses(data.expenses);
    alert('Gastos importados.');
  } catch (err) {
    alert(`No se pudo importar el archivo: ${err.message}`);
  }
});

// ---------- Inicio de sesión ----------

const AUTH_ERRORS = {
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/wrong-password': 'Correo o contraseña incorrectos.',
  'auth/user-not-found': 'Correo o contraseña incorrectos.',
  'auth/invalid-email': 'El correo no es válido.',
  'auth/user-disabled': 'Esta cuenta está deshabilitada.',
  'auth/too-many-requests': 'Demasiados intentos. Probá de nuevo en unos minutos.',
  'auth/network-request-failed': 'Sin conexión. Revisá internet e intentá de nuevo.',
};

$('#form-login').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const button = $('#form-login button[type=submit]');
  $('#login-error').textContent = '';
  button.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, $('#login-email').value.trim(), $('#login-password').value);
    $('#login-password').value = '';
  } catch (err) {
    $('#login-error').textContent = AUTH_ERRORS[err.code] || `No se pudo entrar (${err.code || err.message}).`;
  } finally {
    button.disabled = false;
  }
});

function start() {
  if (!firebaseConfig.projectId || !firebaseConfig.apiKey) {
    showScreen('config');
    return;
  }

  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });

  // Solo para pruebas en la computadora con los emuladores de Firebase: http://localhost:8000/?emulador
  if (location.hostname === 'localhost' && new URLSearchParams(location.search).has('emulador')) {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, 'localhost', 8080);
  }

  familyRef = doc(db, 'familias', FAMILIA);
  expensesRef = collection(familyRef, 'gastos');

  onAuthStateChanged(auth, (user) => {
    if (user) {
      showScreen('app');
      startSync(user);
    } else {
      stopSync();
      showScreen('login');
    }
    render();
  });
}

start();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker no registrado', err));
}
