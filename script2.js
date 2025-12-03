/* script2.js - full patched JS
   - filter-aware progress + ECT
   - robust recommendation <-> focus logic
   - desc clamping + More/Less toggles (only when clipped)
   - completed tasks pushed to bottom
*/

/* ---------- STATE ---------- */
let tasks = [];
let currentFilter = "all";
let effortFilter = "all";
let focusMode = false;
let editingId = null;
let focusedTaskId = null;

/* custom selects (if present) */
let customEffortControl = null;
let customEffortAdd = null;
let customPriorityAdd = null;

/* ---------- DOM ready ---------- */
document.addEventListener("DOMContentLoaded", () => {
  loadTasks();
  loadFocusedTaskId();
  attachInitialListeners();

  // initialize custom selects (safe)
  try {
    customEffortControl = initCustomSelect("custom-effort", (val) => { effortFilter = String(val); render(); });
    customEffortAdd = initCustomSelect("custom-effort-add");
    customPriorityAdd = initCustomSelect("custom-priority-add");
  } catch (e) {}

  render();
});

/* ---------- Persistence for focusedTaskId ---------- */
function saveFocusedTaskId() {
  try {
    if (focusedTaskId) localStorage.setItem("focused_task_id", focusedTaskId);
    else localStorage.removeItem("focused_task_id");
  } catch (e) {}
}
function loadFocusedTaskId() {
  try {
    const id = localStorage.getItem("focused_task_id");
    focusedTaskId = id ? id : null;
  } catch (e) { focusedTaskId = null; }
}

/* ---------- Initial listeners ---------- */
function attachInitialListeners(){
  const form = document.getElementById("task-form");
  if (form) form.addEventListener("submit", handleAddTask);

  const filtersEl = document.getElementById("filters");
  if (filtersEl) {
    filtersEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".filter");
      if (!btn) return;
      document.querySelectorAll(".filter").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.filter;
      render();
    });
  }

  const focusToggle = document.getElementById("focus-mode-toggle");
  if (focusToggle) focusToggle.addEventListener("click", () => {
    focusMode = true; render(); scrollIntoViewIfNeeded("focus-mode");
  });

  const exitFocus = document.getElementById("exit-focus");
  if (exitFocus) exitFocus.addEventListener("click", () => {
    focusMode = false; render(); scrollIntoViewIfNeeded("task-list");
  });

  const listContainer = document.getElementById("task-list-container");
  if (listContainer) listContainer.addEventListener("click", handleTaskListClick);

  // global handler for More/Less toggle (works for both task & recommend)
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('.desc-toggle');
    if (!btn) return;
    e.stopPropagation();
    const taskCard = btn.closest('.task');
    const recommendCard = btn.closest('.recommend-card');
    if (taskCard) toggleDescriptionExpandByElement(taskCard);
    else if (recommendCard) toggleDescriptionExpandByElement(recommendCard);
  });
}

/* ---------- Add Task ---------- */
function handleAddTask(e){
  e.preventDefault();
  const titleEl = document.getElementById("title");
  if (!titleEl) return;
  const title = titleEl.value.trim();
  if (!title) return;

  const desc = (document.getElementById("description")?.value || "").trim();
  const dueDate = document.getElementById("dueDate")?.value || null;

  const effort = (customEffortAdd && customEffortAdd.getValue) ? customEffortAdd.getValue() : "2";
  const priority = (customPriorityAdd && customPriorityAdd.getValue) ? customPriorityAdd.getValue() : "medium";

  const newTask = {
    id: Date.now().toString(),
    title, description: desc, dueDate, effort, priority,
    status: "pending", createdAt: Date.now()
  };

  tasks.push(newTask); saveTasks();
  e.target.reset();
  if (customEffortAdd && customEffortAdd.setValue) customEffortAdd.setValue("2");
  if (customPriorityAdd && customPriorityAdd.setValue) customPriorityAdd.setValue("medium");
  render();
}

