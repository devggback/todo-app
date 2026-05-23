// app.js — 할 일 관리 앱(데스크탑 버전): 데이터 / 렌더링 / 이벤트 / 초기화

const STORAGE_KEY = "todos";

const CATEGORY_LABELS = {
    work: "업무",
    personal: "개인",
    study: "공부",
};

const FILTER_TITLES = {
    all: "전체 할 일",
    work: "업무",
    personal: "개인",
    study: "공부",
};

const CATEGORY_KEYWORDS_RAW = {
    work: [
        "회의", "미팅", "보고서", "보고", "이메일", "메일", "발표", "프로젝트",
        "클라이언트", "고객", "업무", "출장", "결재", "기획", "마감", "회사",
        "팀", "거래처", "계약",
    ],
    study: [
        "공부", "강의", "수업", "시험", "과제", "숙제", "학습", "독서", "책",
        "영어", "수학", "국어", "인강", "복습", "예습", "학원", "자격증",
        "토익", "토플", "코딩", "논문",
    ],
    personal: [
        "운동", "헬스", "요가", "산책", "조깅", "쇼핑", "장보기", "약속", "친구",
        "가족", "영화", "여행", "식사", "점심", "저녁", "아침", "병원", "청소",
        "빨래", "은행", "미용실",
    ],
};

const CATEGORY_KEYWORDS = Object.fromEntries(
    Object.entries(CATEGORY_KEYWORDS_RAW).map(([cat, keywords]) => [
        cat,
        keywords.map((k) => k.toLowerCase()),
    ])
);

const AUTO_FALLBACK_CATEGORY = "personal";

let currentFilter = "all";
let todosState = [];
let todoListEl, todoInputEl, categorySelectEl, addButtonEl;
let progressBarEl, progressBarFillEl, progressTextEl;
let filterButtonEls, autoHintEl, listTitleEl, listMetaEl;
let statTotalEl, statDoneEl, statRemainingEl, countEls;
let toastEl, toastMessageEl, toastUndoEl;
let pendingDeletion = null;
let toastTimerId = null;
let editingId = null;

function classifyByKeywords(text) {
    if (!text) return AUTO_FALLBACK_CATEGORY;
    const lower = text.toLowerCase();
    let best = AUTO_FALLBACK_CATEGORY;
    let bestScore = 0;
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        let score = 0;
        for (const kw of keywords) {
            if (lower.includes(kw)) score++;
        }
        if (score > bestScore) { bestScore = score; best = category; }
    }
    return best;
}

function resolveCategory(selectValue, text) {
    return selectValue === "auto" ? classifyByKeywords(text) : selectValue;
}

function generateId() {
    return typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function debounce(fn, wait) {
    let timer = null;
    return function debounced(...args) {
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => { timer = null; fn.apply(this, args); }, wait);
    };
}

function loadTodos() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.warn("todos parse failed, resetting:", e);
        try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
        return [];
    }
}

function saveTodos(todos) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(todos)); }
    catch (e) { console.warn("todos save failed (quota?):", e); }
}

function addTodo(text, category) {
    const todo = { id: generateId(), text, category, completed: false, createdAt: new Date().toISOString() };
    todosState.push(todo);
    saveTodos(todosState);
    return todo;
}

function updateTodo(id, newText, newCategory) {
    const todo = todosState.find((t) => t.id === id);
    if (!todo) return null;
    todo.text = newText; todo.category = newCategory;
    saveTodos(todosState);
    return todo;
}

function deleteTodo(id) {
    const idx = todosState.findIndex((t) => t.id === id);
    if (idx === -1) return;
    todosState.splice(idx, 1);
    saveTodos(todosState);
}

function toggleTodo(id) {
    const todo = todosState.find((t) => t.id === id);
    if (!todo) return null;
    todo.completed = !todo.completed;
    saveTodos(todosState);
    return todo;
}

function renderTodos() {
    const all = todosState;
    const visible = currentFilter === "all" ? all : all.filter((t) => t.category === currentFilter);
    todoListEl.innerHTML = "";
    if (visible.length === 0) {
        const empty = document.createElement("li");
        empty.className = "empty-state";
        if (all.length === 0) {
            empty.textContent = "할 일을 추가해보세요";
        } else {
            const label = FILTER_TITLES[currentFilter] ?? "이 카테고리";
            const clean = currentFilter === "all" ? "전체" : label;
            empty.textContent = `${clean}에 해당하는 할 일이 없습니다`;
        }
        todoListEl.appendChild(empty);
    } else {
        const frag = document.createDocumentFragment();
        for (const todo of visible) frag.appendChild(buildTodoItem(todo));
        todoListEl.appendChild(frag);
    }
    updateProgress(all);
    updateCounts(all);
    updateListHeader(visible.length);
}

