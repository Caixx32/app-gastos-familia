'use strict';

const STORAGE_KEY = 'gastos-familia-v1';

const DEFAULT_STATE = {
  members: ['Mamá', 'Papá'],
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
  currency: 'EUR',
  budget: null,
  expenses: [], // { id, amount, description, category, member, date: 'YYYY-MM-DD' }
};

// ---------- Estado ----------

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...structuredClone(DEFAULT_STATE), ...JSON.parse(raw) };
  } catch (err) {
    console.error('No se pudieron leer los datos guardados', err);
  }
  return structuredClone(DEFAULT_STATE);
}

let state = loadState();

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const today = new Date();
let currentMonth = { year: today.getFullYear(), month: today.getMonth() }; // month: 0-11

// ---------- Utilidades ----------

const $ = (sel) => document.querySelector(sel);

function formatMoney(value) {
  return new Intl.NumberFormat('es', { style: 'currency', currency: state.currency }).format(value);
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

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
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
      : `Te pasaste ${formatMoney(-remaining)} del presupuesto (${formatMoney(state.budget)})`;
  } else {
    fill.style.width = '0';
    $('#budget-label').textContent = 'Sin presupuesto (configúralo en Ajustes)';
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
  $('#presupuesto').value = state.budget ?? '';
}

function renderSelects() {
  const memberOpts = state.members.map((m) => ({ value: m, label: m }));
  const catOpts = state.categories.map((c) => ({ value: c.name, label: `${c.emoji} ${c.name}` }));
  fillSelect($('#filtro-persona'), memberOpts, { allLabel: 'Todas las personas' });
  fillSelect($('#filtro-categoria'), catOpts, { allLabel: 'Todas las categorías' });
  fillSelect($('#g-persona'), memberOpts);
  fillSelect($('#g-categoria'), catOpts);
}

function render() {
  renderMonthLabel();
  renderSelects();
  renderSummary();
  renderExpenses();
  renderSettings();
}

// ---------- Acciones ----------

function removeMember(name) {
  if (state.members.length <= 1) return alert('Tiene que haber al menos una persona.');
  const used = state.expenses.some((e) => e.member === name);
  if (used && !confirm(`${name} tiene gastos registrados. Se mantendrán en el historial. ¿Quitar igualmente?`)) return;
  state.members = state.members.filter((m) => m !== name);
  save();
  render();
}

function removeCategory(name) {
  if (state.categories.length <= 1) return alert('Tiene que haber al menos una categoría.');
  const used = state.expenses.some((e) => e.category === name);
  if (used && !confirm(`Hay gastos en "${name}". Se mantendrán en el historial. ¿Quitar igualmente?`)) return;
  state.categories = state.categories.filter((c) => c.name !== name);
  save();
  render();
}

let editingId = null;

function openExpenseDialog(expense = null) {
  editingId = expense?.id ?? null;
  $('#dialogo-titulo').textContent = expense ? 'Editar gasto' : 'Nuevo gasto';
  $('#g-borrar').hidden = !expense;

  // Si el gasto usa una persona/categoría ya eliminada, se añade temporalmente al desplegable.
  renderSelects();
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
    const idx = state.expenses.findIndex((e) => e.id === editingId);
    if (idx >= 0) state.expenses[idx] = { ...state.expenses[idx], ...data };
  } else {
    state.expenses.push({ id: newId(), createdAt: Date.now(), ...data });
  }
  localStorage.setItem(`${STORAGE_KEY}-last-member`, data.member);
  save();

  // Muestra el mes del gasto recién guardado.
  const [y, m] = data.date.split('-').map(Number);
  currentMonth = { year: y, month: m - 1 };
  render();
});

$('#g-cancelar').addEventListener('click', () => $('#dialogo-gasto').close());

$('#g-borrar').addEventListener('click', () => {
  if (!editingId || !confirm('¿Borrar este gasto?')) return;
  state.expenses = state.expenses.filter((e) => e.id !== editingId);
  save();
  $('#dialogo-gasto').close();
  render();
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
  state.members.push(name);
  $('#nueva-persona').value = '';
  save();
  render();
});

$('#form-categoria').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const name = $('#nueva-categoria').value.trim();
  const emoji = $('#nueva-categoria-emoji').value.trim() || '📦';
  if (!name) return;
  if (state.categories.some((c) => c.name === name)) return alert('Esa categoría ya existe.');
  state.categories.push({ name, emoji });
  $('#nueva-categoria').value = '';
  $('#nueva-categoria-emoji').value = '';
  save();
  render();
});

$('#moneda').addEventListener('change', (ev) => {
  state.currency = ev.target.value;
  save();
  render();
});

$('#presupuesto').addEventListener('change', (ev) => {
  const value = parseFloat(ev.target.value);
  state.budget = value > 0 ? value : null;
  save();
  render();
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
  download(`gastos-familia-${isoDate(new Date())}.json`, JSON.stringify(state, null, 2), 'application/json');
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
    if (!Array.isArray(data.expenses) || !Array.isArray(data.members) || !Array.isArray(data.categories)) {
      throw new Error('Formato no válido');
    }
    if (!confirm(`Se reemplazarán los datos actuales por ${data.expenses.length} gastos importados. ¿Continuar?`)) return;
    state = { ...structuredClone(DEFAULT_STATE), ...data };
    save();
    render();
    alert('Datos importados correctamente.');
  } catch (err) {
    alert(`No se pudo importar el archivo: ${err.message}`);
  }
});

// ---------- Inicio ----------

render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker no registrado', err));
}