/* ---------- Delegated task list handler ---------- */
function handleTaskListClick(e){
  const action = e.target.dataset.action;
  const id = e.target.dataset.id;
  if (!action || !id) return;

  if (action === "toggle") {
    const t = tasks.find(x => x.id === id);
    if (t) {
      t.status = t.status === "pending" ? "completed" : "pending";
      if (t.status === "completed" && focusedTaskId === t.id) { focusedTaskId = null; saveFocusedTaskId(); }
      saveTasks(); render();
    }
  } else if (action === "delete") {
    if (focusedTaskId === id) { focusedTaskId = null; saveFocusedTaskId(); }
    tasks = tasks.filter(x => x.id !== id);
    saveTasks(); render();
  } else if (action === "focus") {
    const t = tasks.find(x => x.id === id);
    if (t) { focusedTaskId = id; saveFocusedTaskId(); focusMode = true; render(); scrollIntoViewIfNeeded("focus-mode"); }
  } else if (action === "edit") {
    editingId = id; render();
    setTimeout(() => { document.querySelector(`.task[data-id="${id}"] input[name="title"]`)?.focus(); }, 60);
  } else if (action === "save-edit") {
    const taskDiv = e.target.closest(".task");
    if (!taskDiv) return;
    const form = taskDiv.querySelector(".task-edit-form");
    if (!form) return;
    const idAttr = form.dataset.id || e.target.dataset.id;
    const t = tasks.find(x => x.id === idAttr); if (!t) return;
    const newTitle = form.querySelector('input[name="title"]').value.trim();
    const newDesc = form.querySelector('textarea[name="description"]').value.trim();
    const newDue = form.querySelector('input[name="dueDate"]').value || null;
    const newEffort = form.querySelector('select[name="effort"]').value;
    const newPriority = form.querySelector('select[name="priority"]').value;
    if (!newTitle) { alert("Title is required."); return; }
    t.title = newTitle; t.description = newDesc; t.dueDate = newDue; t.effort = newEffort; t.priority = newPriority;
    editingId = null; saveTasks(); render();
  } else if (action === "cancel-edit") {
    editingId = null; render();
  } else if (action === "toggle-desc") {
    // legacy fallback (should be handled by global listener)
    const taskDiv = e.target.closest('.task');
    toggleDescriptionExpandByElement(taskDiv);
    return;
  }
}

/* ---------- Render flow ---------- */
function render(){
  updateWarnings();
  const filtered = getFilteredTasks();
  renderProgress(filtered);
  renderRecommendation(filtered);
  renderECT(filtered);

  if (focusMode) {
    renderFocusMode();
    document.getElementById("task-list")?.classList.add("hidden");
    document.getElementById("focus-mode")?.classList.remove("hidden");
  } else {
    document.getElementById("task-list")?.classList.remove("hidden");
    document.getElementById("focus-mode")?.classList.add("hidden");
  }

  renderTaskList();
  updateDescToggles(); // IMPORTANT: update toggles after DOM render
}

/* ---------- Progress ---------- */
function renderProgress(filteredTasks){
  const filtered = Array.isArray(filteredTasks) ? filteredTasks : getFilteredTasks();
  const textEl = document.getElementById("progress-text");
  const fill = document.getElementById("progress-fill");
  if (!textEl || !fill) return;
  const total = filtered.length;
  const completed = filtered.filter(t => t.status === "completed").length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  textEl.textContent = `${completed} of ${total} completed`;
  fill.style.width = percent + "%";
  if (percent >= 80) {
    fill.style.background = "linear-gradient(90deg, #10b981, #059669)";
    fill.style.boxShadow = "0 6px 18px rgba(5,150,105,0.12) inset";
  } else if (percent >= 40) {
    fill.style.background = `linear-gradient(90deg, var(--primary), var(--primary-2))`;
    fill.style.boxShadow = "0 6px 18px rgba(79,70,229,0.12) inset";
  } else {
    fill.style.background = "linear-gradient(90deg, #f59e0b, #ef4444)";
    fill.style.boxShadow = "0 6px 18px rgba(239,68,68,0.08) inset";
  }
}

