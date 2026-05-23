// app.js — 할 일 관리 앱: 데이터 / 렌더링 / 이벤트 / 초기화

// ---------- Supabase 설정 ----------

const SUPABASE_URL = "https://zbhuxafbcmdtpwnzrlld.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiaHV4YWZiY21kdHB3bnpybGxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MTUxODYsImV4cCI6MjA5NTA5MTE4Nn0.wswD4RK3obrXxu5-XLv5TkL8IJi6ddAXwk5Au4AzHY8";

const { createClient } = window.supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- 상수 & 상태 ----------

const CATEGORY_LABELS = {
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

const FILTER_LABELS = {
    all: "전체",
    work: "업무",
    personal: "개인",
    study: "공부",
};

let currentFilter = "all";
let todosState = [];

let todoListEl;
let todoInputEl;
let categorySelectEl;
let addButtonEl;
let progressBarEl;
let progressBarFillEl;
let progressTextEl;
let filterButtonEls;
let autoHintEl;
let toastEl;
let toastMessageEl;
let toastUndoEl;

let pendingDeletion = null;
let toastTimerId = null;
let editingId = null;

// ---------- 자동 카테고리 분류 ----------

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
        if (score > bestScore) {
            bestScore = score;
            best = category;
        }
    }
    return best;
}

function resolveCategory(selectValue, text) {
    return selectValue === "auto" ? classifyByKeywords(text) : selectValue;
}

// ---------- 유틸 ----------

function debounce(fn, wait) {
    let timer = null;
    return function debounced(...args) {
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            fn.apply(this, args);
        }, wait);
    };
}

// ---------- 데이터 계층 (Supabase) ----------

async function loadTodos() {
    const { data, error } = await supabaseClient
        .from("todo")
        .select("*")
        .order("created_at", { ascending: true });
    if (error) {
        console.warn("todos load failed:", error);
        return [];
    }
    return data;
}

async function addTodo(text, category) {
    const { data, error } = await supabaseClient
        .from("todo")
        .insert({ text, category, completed: false })
        .select()
        .single();
    if (error) {
        console.warn("todo insert failed:", error);
        return null;
    }
    todosState.push(data);
    return data;
}

async function updateTodo(id, newText, newCategory) {
    const { data, error } = await supabaseClient
        .from("todo")
        .update({ text: newText, category: newCategory })
        .eq("id", id)
        .select()
        .single();
    if (error) {
        console.warn("todo update failed:", error);
        return null;
    }
    const idx = todosState.findIndex((t) => t.id === id);
    if (idx !== -1) todosState[idx] = data;
    return data;
}

async function deleteTodo(id) {
    const { error } = await supabaseClient.from("todo").delete().eq("id", id);
    if (error) {
        console.warn("todo delete failed:", error);
        return false;
    }
    const idx = todosState.findIndex((t) => t.id === id);
    if (idx !== -1) todosState.splice(idx, 1);
    return true;
}

async function toggleTodo(id) {
    const todo = todosState.find((t) => t.id === id);
    if (!todo) return null;
    const { data, error } = await supabaseClient
        .from("todo")
        .update({ completed: !todo.completed })
        .eq("id", id)
        .select()
        .single();
    if (error) {
        console.warn("todo toggle failed:", error);
        return null;
    }
    const idx = todosState.findIndex((t) => t.id === id);
    if (idx !== -1) todosState[idx] = data;
    return data;
}

// ---------- 렌더링 ----------

function renderTodos() {
    const all = todosState;
    const visible = currentFilter === "all"
        ? all
        : all.filter((t) => t.category === currentFilter);

    todoListEl.innerHTML = "";

    if (visible.length === 0) {
        const empty = document.createElement("li");
        empty.className = "empty-state";
        if (all.length === 0) {
            empty.textContent = "할 일을 추가해보세요";
        } else {
            const label = FILTER_LABELS[currentFilter] ?? "이 카테고리";
            empty.textContent = `${label}에 해당하는 할 일이 없습니다`;
        }
        todoListEl.appendChild(empty);
    } else {
        const frag = document.createDocumentFragment();
        for (const todo of visible) frag.appendChild(buildTodoItem(todo));
        todoListEl.appendChild(frag);
    }

    updateProgress(all);
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
    editBtn.type = "button";
    editBtn.className = "edit-button";
    editBtn.textContent = "수정";
    editBtn.dataset.action = "edit";

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "delete-button";
    deleteBtn.textContent = "삭제";
    deleteBtn.dataset.action = "delete";

    li.append(checkbox, categoryEl, textEl, editBtn, deleteBtn);
    return li;
}

function updateProgress(all = todosState) {
    const total = all.length;
    const done = all.filter((t) => t.completed).length;
    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
    progressBarFillEl.style.width = percent + "%";
    if (progressBarEl) progressBarEl.setAttribute("aria-valuenow", String(percent));
    progressTextEl.textContent = `${done} / ${total} 완료 (${percent}%)`;
}

function setFilter(filter) {
    currentFilter = filter;
    for (const btn of filterButtonEls) {
        btn.classList.toggle("active", btn.dataset.filter === filter);
    }
    renderTodos();
}

// ---------- 이벤트 위임 ----------

function handleListClick(e) {
    const item = e.target.closest(".todo-item");
    if (!item) return;
    if (item.classList.contains("editing")) return;
    const id = item.dataset.id;
    if (!id) return;

    const action = e.target.dataset && e.target.dataset.action;
    if (action === "delete") {
        requestDeleteWithUndo(id);
    } else if (action === "edit") {
        const todo = todosState.find((t) => t.id === id);
        if (todo) startEdit(item, todo);
    }
}