function buildTodoItem(todo) {
    const li = document.createElement("li");
    li.className = "todo-item";
    li.dataset.id = todo.id;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.completed;
    checkbox.dataset.action = "toggle";
    checkbox.setAttribute("aria-label", `${todo.text} 완료 표시`);
    const categoryEl = document.createElement("span");
    categoryEl.className = `category-label category-${todo.category}`;
    categoryEl.textContent = CATEGORY_LABELS[todo.category] ?? todo.category;
    const textEl = document.createElement("span");
    textEl.className = "todo-text";
    if (todo.completed) textEl.classList.add("completed");
    textEl.textContent = todo.text;
    const editBtn = document.createElement("button");
    editBtn.type = "button"; editBtn.className = "edit-button"; editBtn.textContent = "수정"; editBtn.dataset.action = "edit";
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button"; deleteBtn.className = "delete-button"; deleteBtn.textContent = "삭제"; deleteBtn.dataset.action = "delete";
    li.append(checkbox, categoryEl, textEl, editBtn, deleteBtn);
    return li;
}

function updateProgress(all = todosState) {
    const total = all.length;
    const done = all.filter((t) => t.completed).length;
    const remaining = total - done;
    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
    progressBarFillEl.style.width = percent + "%";
    if (progressBarEl) progressBarEl.setAttribute("aria-valuenow", String(percent));
    progressTextEl.textContent = `${done} / ${total} 완료 (${percent}%)`;
    statTotalEl.textContent = total;
    statDoneEl.textContent = done;
    statRemainingEl.textContent = remaining;
}

function updateCounts(all = todosState) {
    const counts = { all: all.length, work: 0, personal: 0, study: 0 };
    for (const t of all) { if (counts[t.category] !== undefined) counts[t.category]++; }
    for (const [key, el] of Object.entries(countEls)) { el.textContent = counts[key]; }
}

function updateListHeader(visibleCount) {
    listTitleEl.textContent = FILTER_TITLES[currentFilter] ?? "할 일";
    listMetaEl.textContent = `${visibleCount}개`;
}

function setFilter(filter) {
    currentFilter = filter;
    for (const btn of filterButtonEls) { btn.classList.toggle("active", btn.dataset.filter === filter); }
    renderTodos();
}

function handleListClick(e) {
    const item = e.target.closest(".todo-item");
    if (!item || item.classList.contains("editing")) return;
    const id = item.dataset.id;
    if (!id) return;
    const action = e.target.dataset && e.target.dataset.action;
    if (action === "delete") requestDeleteWithUndo(id);
    else if (action === "edit") { const todo = todosState.find((t) => t.id === id); if (todo) startEdit(item, todo); }
}

function handleListChange(e) {
    const target = e.target;
    if (!target || target.dataset.action !== "toggle") return;
    const item = target.closest(".todo-item");
    if (!item || item.classList.contains("editing")) return;
    const id = item.dataset.id;
    if (!id) return;
    toggleTodo(id);
    renderTodos();
}

function handleAdd() {
    const text = todoInputEl.value.trim();
    if (!text) { flashInvalidInput(); return; }
    const category = resolveCategory(categorySelectEl.value, text);
    addTodo(text, category);
    todoInputEl.value = "";
    updateAutoHint();
    renderTodos();
}

function flashInvalidInput() {
    if (!todoInputEl) return;
    todoInputEl.classList.add("invalid");
    todoInputEl.setAttribute("aria-invalid", "true");
    todoInputEl.focus();
    setTimeout(() => { todoInputEl.classList.remove("invalid"); todoInputEl.removeAttribute("aria-invalid"); }, 500);
}

function requestDeleteWithUndo(id) {
    if (pendingDeletion) finalizePendingDeletion();
    const idx = todosState.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const removed = todosState[idx];
    todosState.splice(idx, 1);
    saveTodos(todosState);
    renderTodos();
    pendingDeletion = { todo: removed, index: idx };
    showToast(`"${truncate(removed.text, 20)}" 삭제됨`, onUndoDelete);
    if (toastTimerId !== null) clearTimeout(toastTimerId);
    toastTimerId = setTimeout(() => { toastTimerId = null; finalizePendingDeletion(); }, 3000);
}

function finalizePendingDeletion() { pendingDeletion = null; hideToast(); }

function onUndoDelete() {
    if (!pendingDeletion) return;
    const { todo, index } = pendingDeletion;
    const safeIndex = Math.min(Math.max(index, 0), todosState.length);
    todosState.splice(safeIndex, 0, todo);
    saveTodos(todosState);
    pendingDeletion = null;
    if (toastTimerId !== null) { clearTimeout(toastTimerId); toastTimerId = null; }
    hideToast();
    renderTodos();
}