/* ---------- ECT ---------- */
function calculateECTForList(list) {
  let total = 0;
  list.filter(t => t.status !== "completed").forEach(t => {
    if (t.effort === "deep") total += 45;
    else total += Number(t.effort || 0);
  });
  return total;
}
function renderECT(filteredTasks) {
  const filtered = Array.isArray(filteredTasks) ? filteredTasks : getFilteredTasks();
  const ectArea = document.getElementById("ect-area");
  if (!ectArea) return;
  const total = calculateECTForList(filtered);
  if (total === 0) ectArea.textContent = "All filtered tasks completed — you're free! 🎉";
  else {
    if (total >= 60) {
      const hrs = Math.floor(total / 60); const mins = total % 60;
      ectArea.textContent = `Estimated time for filtered tasks: ~${hrs}h ${mins}m`;
    } else ectArea.textContent = `Estimated time for filtered tasks: ~${total} minutes`;
  }
}

/* ---------- Recommendation ---------- */
function getNextBestTaskFromList(list, excludeTaskId = null) {
  if (!Array.isArray(list)) return null;
  const candidates = list.filter(t => t && t.status === "pending" && t.id !== excludeTaskId);
  if (!candidates.length) return null;
  const withDue = candidates.filter(p => p.dueDate);
  const withoutDue = candidates.filter(p => !p.dueDate);
  function effortRank(e) {
    if (e === "deep") return 999;
    const n = Number(e); return isNaN(n) ? 999 : n;
  }
  withDue.sort((a,b) => {
    if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    const er = effortRank(a.effort) - effortRank(b.effort); if (er !== 0) return er;
    return a.createdAt - b.createdAt;
  });
  if (withDue.length) return withDue[0];
  withoutDue.sort((a,b) => {
    const er = effortRank(a.effort) - effortRank(b.effort); if (er !== 0) return er;
    return a.createdAt - b.createdAt;
  });
  return withoutDue[0] || null;
}

function renderRecommendation(filteredTasks) {
  const area = document.getElementById("recommendation-area");
  if (!area) return;
  const list = Array.isArray(filteredTasks) ? filteredTasks : getFilteredTasks();
  area.innerHTML = "";
  const best = getNextBestTaskFromList(list, focusedTaskId);
  if (!best) { area.innerHTML = `<div class="recommend-card"><div class="recommend-placeholder">No tasks to recommend</div></div>`; return; }
  const div = document.createElement("div");
  div.className = "recommend-card";
  div.innerHTML = `
    <div class="recommend-left">
      <h4>${escapeHtml(best.title)}</h4>
      <div class="recommend-meta">
        ${best.dueDate ? `<span>Due: ${best.dueDate}</span>` : `<span>No due date</span>`}
        <span>•</span>
        <span>Effort: ${formatEffort(best.effort)}</span>
        <span>•</span>
        <span class="priority-badge ${best.priority}">${best.priority.toUpperCase()}</span>
      </div>

      ${best.description ? `
        <div class="desc-wrap">
          <p class="recommend-desc">${escapeHtml(best.description)}</p>
          <button class="desc-toggle" data-action="toggle-recommend-desc" data-id="${best.id}">More</button>
        </div>` : ''}
    </div>

    <div class="recommend-actions">
      <button class="primary recommend-start-btn" data-action="focus" data-id="${best.id}">Start</button>
    </div>
  `;
  area.appendChild(div);
}

/* ---------- Filtering & ordering ---------- */
function getFilteredTasks(){
  const todayStr = new Date().toISOString().split("T")[0];
  if (!Array.isArray(tasks)) return [];
  const res = tasks.filter(task => {
    if (!task) return false;
    if (currentFilter === "completed") { if (task.status !== "completed") return false; }
    else if (currentFilter === "today") { if (!(task.status === "pending" && task.dueDate === todayStr)) return false; }
    else if (currentFilter === "upcoming") { if (task.status !== "pending") return false; if (!task.dueDate) return true; if (task.dueDate > todayStr) return true; return false; }
    else if (currentFilter === "overdue") { if (!(task.status === "pending" && task.dueDate && task.dueDate < todayStr)) return false; }
    if (effortFilter && String(effortFilter) !== "all") { if (String(task.effort) !== String(effortFilter)) return false; }
    return true;
  });

  res.sort((a, b) => {
    if (currentFilter !== "completed") {
      if (a.status === "completed" && b.status !== "completed") return 1;
      if (b.status === "completed" && a.status !== "completed") return -1;
    }
    const aHas = a.dueDate ? 1 : 0; const bHas = b.dueDate ? 1 : 0;
    if (aHas && bHas) { if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate); return a.createdAt - b.createdAt; }
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    return a.createdAt - b.createdAt;
  });

  return res;
}

