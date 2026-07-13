(() => {
  "use strict";

  const SUPABASE_URL = "https://yxrqyoyrmkoucjtqavfb.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_EURgI9cXlcuy-4JofF1-NA_44ykuoVm";
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

  let transactions = [];
  let budgets = {};
  let categories = [...DEFAULT_CATEGORIES];
  let currentUserId = null;

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

  function rowToTx(row) {
    return {
      id: row.id,
      type: row.type,
      date: row.date,
      desc: row.description,
      amount: Number(row.amount),
      category: row.category,
      method: row.method,
      createdAt: new Date(row.created_at).getTime()
    };
  }

  function populateCategorySelects() {
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
      tr.querySelector(".row-delete").addEventListener("click", async (e) => {
        e.stopPropagation();
        if (confirm("¿Eliminar este movimiento?")) {
          const ok = await deleteTransactionById(t.id);
          if (ok) {
            transactions = transactions.filter((x) => x.id !== t.id);
            renderAll();
          }
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

  // ---------- supabase: transactions CRUD ----------
  async function insertTransaction(record) {
    const { data, error } = await supabase.from("transactions").insert({
      user_id: currentUserId,
      type: record.type,
      date: record.date,
      description: record.desc,
      amount: record.amount,
      category: record.category,
      method: record.method
    }).select().single();
    if (error) { alert("Error al guardar: " + error.message); return null; }
    return rowToTx(data);
  }

  async function updateTransactionById(id, record) {
    const { data, error } = await supabase.from("transactions").update({
      type: record.type,
      date: record.date,
      description: record.desc,
      amount: record.amount,
      category: record.category,
      method: record.method
    }).eq("id", id).select().single();
    if (error) { alert("Error al guardar: " + error.message); return null; }
    return rowToTx(data);
  }

  async function deleteTransactionById(id) {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) { alert("Error al eliminar: " + error.message); return false; }
    return true;
  }

  async function saveSettings() {
    const { error } = await supabase.from("user_settings").upsert({
      user_id: currentUserId,
      categories,
      budgets
    });
    if (error) alert("Error al guardar ajustes: " + error.message);
  }

  async function loadAllData() {
    const [txRes, settingsRes] = await Promise.all([
      supabase.from("transactions").select("*").order("date", { ascending: false }),
      supabase.from("user_settings").select("*").maybeSingle()
    ]);

    transactions = txRes.error ? [] : txRes.data.map(rowToTx);
    if (txRes.error) alert("Error al cargar movimientos: " + txRes.error.message);

    if (settingsRes.data) {
      categories = (settingsRes.data.categories && settingsRes.data.categories.length) ? settingsRes.data.categories : [...DEFAULT_CATEGORIES];
      budgets = settingsRes.data.budgets || {};
    } else {
      categories = [...DEFAULT_CATEGORIES];
      budgets = {};
      await saveSettings();
    }

    const missingDefaults = DEFAULT_CATEGORIES.filter((c) => !categories.includes(c));
    if (missingDefaults.length > 0) {
      categories = [...categories, ...missingDefaults];
      await saveSettings();
    }

    populateCategorySelects();
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

  $("deleteTxBtn").addEventListener("click", async () => {
    const id = $("txId").value;
    if (id && confirm("¿Eliminar este movimiento?")) {
      const ok = await deleteTransactionById(id);
      if (ok) {
        transactions = transactions.filter((x) => x.id !== id);
        closeModal();
        renderAll();
      }
    }
  });

  txForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("txId").value;
    const record = {
      type: currentType,
      date: $("txDate").value,
      desc: $("txDesc").value.trim(),
      amount: Math.abs(parseFloat($("txAmount").value)) || 0,
      category: $("txCategory").value,
      method: $("txMethod").value
    };

    const submitBtn = txForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      if (id) {
        const updated = await updateTransactionById(id, record);
        if (updated) transactions = transactions.map((x) => (x.id === id ? updated : x));
      } else {
        const created = await insertTransaction(record);
        if (created) transactions.push(created);
      }
      closeModal();
      renderAll();
    } finally {
      submitBtn.disabled = false;
    }
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

  $("saveBudgetsBtn").addEventListener("click", async () => {
    const inputs = $("budgetForm").querySelectorAll("input[data-cat]");
    budgets = {};
    inputs.forEach((inp) => {
      const val = parseFloat(inp.value);
      if (val > 0) budgets[inp.dataset.cat] = val;
    });
    await saveSettings();
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
    reader.onload = async () => {
      try {
        const payload = JSON.parse(reader.result);
        if (!Array.isArray(payload.transactions)) throw new Error("Formato inválido");
        if (!confirm("Esto reemplazará todos tus datos actuales en la nube por los del backup. ¿Continuar?")) return;

        const { error: delError } = await supabase.from("transactions").delete().eq("user_id", currentUserId);
        if (delError) throw delError;

        if (payload.transactions.length > 0) {
          const rows = payload.transactions.map((t) => ({
            user_id: currentUserId,
            type: t.type,
            date: t.date,
            description: t.desc,
            amount: t.amount,
            category: t.category,
            method: t.method || null
          }));
          const { error: insError } = await supabase.from("transactions").insert(rows);
          if (insError) throw insError;
        }

        categories = payload.categories && payload.categories.length ? payload.categories : [...DEFAULT_CATEGORIES];
        budgets = payload.budgets || {};
        await saveSettings();

        await loadAllData();
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

  // ---------- auth ----------
  const authScreen = $("authScreen");
  const appRoot = $("app");
  let authMode = "signin";

  function showApp(user) {
    authScreen.classList.remove("show");
    appRoot.classList.remove("hidden");
    $("userEmail").textContent = user.email;
  }

  function showAuthScreen() {
    appRoot.classList.add("hidden");
    authScreen.classList.add("show");
    txForm.reset();
    modalBackdrop.classList.remove("show");
    budgetModalBackdrop.classList.remove("show");
  }

  $("authToggleBtn").addEventListener("click", () => {
    authMode = authMode === "signin" ? "signup" : "signin";
    $("authSubmitBtn").textContent = authMode === "signin" ? "Iniciar sesión" : "Crear cuenta";
    $("authToggleBtn").textContent = authMode === "signin" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión";
    $("authError").textContent = "";
    $("authHint").textContent = "";
  });

  $("authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("authError").textContent = "";
    $("authHint").textContent = "";
    const email = $("authEmail").value.trim();
    const password = $("authPassword").value;
    const submitBtn = $("authSubmitBtn");
    submitBtn.disabled = true;
    try {
      if (authMode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session === null) {
          $("authHint").textContent = "Cuenta creada. Revisa tu email para confirmar antes de iniciar sesión.";
        }
      }
    } catch (err) {
      $("authError").textContent = err.message;
    } finally {
      submitBtn.disabled = false;
    }
  });

  $("logoutBtn").addEventListener("click", () => supabase.auth.signOut());

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session && session.user) {
      if (currentUserId !== session.user.id) {
        currentUserId = session.user.id;
        showApp(session.user);
        await loadAllData();
        renderAll();
      }
    } else {
      currentUserId = null;
      showAuthScreen();
    }
  });
})();