function handleListChange(e) {
    const target = e.target;
    if (!target || target.dataset.action !== "toggle") return;
    const item = target.closest(".todo-item");
    if (!item) return;
    if (item.classList.contains("editing")) return;
    const id = item.dataset.id;
    if (!id) return;
    toggleTodo(id).then(() => renderTodos());
}

// ---------- 이벤트 핸들러 ----------

async function handleAdd() {
    const text = todoInputEl.value.trim();
    if (!text) {
        flashInvalidInput();
        return;
    }
    const category = resolveCategory(categorySelectEl.value, text);
    await addTodo(text, category);
    todoInputEl.value = "";
    updateAutoHint();
    renderTodos();
}

function flashInvalidInput() {
    if (!todoInputEl) return;
    todoInputEl.classList.add("invalid");
    todoInputEl.setAttribute("aria-invalid", "true");
    todoInputEl.focus();
    setTimeout(() => {
        todoInputEl.classList.remove("invalid");
        todoInputEl.removeAttribute("aria-invalid");
    }, 500);
}

// ---------- Undo 토스트 ----------

function requestDeleteWithUndo(id) {
    if (pendingDeletion) finalizePendingDeletion();

    const idx = todosState.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const removed = todosState[idx];

    // 화면에서는 즉시 제거 (낙관적 업데이트)
    todosState.splice(idx, 1);
    renderTodos();

    pendingDeletion = { todo: removed, index: idx };
    showToast(`"${truncate(removed.text, 20)}" 삭제됨`, onUndoDelete);

    if (toastTimerId !== null) clearTimeout(toastTimerId);
    toastTimerId = setTimeout(() => {
        toastTimerId = null;
        finalizePendingDeletion();
    }, 3000);
}

function finalizePendingDeletion() {
    if (!pendingDeletion) return;
    const { todo } = pendingDeletion;
    pendingDeletion = null;
    hideToast();
    // 실제 DB 삭제는 undo 시간이 지난 후에 실행
    supabaseClient.from("todo").delete().eq("id", todo.id).then(({ error }) => {
        if (error) console.warn("todo delete failed:", error);
    });
}

function onUndoDelete() {
    if (!pendingDeletion) return;
    const { todo, index } = pendingDeletion;
    const safeIndex = Math.min(Math.max(index, 0), todosState.length);
    todosState.splice(safeIndex, 0, todo);
    pendingDeletion = null;
    if (toastTimerId !== null) {
        clearTimeout(toastTimerId);
        toastTimerId = null;
    }
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
    setTimeout(() => {
        if (!toastEl.classList.contains("toast-visible")) toastEl.hidden = true;
    }, 200);
}

function truncate(text, max) {
    return text.length > max ? text.slice(0, max) + "…" : text;
}

function updateAutoHint() {
    if (!autoHintEl) return;
    if (categorySelectEl.value !== "auto") {
        autoHintEl.hidden = true;
        return;
    }
    const text = todoInputEl.value.trim();
    if (!text) {
        autoHintEl.hidden = true;
        return;
    }
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
    input.type = "text";
    input.className = "edit-input";
    input.value = todo.text;

    const select = document.createElement("select");
    select.className = "edit-category";
    const autoOpt = document.createElement("option");
    autoOpt.value = "auto";
    autoOpt.textContent = "자동";
    select.appendChild(autoOpt);
    for (const [value, label] of Object.entries(CATEGORY_LABELS)) {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = label;
        if (value === todo.category) opt.selected = true;
        select.appendChild(opt);
    }

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.textContent = "저장";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "취소";

    const finish = () => { editingId = null; };

    const commit = async (e) => {
        if (e) e.stopPropagation();
        const newText = input.value.trim();
        if (!newText) return;
        const newCategory = resolveCategory(select.value, newText);
        await updateTodo(todo.id, newText, newCategory);
        finish();
        renderTodos();
    };

    const cancel = (e) => {
        if (e) e.stopPropagation();
        finish();
        renderTodos();
    };

    saveBtn.addEventListener("click", commit);
    cancelBtn.addEventListener("click", cancel);
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") commit();
        else if (e.key === "Escape") cancel();
    });

    li.append(input, select, saveBtn, cancelBtn);
    input.focus();
    input.select();
}

// ---------- 초기화 ----------

document.addEventListener("DOMContentLoaded", async () => {
    todoListEl = document.getElementById("todo-list");
    todoInputEl = document.getElementById("todo-input");
    categorySelectEl = document.getElementById("category-select");
    addButtonEl = document.getElementById("add-button");
    progressBarEl = document.getElementById("progress-bar");
    progressBarFillEl = document.getElementById("progress-bar-fill");
    progressTextEl = document.getElementById("progress-text");
    filterButtonEls = document.querySelectorAll(".filter-button");
    autoHintEl = document.getElementById("auto-hint");
    toastEl = document.getElementById("toast");
    toastMessageEl = document.getElementById("toast-message");
    toastUndoEl = document.getElementById("toast-undo");

    // Supabase에서 데이터 로드
    todosState = await loadTodos();

    addButtonEl.addEventListener("click", handleAdd);
    todoInputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleAdd();
    });
    todoInputEl.addEventListener("input", updateAutoHintDebounced);
    categorySelectEl.addEventListener("change", updateAutoHint);
    updateAutoHint();

    todoListEl.addEventListener("click", handleListClick);
    todoListEl.addEventListener("change", handleListChange);

    for (const btn of filterButtonEls) {
        btn.addEventListener("click", () => setFilter(btn.dataset.filter));
    }

    setFilter(currentFilter);
});