function showToast(message, onUndo) {
    if (!toastEl) return;
    toastMessageEl.textContent = message;
    toastEl.hidden = false;
    requestAnimationFrame(() => toastEl.classList.add("toast-visible"));
    const newUndo = toastUndoEl.cloneNode(true);
    toastUndoEl.parentNode.replaceChild(newUndo, toastUndoEl);
    toastUndoEl = newUndo;
    toastUndoEl.addEventListener("click", onUndo);
}

function hideToast() {
    if (!toastEl) return;
    toastEl.classList.remove("toast-visible");
    setTimeout(() => { if (!toastEl.classList.contains("toast-visible")) toastEl.hidden = true; }, 200);
}

function truncate(text, max) { return text.length > max ? text.slice(0, max) + "…" : text; }

function updateAutoHint() {
    if (!autoHintEl) return;
    if (categorySelectEl.value !== "auto") { autoHintEl.hidden = true; return; }
    const text = todoInputEl.value.trim();
    if (!text) { autoHintEl.hidden = true; return; }
    const category = classifyByKeywords(text);
    autoHintEl.hidden = false;
    autoHintEl.textContent = `자동 분류: ${CATEGORY_LABELS[category]}`;
}

const updateAutoHintDebounced = debounce(updateAutoHint, 120);

function startEdit(li, todo) {
    editingId = todo.id;
    li.innerHTML = "";
    li.classList.add("editing");
    const input = document.createElement("input");
    input.type = "text"; input.className = "edit-input"; input.value = todo.text;
    const select = document.createElement("select");
    select.className = "edit-category";
    const autoOpt = document.createElement("option");
    autoOpt.value = "auto"; autoOpt.textContent = "자동";
    select.appendChild(autoOpt);
    for (const [value, label] of Object.entries(CATEGORY_LABELS)) {
        const opt = document.createElement("option");
        opt.value = value; opt.textContent = label;
        if (value === todo.category) opt.selected = true;
        select.appendChild(opt);
    }
    const saveBtn = document.createElement("button");
    saveBtn.type = "button"; saveBtn.textContent = "저장";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button"; cancelBtn.textContent = "취소";
    const finish = () => { editingId = null; };
    const commit = (e) => {
        if (e) e.stopPropagation();
        const newText = input.value.trim();
        if (!newText) return;
        updateTodo(todo.id, newText, resolveCategory(select.value, newText));
        finish(); renderTodos();
    };
    const cancel = (e) => { if (e) e.stopPropagation(); finish(); renderTodos(); };
    saveBtn.addEventListener("click", commit);
    cancelBtn.addEventListener("click", cancel);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") commit(); else if (e.key === "Escape") cancel(); });
    li.append(input, select, saveBtn, cancelBtn);
    input.focus(); input.select();
}

document.addEventListener("DOMContentLoaded", () => {
    todoListEl = document.getElementById("todo-list");
    todoInputEl = document.getElementById("todo-input");
    categorySelectEl = document.getElementById("category-select");
    addButtonEl = document.getElementById("add-button");
    progressBarEl = document.getElementById("progress-bar");
    progressBarFillEl = document.getElementById("progress-bar-fill");
    progressTextEl = document.getElementById("progress-text");
    filterButtonEls = document.querySelectorAll(".filter-button");
    autoHintEl = document.getElementById("auto-hint");
    listTitleEl = document.getElementById("list-title");
    listMetaEl = document.getElementById("list-meta");
    statTotalEl = document.getElementById("stat-total");
    statDoneEl = document.getElementById("stat-done");
    statRemainingEl = document.getElementById("stat-remaining");
    toastEl = document.getElementById("toast");
    toastMessageEl = document.getElementById("toast-message");
    toastUndoEl = document.getElementById("toast-undo");
    countEls = {
        all: document.getElementById("count-all"),
        work: document.getElementById("count-work"),
        personal: document.getElementById("count-personal"),
        study: document.getElementById("count-study"),
    };
    todosState = loadTodos();
    addButtonEl.addEventListener("click", handleAdd);
    todoInputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") handleAdd(); });
    todoInputEl.addEventListener("input", updateAutoHintDebounced);
    categorySelectEl.addEventListener("change", updateAutoHint);
    updateAutoHint();
    todoListEl.addEventListener("click", handleListClick);
    todoListEl.addEventListener("change", handleListChange);
    for (const btn of filterButtonEls) { btn.addEventListener("click", () => setFilter(btn.dataset.filter)); }
    setFilter(currentFilter);
});
