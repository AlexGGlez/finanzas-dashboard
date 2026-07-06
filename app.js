(() => {
  "use strict";

  const STORAGE_KEY = "finanzas.transactions.v1";
  const BUDGETS_KEY = "finanzas.budgets.v1";
  const CATEGORIES_KEY = "finanzas.categories.v1";

  const DEFAULT_CATEGORIES = [
    "Alimentación", "Vivienda", "Transporte", "Ocio", "Salud",
    "Educación", "Ropa", "Suscripciones", "Ahorro/Inversión", "Otros", "Nómina/Ingresos",
    "Coche", "Apuestas"
  ];

  const CATEGORY_COLORS = [
    "#6d8cff", "#3ecf8e", "#ff6b6b", "#f5c150", "#c179f2",
    "#3fc7d6", "#ff9f6b", "#8fd14f", "#f27bb0", "#9aa1ac", "#5ad1a8",
    "#e08ef7", "#4fa3e3"
  ];

  const fmt = (n) => "€" + (Number(n) || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const currentMonth = () => new Date().toISOString().slice(0, 7);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  function save(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  let transactions = load(STORAGE_KEY, []);
  let budgets = load(BUDGETS_KEY, {});
  let categories = load(CATEGORIES_KEY, DEFAULT_CATEGORIES);

  const missingDefaults = DEFAULT_CATEGORIES.filter((c) => !categories.includes(c));
  if (missingDefaults.length > 0) {
    categories = [...categories, ...missingDefaults];
    save(CATEGORIES_KEY, categories);
  }

  let categoryChart = null;
  let trendChart = null;
  let currentType = "gasto";

  // ---------- DOM refs ----------
  const $ = (id) => document.getElementById(id);
  const monthFilter = $("monthFilter");
  const searchInput = $("searchInput");
  const typeFilter = $("typeFilter");
  const categoryFilter = $("categoryFilter");

  monthFilter.value = currentMonth();

  function populateCategorySelects() {
    const selects = [$("txCategory"), categoryFilter];
    const filterPrevValue = categoryFilter.value;
    categoryFilter.innerHTML = '<option value="">Todas las categorías</option>';
    $("txCategory").innerHTML = "";
    categories.forEach((cat) => {
      const opt1 = document.createElement("option");
      opt1.value = cat; opt1.textContent = cat;
      $("txCategory").appendChild(opt1);

      const opt2 = document.createElement("option");
      opt2.value = cat; opt2.textContent = cat;
      categoryFilter.appendChild(opt2);
    });
    categoryFilter.value = filterPrevValue;
  }

  function categoryColor(cat) {
    const idx = categories.indexOf(cat);
    return CATEGORY_COLORS[idx >= 0 ? idx % CATEGORY_COLORS.length : 0];
  }

  // ---------- filtering ----------
  function getFilteredTransactions({ ignoreMonth = false } = {}) {
    const month = monthFilter.value;
    const search = searchInput.value.trim().toLowerCase();
    const type = typeFilter.value;
    const cat = categoryFilter.value;

    return transactions.filter((t) => {
      if (!ignoreMonth && month && !t.date.startsWith(month)) return false;
      if (search && !t.desc.toLowerCase().includes(search)) return false;
      if (type && t.type !== type) return false;
      if (cat && t.category !== cat) return false;
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }

  // ---------- render: cards ----------
  function renderCards() {
    const monthTx = transactions.filter((t) => t.date.startsWith(monthFilter.value));
    const income = monthTx.filter((t) => t.type === "ingreso").reduce((s, t) => s + t.amount, 0);
    const expense = monthTx.filter((t) => t.type === "gasto").reduce((s, t) => s + t.amount, 0);
    const totalBalance = transactions.reduce((s, t) => s + (t.type === "ingreso" ? t.amount : -t.amount), 0);

    $("cardBalance").textContent = fmt(totalBalance);
    $("cardIncome").textContent = fmt(income);
    $("cardExpense").textContent = fmt(expense);
    $("cardSavings").textContent = fmt(income - expense);
    $("cardSavings").style.color = (income - expense) >= 0 ? "var(--income)" : "var(--expense)";
  }

  // ---------- render: category chart ----------
  function renderCategoryChart() {
    const monthTx = transactions.filter((t) => t.date.startsWith(monthFilter.value) && t.type === "gasto");
    const byCat = {};
    monthTx.forEach((t) => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
    const labels = Object.keys(byCat);
    const data = labels.map((l) => byCat[l]);
    const colors = labels.map(categoryColor);

    $("categoryEmptyHint").classList.toggle("show", labels.length === 0);

    if (categoryChart) categoryChart.destroy();
    if (labels.length === 0) return;

    categoryChart = new Chart($("categoryChart"), {
      type: "doughnut",
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { color: "#e8eaed", boxWidth: 12, padding: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${fmt(ctx.parsed)}` } }
        }
      }
    });
  }

  // ---------- render: trend chart (last 6 months) ----------
  function renderTrendChart() {
    const months = [];
    const base = monthFilter.value ? new Date(monthFilter.value + "-01T00:00:00") : new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      months.push(d.toISOString().slice(0, 7));
    }
    const incomeData = months.map((m) => transactions.filter((t) => t.date.startsWith(m) && t.type === "ingreso").reduce((s, t) => s + t.amount, 0));
    const expenseData = months.map((m) => transactions.filter((t) => t.date.startsWith(m) && t.type === "gasto").reduce((s, t) => s + t.amount, 0));
    const labels = months.map((m) => {
      const [y, mo] = m.split("-");
      return new Date(y, mo - 1, 1).toLocaleDateString("es-ES", { month: "short", year: "2-digit" });
    });

    if (trendChart) trendChart.destroy();
    trendChart = new Chart($("trendChart"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Ingresos", data: incomeData, backgroundColor: "#3ecf8e", borderRadius: 4 },
          { label: "Gastos", data: expenseData, backgroundColor: "#ff6b6b", borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: "#9aa1ac" }, grid: { display: false } },
          y: { ticks: { color: "#9aa1ac" }, grid: { color: "#262b36" } }
        },
        plugins: {
          legend: { labels: { color: "#e8eaed" } },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } }
        }
      }
    });
  }

  // ---------- render: budgets ----------
  function renderBudgets() {
    const list = $("budgetsList");
    const monthTx = transactions.filter((t) => t.date.startsWith(monthFilter.value) && t.type === "gasto");
    const spentByCat = {};
    monthTx.forEach((t) => { spentByCat[t.category] = (spentByCat[t.category] || 0) + t.amount; });

    const activeBudgets = Object.entries(budgets).filter(([, v]) => v > 0);
    if (activeBudgets.length === 0) {
      list.innerHTML = '<p class="budgets-empty">Aún no has definido presupuestos. Pulsa "Gestionar" para fijar límites mensuales por categoría.</p>';
      return;
    }

    list.innerHTML = "";
    activeBudgets.forEach(([cat, limit]) => {
      const spent = spentByCat[cat] || 0;
      const pct = Math.min(100, (spent / limit) * 100);
      const over = spent > limit;
      const item = document.createElement("div");
      item.className = "budget-item";
      item.innerHTML = `
        <div class="budget-item-top">
          <span>${cat}</span>
          <span>${fmt(spent)} / ${fmt(limit)}</span>
        </div>
        <div class="budget-bar-track">
          <div class="budget-bar-fill ${over ? "over" : ""}" style="width:${pct}%"></div>
        </div>
      `;
      list.appendChild(item);
    });
  }

  // ---------- render: table ----------
  function renderTable() {
    const rows = getFilteredTransactions();
    const tbody = $("txTableBody");
    tbody.innerHTML = "";
    $("txEmptyHint").classList.toggle("show", rows.length === 0);

    rows.forEach((t) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${new Date(t.date + "T00:00:00").toLocaleDateString("es-ES")}</td>
        <td>${escapeHtml(t.desc)}</td>
        <td><span class="cat-badge">${escapeHtml(t.category)}</span></td>
        <td>${escapeHtml(t.method || "-")}</td>
        <td class="col-amount ${t.type === "gasto" ? "amount-neg" : "amount-pos"}">${t.type === "gasto" ? "-" : "+"}${fmt(t.amount)}</td>
        <td><button class="row-delete" data-id="${t.id}" title="Eliminar">🗑</button></td>
      `;
      tr.addEventListener("click", (e) => {
        if (e.target.closest(".row-delete")) return;
        openEditModal(t.id);
      });
      tr.querySelector(".row-delete").addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm("¿Eliminar este movimiento?")) {
          transactions = transactions.filter((x) => x.id !== t.id);
          save(STORAGE_KEY, transactions);
          renderAll();
        }
      });
      tbody.appendChild(tr);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function renderAll() {
    renderCards();
    renderCategoryChart();
    renderTrendChart();
    renderBudgets();
    renderTable();
  }

  // ---------- modal: add/edit transaction ----------
  const modalBackdrop = $("modalBackdrop");
  const txForm = $("txForm");

  function setType(type) {
    currentType = type;
    $("typeGastoBtn").classList.toggle("active", type === "gasto");
    $("typeIngresoBtn").classList.toggle("active", type === "ingreso");
  }

  function openAddModal() {
    txForm.reset();
    $("txId").value = "";
    $("txDate").value = todayISO();
    setType("gasto");
    $("modalTitle").textContent = "Nuevo movimiento";
    $("deleteTxBtn").style.display = "none";
    modalBackdrop.classList.add("show");
  }

  function openEditModal(id) {
    const t = transactions.find((x) => x.id === id);
    if (!t) return;
    $("txId").value = t.id;
    $("txDate").value = t.date;
    $("txDesc").value = t.desc;
    $("txAmount").value = t.amount;
    $("txCategory").value = t.category;
    $("txMethod").value = t.method || "Tarjeta";
    setType(t.type);
    $("modalTitle").textContent = "Editar movimiento";
    $("deleteTxBtn").style.display = "inline-flex";
    modalBackdrop.classList.add("show");
  }

  function closeModal() {
    modalBackdrop.classList.remove("show");
  }

  $("addBtn").addEventListener("click", openAddModal);
  $("modalClose").addEventListener("click", closeModal);
  $("cancelTxBtn").addEventListener("click", closeModal);
  modalBackdrop.addEventListener("click", (e) => { if (e.target === modalBackdrop) closeModal(); });

  $("typeGastoBtn").addEventListener("click", () => setType("gasto"));
  $("typeIngresoBtn").addEventListener("click", () => setType("ingreso"));

  $("deleteTxBtn").addEventListener("click", () => {
    const id = $("txId").value;
    if (id && confirm("¿Eliminar este movimiento?")) {
      transactions = transactions.filter((x) => x.id !== id);
      save(STORAGE_KEY, transactions);
      closeModal();
      renderAll();
    }
  });

  txForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = $("txId").value;
    const record = {
      id: id || uid(),
      type: currentType,
      date: $("txDate").value,
      desc: $("txDesc").value.trim(),
      amount: Math.abs(parseFloat($("txAmount").value)) || 0,
      category: $("txCategory").value,
      method: $("txMethod").value,
      createdAt: id ? (transactions.find((x) => x.id === id)?.createdAt || Date.now()) : Date.now()
    };
    if (id) {
      transactions = transactions.map((x) => (x.id === id ? record : x));
    } else {
      transactions.push(record);
    }
    save(STORAGE_KEY, transactions);
    closeModal();
    renderAll();
  });

  // ---------- modal: budgets ----------
  const budgetModalBackdrop = $("budgetModalBackdrop");

  function openBudgetModal() {
    const form = $("budgetForm");
    form.innerHTML = "";
    categories.forEach((cat) => {
      const row = document.createElement("div");
      row.className = "budget-form-row";
      row.innerHTML = `
        <span>${cat}</span>
        <input type="number" min="0" step="1" placeholder="0" data-cat="${cat}" value="${budgets[cat] || ""}">
      `;
      form.appendChild(row);
    });
    budgetModalBackdrop.classList.add("show");
  }

  $("manageBudgetsBtn").addEventListener("click", openBudgetModal);
  $("budgetModalClose").addEventListener("click", () => budgetModalBackdrop.classList.remove("show"));
  budgetModalBackdrop.addEventListener("click", (e) => { if (e.target === budgetModalBackdrop) budgetModalBackdrop.classList.remove("show"); });

  $("saveBudgetsBtn").addEventListener("click", () => {
    const inputs = $("budgetForm").querySelectorAll("input[data-cat]");
    budgets = {};
    inputs.forEach((inp) => {
      const val = parseFloat(inp.value);
      if (val > 0) budgets[inp.dataset.cat] = val;
    });
    save(BUDGETS_KEY, budgets);
    budgetModalBackdrop.classList.remove("show");
    renderBudgets();
  });

  // ---------- filters ----------
  [monthFilter, searchInput, typeFilter, categoryFilter].forEach((el) => {
    el.addEventListener("input", renderAll);
    el.addEventListener("change", renderAll);
  });

  // ---------- export / import ----------
  $("exportCsvBtn").addEventListener("click", () => {
    const rows = [["Fecha", "Tipo", "Descripción", "Categoría", "Método", "Importe"]];
    getFilteredTransactions({ ignoreMonth: false }).forEach((t) => {
      rows.push([t.date, t.type, t.desc, t.category, t.method || "", t.amount.toFixed(2)]);
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    downloadFile(csv, `movimientos_${monthFilter.value || "todos"}.csv`, "text/csv");
  });

  $("exportJsonBtn").addEventListener("click", () => {
    const payload = { transactions, budgets, categories, exportedAt: new Date().toISOString() };
    downloadFile(JSON.stringify(payload, null, 2), `finanzas_backup_${todayISO()}.json`, "application/json");
  });

  $("importJsonInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(reader.result);
        if (!Array.isArray(payload.transactions)) throw new Error("Formato inválido");
        if (!confirm("Esto reemplazará todos tus datos actuales por los del backup. ¿Continuar?")) return;
        transactions = payload.transactions;
        budgets = payload.budgets || {};
        categories = payload.categories || DEFAULT_CATEGORIES;
        save(STORAGE_KEY, transactions);
        save(BUDGETS_KEY, budgets);
        save(CATEGORIES_KEY, categories);
        populateCategorySelects();
        renderAll();
        alert("Backup importado correctamente.");
      } catch (err) {
        alert("No se pudo importar el archivo: " + err.message);
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  });

  function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------- init ----------
  populateCategorySelects();
  renderAll();
})();