/* ---------- Task list rendering ---------- */
function renderTaskList(){
  const container = document.getElementById("task-list-container");
  if (!container) return;
  let list = getFilteredTasks();
  if (currentFilter !== "completed") {
    list = [...list.filter(t => t.status !== "completed"), ...list.filter(t => t.status === "completed")];
  }
  container.innerHTML = "";
  if (!list.length) { container.innerHTML = '<p class="empty">No tasks to show. Add one to start.</p>'; return; }
  list.forEach(task => {
    const div = document.createElement("div");
    const isEditing = editingId === task.id;
    div.className = "task " + (task.status === "completed" ? "completed" : "") + (isEditing ? " editing" : "");
    div.setAttribute("data-id", task.id);
    const priorityClass = task.priority || "medium";

    if (isEditing) {
      div.innerHTML = `
        <div style="flex:1; min-width:0;">
          <form class="task-edit-form" data-id="${task.id}">
            <input type="text" name="title" value="${escapeHtml(task.title)}" placeholder="Title" required />
            <textarea name="description" placeholder="Description">${escapeHtml(task.description||"")}</textarea>
            <div class="task-edit-row">
              <input type="date" name="dueDate" value="${task.dueDate || ""}" style="flex:1; min-width:150px;" />
              <select name="effort" style="width:140px;">
                <option value="2" ${task.effort==='2'?'selected':''}>2 min</option>
                <option value="5" ${task.effort==='5'?'selected':''}>5 min</option>
                <option value="15" ${task.effort==='15'?'selected':''}>15 min</option>
                <option value="deep" ${task.effort==='deep'?'selected':''}>Deep work</option>
              </select>
              <select name="priority" style="width:130px;">
                <option value="low" ${task.priority==='low'?'selected':''}>Low</option>
                <option value="medium" ${task.priority==='medium'?'selected':''}>Medium</option>
                <option value="high" ${task.priority==='high'?'selected':''}>High</option>
              </select>
            </div>
            <div class="task-edit-actions">
              <button type="button" class="secondary" data-action="cancel-edit" data-id="${task.id}">Cancel</button>
              <button type="button" class="primary" data-action="save-edit" data-id="${task.id}">Save</button>
            </div>
          </form>
        </div>
      `;
    } else {
      div.innerHTML = `
        <div class="task-main">
          <input type="checkbox" data-action="toggle" data-id="${task.id}" ${task.status==="completed"?"checked":""} />
          <div class="task-text" style="min-width:0;">
            <h3>${escapeHtml(task.title)}</h3>

            ${task.description ? `
              <div class="desc-wrap">
                <p class="task-desc">${escapeHtml(task.description)}</p>
                <button class="desc-toggle" data-action="toggle-desc" data-id="${task.id}">More</button>
              </div>` : ''}

            <div class="meta">
              ${task.dueDate? `<span>Due: ${task.dueDate}</span>` : `<span>No due date</span>`}
              <span>•</span>
              <span>Effort: ${formatEffort(task.effort)}</span>
              <span>•</span>
              <span class="priority-badge ${priorityClass}">${task.priority.toUpperCase()}</span>
            </div>
          </div>
        </div>

        <div class="task-actions">
          <button class="secondary" data-action="edit" data-id="${task.id}">Edit</button>
          <button class="secondary" data-action="focus" data-id="${task.id}">Focus</button>
          <button class="delete-btn" data-action="delete" data-id="${task.id}">Delete</button>
        </div>
      `;
    }

    container.appendChild(div);
    const taskToggleBtn = div.querySelector('.desc-toggle');
  if (taskToggleBtn) {
    taskToggleBtn.addEventListener('click', function(ev) {
      ev.stopPropagation();
      toggleDescriptionExpandByElement(div);
      // recalc visibility for all toggles after expansion/collapse
      setTimeout(updateDescToggles, 40);
    });
   }
  });
}

/* ---------- Focus mode rendering ---------- */
function renderFocusMode(){
  const focusSection = document.getElementById("focus-mode");
  const container = document.getElementById("focus-task-container");
  if (!focusSection || !container) return;
  focusSection.classList.remove("hidden");
  container.innerHTML = "";

  let task = null;
  if (focusedTaskId) {
    task = tasks.find(t => t.id === focusedTaskId && t.status === "pending");
    if (!task) { focusedTaskId = null; saveFocusedTaskId(); }
  }

  if (!task) {
    const pending = tasks.filter(t => t.status === "pending").sort((a,b) => {
      const ad = a.dueDate || "9999-12-31"; const bd = b.dueDate || "9999-12-31";
      if (ad === bd) return a.createdAt - b.createdAt;
      return ad.localeCompare(bd);
    });
    task = pending[0] || null;
    if (task) { focusedTaskId = task.id; saveFocusedTaskId(); }
  }

  if (!task) {
    container.innerHTML = '<p class="empty">No pending tasks. You are done 🎉</p>';
    return;
  }

  const priorityClass = task.priority === 'high' ? 'high' : (task.priority === 'medium' ? 'medium' : 'low');

  const card = document.createElement("div");
  card.className = "focus-card";
  card.innerHTML = `
    <div class="focus-card-inner">
      <div class="focus-left">
        <h3 class="focus-title">${escapeHtml(task.title)}</h3>
        <div class="focus-meta">
          ${task.dueDate ? `<span>Due: ${task.dueDate}</span>` : `<span>No due date</span>`}
          <span>•</span>
          <span>Effort: ${formatEffort(task.effort)}</span>
          <span>•</span>
          <span class="priority-badge ${priorityClass}">${task.priority.toUpperCase()}</span>
        </div>
        ${task.description ? `
  <div class="focus-desc-wrap">
    <p class="focus-desc">${escapeHtml(task.description)}</p>
    <button class="desc-toggle" data-action="toggle-focus-desc" data-id="${task.id}">More</button>
  </div>` : ''}

      </div>

      <div class="focus-right">
        <button id="complete-focus-task" class="primary">Mark as Done</button>
      </div>
    </div>
  `;
  container.appendChild(card);

  const btn = document.getElementById("complete-focus-task");
  if (btn) {
    btn.onclick = () => {
      const t = tasks.find(x => x.id === task.id);
      if (t) {
        t.status = "completed";
        if (focusedTaskId === t.id) { focusedTaskId = null; saveFocusedTaskId(); }
        saveTasks(); render();
      }
    };
     container.appendChild(card);

  // Make focus-card More/Less work reliably
  const focusToggleBtn = card.querySelector('.desc-toggle');
  if (focusToggleBtn) {
    focusToggleBtn.addEventListener('click', function(ev) {
      ev.stopPropagation();
      toggleDescriptionExpandByElement(card);
      // recalc visibility for all toggles after layout changes
      setTimeout(updateDescToggles, 50);
    });
  }

  }
}

/* ---------- Warnings ---------- */
function updateWarnings(){
  const loadEl = document.getElementById("load-warning");
  const priorityEl = document.getElementById("priority-warning");
  const overdueEl = document.getElementById("overdue-warning");
  const deepWorkTasks = tasks.filter(t => t.status === "pending" && t.effort === "deep");
  const highPriority = tasks.filter(t => t.status === "pending" && t.priority === "high");
  const overdueTasks = tasks.filter(t => t.status === "pending" && t.dueDate && t.dueDate < new Date().toISOString().split("T")[0]);

  if (loadEl) {
    if (deepWorkTasks.length > 5) { loadEl.textContent = "You have many Deep Work tasks scheduled. Consider breaking or postponing some to reduce overload."; loadEl.classList.remove("hidden"); }
    else loadEl.classList.add("hidden");
  }
  if (priorityEl) {
    if (highPriority.length > 3) { priorityEl.textContent = "Too many tasks marked High Priority. Pick a true top 3 to gain clarity."; priorityEl.classList.remove("hidden"); }
    else priorityEl.classList.add("hidden");
  }
  if (overdueEl) {
    if (overdueTasks.length > 0) { overdueEl.textContent = `⚠️ You have ${overdueTasks.length} overdue task(s). Please check your schedule.`; overdueEl.classList.remove("hidden"); }
    else overdueEl.classList.add("hidden");
  }
}

/* ---------- Persistence ---------- */
function saveTasks(){ try { localStorage.setItem("tasks_v1", JSON.stringify(tasks)); } catch(e){} }
function loadTasks(){ try { const raw = localStorage.getItem("tasks_v1"); tasks = raw ? JSON.parse(raw) : []; } catch { tasks = []; } }

/* ---------- Utilities ---------- */
function formatEffort(v){ if (!v) return "No effort"; return v === "deep" ? "Deep work" : `${v} min`; }
function escapeHtml(str){ return String(str||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function scrollIntoViewIfNeeded(id){ setTimeout(()=>{ document.getElementById(id)?.scrollIntoView({behavior:"smooth", block:"center"}); },80); }

/* ---------- Custom select initializer ---------- */
function initCustomSelect(id, onChange) {
  const custom = document.getElementById(id);
  if (!custom) return null;
  const toggle = custom.querySelector(".custom-select-toggle");
  const valueEl = custom.querySelector(".custom-select-value");
  const list = custom.querySelector(".custom-select-options");
  const options = Array.from(custom.querySelectorAll(".option"));

  function setValue(val, label, triggerChange=true) {
    custom.dataset.value = String(val);
    if (valueEl) valueEl.textContent = label;
    options.forEach(opt => opt.classList.toggle("selected", opt.dataset.value === String(val)));
    if (triggerChange && typeof onChange === "function") { try { onChange(String(val), label); } catch(e) {} }
  }
  function open() { custom.classList.add("open"); if (list) list.setAttribute("aria-hidden","false"); }
  function close() { custom.classList.remove("open"); if (list) list.setAttribute("aria-hidden","true"); }
  function toggleOpen() { if (custom.classList.contains("open")) close(); else open(); }

  const initial = custom.dataset.value || (options[0] && options[0].dataset.value) || "all";
  const initialOption = options.find(o => o.dataset.value === String(initial));
  if (initialOption) setValue(initialOption.dataset.value, initialOption.textContent.trim(), false);
  else setValue(options[0]?.dataset.value || "all", options[0]?.textContent.trim() || "All", false);

  if (toggle) toggle.addEventListener("click", (e)=>{ e.stopPropagation(); toggleOpen(); });
  options.forEach(opt => opt.addEventListener("click", (e)=> { e.stopPropagation(); setValue(opt.dataset.value, opt.textContent.trim(), true); close(); }));

  document.addEventListener("click", (e) => { if (!custom.contains(e.target)) close(); });
  custom.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleOpen(); } if (e.key === "Escape") close(); });

  return { getValue: () => String(custom.dataset.value), setValue: (v) => { const o = options.find(x => x.dataset.value === String(v)); if (o) setValue(o.dataset.value, o.textContent.trim(), true); } };
}

/* ---------- Description expand/collapse helpers ---------- */
function toggleDescriptionExpandByElement(container) {
  if (!container) return;
  const desc = container.querySelector('.task-desc, .recommend-desc, .focus-desc');
  const toggleBtn = container.querySelector('.desc-toggle');
  if (!desc || !toggleBtn) return;
  const isExpanded = desc.classList.toggle('expanded');
  toggleBtn.textContent = isExpanded ? 'Less' : 'More';
  toggleBtn.classList.add('visible');
  setTimeout(updateDescToggles,50);
}

/* Show/hide More only when clipped (and keep visible when expanded) */
function updateDescToggles() {
  document.querySelectorAll('.desc-wrap').forEach(wrap => {
    const desc = wrap.querySelector('.task-desc, .recommend-desc');
    const btn  = wrap.querySelector('.desc-toggle');
    if (!desc || !btn) return;

    // If expanded → always show button
    if (desc.classList.contains('expanded')) {
      btn.classList.add("visible");
      btn.textContent = "Less";
      return;
    }

    // Measure collapsed content
    desc.classList.remove('expanded');
    const clipped = desc.scrollHeight > desc.clientHeight + 2;

    if (clipped) {
      btn.classList.add("visible");
      btn.textContent = "More";
    } else {
      btn.classList.remove("visible");
    }
  });
}
