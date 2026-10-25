const EXAMPLE_CSV = `Criterio;Pregunta;Aspecto evaluado;Nivel insuficiente (0%);Puntos 0%;Nivel básico (25%);Puntos 25%;Nivel adecuado (50%);Puntos 50%;Nivel notable (75%);Puntos 75%;Nivel excelente (100%);Puntos 100%;Máximo;Puntuación obtenida
CE1.1;P1. Definición del problema;Define el problema tecnológico y lo diferencia de una posible solución.;No identifica el problema o propone directamente una solución.;0;Identifica parcialmente el problema, pero lo formula de forma incompleta o confunde problema y solución.;0,5;Define correctamente el problema, aunque con alguna imprecisión.;1;Define claramente el problema y lo diferencia de la solución.;1,5;Define con precisión el problema, necesidad u oportunidad y lo diferencia claramente de posibles soluciones.;2;2;
CE1.1;P2. Requisitos y restricciones;Identifica requisitos y restricciones del sistema.;No identifica requisitos ni restricciones válidos.;0;Identifica solo uno o dos elementos, con confusiones importantes.;0,5;Identifica varios requisitos y restricciones, aunque falta algún elemento o hay alguna imprecisión.;1;Identifica correctamente los requisitos y restricciones principales.;1,5;Identifica y distingue correctamente los requisitos y restricciones relevantes, relacionándolos con el caso.;2;2;`;

const $ = (s) => document.querySelector(s);
const state = { rubric: [], students: [], active: null, group: "", activity: "", mode: "full", quick: 0 };

function clean(v) { return String(v ?? "").replace(/\r/g, "").trim(); }
function number(v) {
  const s = clean(v).replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function splitLine(line, delimiter) {
  const out = []; let value = ""; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i], next = line[i + 1];
    if (ch === '"') {
      if (quoted && next === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === delimiter && !quoted) { out.push(value); value = ""; }
    else value += ch;
  }
  out.push(value);
  return out;
}

const EXPECTED_HEADERS = [
  "Criterio","Pregunta","Aspecto evaluado",
  "Nivel insuficiente (0%)","Puntos 0%",
  "Nivel básico (25%)","Puntos 25%",
  "Nivel adecuado (50%)","Puntos 50%",
  "Nivel notable (75%)","Puntos 75%",
  "Nivel excelente (100%)","Puntos 100%",
  "Máximo","Puntuación obtenida"
];
function parseNumeric(value) {
  const raw = clean(value);
  if (!raw) return null;
  const normalized = raw.replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const result = Number(normalized);
  return Number.isFinite(result) ? result : null;
}
function validateCSV(text) {
  const errors = [], warnings = [];
  const lines = String(text || "").replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n").filter(line => line.trim());
  if (!lines.length) return { errors: ["Pega el contenido CSV para empezar."], warnings: [], rows: 0, total: 0 };
  const delimiter = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ";" : ",";
  const headers = splitLine(lines[0], delimiter).map(clean);
  if (headers.length !== EXPECTED_HEADERS.length || headers.some((h, i) => h !== EXPECTED_HEADERS[i])) {
    errors.push("La cabecera debe contener exactamente las 15 columnas esperadas, en el orden indicado.");
    const missing = EXPECTED_HEADERS.filter(h => !headers.includes(h));
    if (missing.length) warnings.push("Faltan columnas: " + missing.join(", ") + ".");
    const extra = headers.filter(h => !EXPECTED_HEADERS.includes(h));
    if (extra.length) warnings.push("Hay columnas no reconocidas: " + extra.join(", ") + ".");
    const wrongOrder = headers.length === EXPECTED_HEADERS.length && headers.every(h => EXPECTED_HEADERS.includes(h));
    if (wrongOrder) warnings.push("Los nombres de las columnas están, pero su orden no coincide con el formato requerido.");
  }
  const duplicates = headers.filter((h, i) => headers.indexOf(h) !== i);
  if (duplicates.length) errors.push("Hay encabezados duplicados: " + [...new Set(duplicates)].join(", ") + ".");
  if (lines.length < 2) errors.push("El CSV debe contener al menos una fila de rúbrica además de la cabecera.");
  const index = Object.fromEntries(headers.map((h, i) => [h, i]));
  const seen = new Set();
  let total = 0;
  const pointPairs = [["Puntos 0%",0],["Puntos 25%",25],["Puntos 50%",50],["Puntos 75%",75],["Puntos 100%",100]];
  lines.slice(1).forEach((line, i) => {
    const rowNum = i + 2, row = splitLine(line, delimiter);
    if (row.length !== headers.length) {
      errors.push("Fila " + rowNum + ": contiene " + row.length + " campos; se esperaban " + headers.length + ".");
      return;
    }
    const get = h => clean(row[index[h]]);
    ["Criterio","Pregunta","Aspecto evaluado"].forEach(h => {
      if (!get(h)) errors.push("Fila " + rowNum + ": el campo «" + h + "» está vacío.");
    });
    ["Nivel insuficiente (0%)","Nivel básico (25%)","Nivel adecuado (50%)","Nivel notable (75%)","Nivel excelente (100%)"].forEach(h => {
      if (!get(h)) warnings.push("Fila " + rowNum + ": falta el descriptor «" + h + "».");
    });
    const max = parseNumeric(get("Máximo"));
    if (max === null || max <= 0) errors.push("Fila " + rowNum + ": «Máximo» debe ser un número mayor que cero.");
    else total += max;
    const points = pointPairs.map(([h,pct]) => ({header:h,pct,value:parseNumeric(get(h))}));
    points.forEach(p => {
      if (p.value === null) errors.push("Fila " + rowNum + ": «" + p.header + "» debe contener una puntuación numérica.");
    });
    if (points.every(p => p.value !== null) && max !== null && max > 0) {
      points.forEach(p => {
        const expected = max * p.pct / 100;
        if (Math.abs(p.value - expected) > 0.011) errors.push("Fila " + rowNum + ": " + p.header + " debería ser " + format(expected) + " para un máximo de " + format(max) + ".");
      });
      if (points[0].value !== 0) errors.push("Fila " + rowNum + ": la puntuación del nivel 0 % debe ser 0.");
      for (let j = 1; j < points.length; j++) {
        if (points[j].value < points[j-1].value) errors.push("Fila " + rowNum + ": las puntuaciones de los niveles deben ser crecientes.");
      }
      if (Math.abs(points[4].value - max) > 0.011) errors.push("Fila " + rowNum + ": «Puntos 100%» debe coincidir con «Máximo».");
    }
    if (get("Puntuación obtenida")) warnings.push("Fila " + rowNum + ": «Puntuación obtenida» no está vacía; se recomienda dejarla en blanco en la plantilla.");
    const key = [get("Pregunta").toLowerCase(), get("Aspecto evaluado").toLowerCase()].join("|");
    if (get("Pregunta") && get("Aspecto evaluado") && seen.has(key)) warnings.push("Fila " + rowNum + ": parece repetir una combinación de pregunta y aspecto evaluado.");
    seen.add(key);
  });
  if (lines.length > 1 && total > 0) warnings.push("La puntuación máxima total de la rúbrica es " + format(total) + " puntos. Comprueba que coincide con la actividad.");
  return { errors:[...new Set(errors)], warnings:[...new Set(warnings)], rows:Math.max(0,lines.length-1), total };
}
function renderValidation(result) {
  const panel = $("#validationPanel");
  if (!panel) return;
  if (!$("#csvInput").value.trim()) { panel.innerHTML = ""; panel.className = "validation-panel hidden"; return; }
  panel.className = "validation-panel " + (result.errors.length ? "has-errors" : result.warnings.length ? "has-warnings" : "is-valid");
  const heading = result.errors.length ? "Hay errores que debes corregir" : result.warnings.length ? "CSV válido con advertencias" : "CSV validado correctamente";
  const messages = [...result.errors.map(x => ({type:"error",text:x})), ...result.warnings.map(x => ({type:"warning",text:x}))];
  panel.innerHTML = "<div class='validation-heading'><strong>" + escapeHTML(heading) + "</strong><span>" + result.rows + " filas · " + format(result.total) + " puntos máximos</span></div>" +
    (messages.length ? "<ul>" + messages.map(m => "<li class='" + m.type + "'>" + escapeHTML(m.text) + "</li>").join("") + "</ul>" : "<p>Cabecera, estructura y puntuaciones correctas.</p>");
}

function parseCSV(text) {
  const lines = clean(text).split("\n").filter(x => x.trim());
  if (lines.length < 2) throw new Error("El CSV debe contener una cabecera y al menos una pregunta.");
  const delimiter = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ";" : ",";
  const headers = splitLine(lines[0], delimiter).map(clean);
  const index = Object.fromEntries(headers.map((h, i) => [h, i]));
  ["Criterio", "Pregunta", "Aspecto evaluado"].forEach(h => {
    if (index[h] === undefined) throw new Error("Falta la columna: " + h);
  });
  const definitions = [
    ["0", "Insuficiente", 0, "Nivel insuficiente (0%)", "Puntos 0%"],
    ["25", "Básico", 25, "Nivel básico (25%)", "Puntos 25%"],
    ["50", "Adecuado", 50, "Nivel adecuado (50%)", "Puntos 50%"],
    ["75", "Notable", 75, "Nivel notable (75%)", "Puntos 75%"],
    ["100", "Excelente", 100, "Nivel excelente (100%)", "Puntos 100%"]
  ];
  return lines.slice(1).map((line, i) => {
    const row = splitLine(line, delimiter);
    const levels = definitions.map(([key, label, pct, descCol, pointsCol]) => ({
      key, label, pct,
      description: clean(row[index[descCol]]),
      points: number(row[index[pointsCol]])
    }));
    return {
      id: "q" + i,
      competency: clean(row[index["Competencia"]] || row[index["Competencia específica"]] || row[index["Competencias específicas"]] || ""),
      criterion: clean(row[index["Criterio"]]),
      question: clean(row[index["Pregunta"]]),
      aspect: clean(row[index["Aspecto evaluado"]]),
      levels,
      max: index["Máximo"] !== undefined ? number(row[index["Máximo"]]) : Math.max(...levels.map(x => x.points))
    };
  });
}
function escapeHTML(v) {
  return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function format(v) { return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(v); }
function uid() { return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function current() { return state.students.find(s => s.id === state.active) || null; }
function selections(student) { return new Map(student?.selections || []); }
function grouped() {
  const result = new Map();
  state.rubric.forEach(q => {
    if (!result.has(q.criterion)) result.set(q.criterion, []);
    result.get(q.criterion).push(q);
  });
  return result;
}
function competencyResults(student) {
  const sel = selections(student), groups = new Map();
  state.rubric.forEach(q => { const name = q.competency || q.criterion || "Sin competencia"; if (!groups.has(name)) groups.set(name, []); groups.get(name).push(q); });
  return [...groups].map(([name, items]) => { const max = items.reduce((s,q)=>s+q.max,0); const got = items.reduce((s,q)=>s+(sel.get(q.id)?.points||0),0); return {name,max,got,pct:max?got/max*100:0,evaluated:items.filter(q=>sel.has(q.id)).length,total:items.length}; });
}
function criterionEvidence(student, items, criterion) {
  const sel = selections(student);
  const evaluatedItems = items.filter(q => sel.has(q.id));
  const pendingItems = items.filter(q => !sel.has(q.id));
  const maxEvaluated = evaluatedItems.reduce((sum, q) => sum + q.max, 0);
  const got = evaluatedItems.reduce((sum, q) => sum + (sel.get(q.id)?.points || 0), 0);
  const pct = maxEvaluated ? got / maxEvaluated * 100 : null;
  const status = evaluatedItems.length === 0 ? "Sin evaluar" : pendingItems.length > 0 ? "Evaluación parcial" : "Evaluación completa";
  return { criterion, items, evaluatedItems, pendingItems, evaluated:evaluatedItems.length, total:items.length, got, maxEvaluated, pct, status };
}
function totals(student) {
  const sel = selections(student);
  const max = state.rubric.reduce((a, q) => a + q.max, 0);
  const got = state.rubric.reduce((a, q) => a + (sel.get(q.id)?.points || 0), 0);
  const evaluated = state.rubric.filter(q => sel.has(q.id)).length;
  return { max, got, evaluated, total: state.rubric.length, pct: max ? got / max * 100 : 0, progress: state.rubric.length ? evaluated / state.rubric.length * 100 : 0 };
}
function save() {
  try {
    localStorage.setItem("rubricas-app-v3", JSON.stringify({
      csv: $("#csvInput")?.value || "",
      rubric: state.rubric,
      students: state.students,
      active: state.active,
      group: state.group,
      activity: state.activity
    }));
    const status = $("#saveStatus");
    if (status) { status.textContent = "Guardado automáticamente en este navegador"; status.classList.remove("save-error"); }
  } catch (error) {
    const status = $("#saveStatus");
    if (status) { status.textContent = "No se pudo guardar automáticamente"; status.classList.add("save-error"); }
  }
}
function notify(message) {
  const box = $("#toast"); box.textContent = message; box.classList.add("show");
  clearTimeout(notify.timer); notify.timer = setTimeout(() => box.classList.remove("show"), 2200);
}
function view(id) {
  document.querySelectorAll(".view").forEach(x => x.classList.add("hidden"));
  $("#" + id).classList.remove("hidden");
  document.querySelectorAll(".nav-btn").forEach(x => x.classList.toggle("active", x.dataset.view === id));
}
function addStudent(name) {
  name = clean(name); if (!name) return;
  const student = { id: uid(), name, selections: [] };
  state.students.push(student); state.active = student.id; save(); renderStudents(); renderEvaluation(); notify("Alumno añadido");
}
function removeStudent(id) {
  const student = state.students.find(s => s.id === id); if (!student) return;
  if (!confirm("¿Eliminar a " + student.name + " y toda su evaluación?")) return;
  state.students = state.students.filter(s => s.id !== id);
  state.active = state.students[0]?.id || null; save(); renderStudents();
  if (state.active) renderEvaluation();
}
function updateScore() {
  const student = current(); if (!student) return;
  const t = totals(student);
  $("#scoreObtained").textContent = format(t.got);
  $("#scoreMax").textContent = format(t.max);
  $("#scorePercent").textContent = format(t.pct);
  $("#progressText").textContent = t.evaluated + " / " + t.total + " preguntas evaluadas";
  $("#progressPercent").textContent = Math.round(t.progress) + "%";
  $("#progressFill").style.width = t.progress + "%";
  $("#activeStudentName").textContent = student.name;
  $("#groupName").value = state.group;
  $("#activityName").value = state.activity;
  const summary = $("#criterionSummary"); summary.innerHTML = "";
  grouped().forEach((items, criterion) => {
    const sel = selections(student);
    const max = items.reduce((a, q) => a + q.max, 0);
    const got = items.reduce((a, q) => a + (sel.get(q.id)?.points || 0), 0);
    const pill = document.createElement("div");
    pill.className = "criterion-pill";
    pill.innerHTML = escapeHTML(criterion) + " <strong>" + format(max ? got / max * 100 : 0) + "%</strong>";
    summary.appendChild(pill);
  });
}
function choose(qid, key) {
  const student = current(); if (!student) return;
  const question = state.rubric.find(q => q.id === qid);
  const level = question.levels.find(l => l.key === key);
  const sel = selections(student); sel.set(qid, level); student.selections = [...sel];
  save(); renderEvaluation();
}
function makeLevelButton(question, level, selected) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "level-btn" + (selected ? " selected" : "");
  const name = document.createElement("span"); name.className = "level-name"; name.textContent = level.label + " · " + level.pct + "%";
  const points = document.createElement("span"); points.className = "level-points"; points.textContent = format(level.points) + " pt";
  const desc = document.createElement("span"); desc.className = "level-desc"; desc.textContent = level.description;
  button.append(name, points, desc); button.onclick = () => choose(question.id, level.key); return button;
}
function renderFull() {
  const box = $("#rubricContainer"); box.innerHTML = ""; box.classList.remove("hidden");
  $("#quickContainer").classList.add("hidden"); $("#resultsContainer").classList.add("hidden");
  $("#modeHelp").textContent = "Rúbrica completa";
  const sel = selections(current());
  grouped().forEach((items, criterion) => {
    const section = document.createElement("section"); section.className = "criterion-block";
    const head = document.createElement("div"); head.className = "criterion-head";
    const max = items.reduce((a, q) => a + q.max, 0), got = items.reduce((a, q) => a + (sel.get(q.id)?.points || 0), 0);
    head.innerHTML = "<h2 class='criterion-title'>" + escapeHTML(criterion) + "</h2><div class='criterion-meta'>" + items.filter(q => sel.has(q.id)).length + " / " + items.length + " evaluadas · " + format(got) + " / " + format(max) + " puntos</div>";
    section.appendChild(head);
    items.forEach(question => {
      const card = document.createElement("article"); card.className = "question-card";
      const top = document.createElement("div"); top.className = "question-top";
      const text = document.createElement("div");
      const title = document.createElement("h3"); title.className = "question-title"; title.textContent = question.question;
      const aspect = document.createElement("p"); aspect.className = "question-aspect"; aspect.textContent = question.aspect;
      text.append(title, aspect);
      const score = document.createElement("div"); score.className = "question-score"; score.textContent = (sel.get(question.id) ? format(sel.get(question.id).points) : "—") + " / " + format(question.max);
      top.append(text, score); card.appendChild(top);
      const grid = document.createElement("div"); grid.className = "level-grid";
      question.levels.forEach(level => grid.appendChild(makeLevelButton(question, level, sel.get(question.id)?.key === level.key)));
      card.appendChild(grid); section.appendChild(card);
    });
    box.appendChild(section);
  });
}
function renderQuick() {
  const box = $("#quickContainer"); box.innerHTML = ""; box.classList.remove("hidden");
  $("#rubricContainer").classList.add("hidden"); $("#resultsContainer").classList.add("hidden");
  $("#modeHelp").textContent = "Una pregunta cada vez";
  const question = state.rubric[state.quick] || state.rubric[0];
  if (!question) { box.textContent = "No hay preguntas."; return; }
  const sel = selections(current()), selected = sel.get(question.id);
  const head = document.createElement("div"); head.className = "quick-head";
  head.innerHTML = "<div><span class='eyebrow'>PREGUNTA " + (state.quick + 1) + " DE " + state.rubric.length + "</span><h2>" + escapeHTML(question.question) + "</h2><p>" + escapeHTML(question.criterion) + " · " + escapeHTML(question.aspect) + "</p></div><div class='quick-score'>" + (selected ? format(selected.points) : "—") + " / " + format(question.max) + "</div>";
  const levels = document.createElement("div"); levels.className = "quick-levels";
  question.levels.forEach(level => {
    const button = document.createElement("button"); button.type = "button"; button.className = "quick-level" + (selected?.key === level.key ? " selected" : "");
    button.innerHTML = "<span class='quick-level-top'><strong>" + level.label + "</strong><b>" + level.pct + "%</b></span><span class='quick-points'>" + format(level.points) + " puntos</span><span class='quick-description'>" + escapeHTML(level.description) + "</span>";
    button.onclick = () => { choose(question.id, level.key); if (state.quick < state.rubric.length - 1) state.quick++; renderQuick(); };
    levels.appendChild(button);
  });
  const nav = document.createElement("div"); nav.className = "quick-nav";
  const previous = document.createElement("button"); previous.className = "ghost-btn"; previous.textContent = "← Anterior";
  const counter = document.createElement("div"); counter.className = "quick-progress"; counter.textContent = (state.quick + 1) + " / " + state.rubric.length;
  const next = document.createElement("button"); next.className = "primary-btn"; next.textContent = "Siguiente →";
  previous.disabled = state.quick === 0; previous.onclick = () => { state.quick = Math.max(0, state.quick - 1); renderQuick(); };
  next.disabled = state.quick >= state.rubric.length - 1; next.onclick = () => { state.quick = Math.min(state.rubric.length - 1, state.quick + 1); renderQuick(); };
  nav.append(previous, counter, next);
  const shortcuts = document.createElement("p"); shortcuts.className = "quick-shortcuts";
  shortcuts.textContent = "Atajos: 1–5 para elegir un nivel · ← → para moverte entre preguntas. La selección se guarda automáticamente.";
  box.append(head, levels, nav, shortcuts);
}
function renderResults() {
  const box = $("#resultsContainer"); box.innerHTML = ""; box.classList.remove("hidden");
  $("#rubricContainer").classList.add("hidden"); $("#quickContainer").classList.add("hidden");
  $("#modeHelp").textContent = "Evidencias por criterio y resultados del alumno";
  const student = current(), t = totals(student), sel = selections(student);
  const grid = document.createElement("div"); grid.className = "results-grid";
  const hero = document.createElement("div"); hero.className = "result-hero card";
  hero.innerHTML = "<span class='eyebrow'>RESULTADO GLOBAL</span><strong>" + format(t.pct) + "%</strong><span>" + format(t.got) + " / " + format(t.max) + " puntos máximos</span><div class='result-progress'><div style='width:" + t.pct + "%'></div></div><p class='result-coverage'>" + t.evaluated + " de " + t.total + " aspectos evaluados. Los aspectos pendientes cuentan como no puntuados en el resultado global.</p>";
  const tableCard = document.createElement("div"); tableCard.className = "card results-table-wrap";
  tableCard.innerHTML = "<h2>Resultados por criterio</h2><p class='table-note'>El porcentaje y la puntuación se calculan solo con los aspectos evaluados. El estado indica únicamente si hay aspectos pendientes; no asigna niveles automáticos de adquisición competencial.</p>";
  const table = document.createElement("table"); table.className = "results-table";
  table.innerHTML = "<thead><tr><th>Criterio</th><th>Evidencias</th><th>Puntuación evaluada</th><th>Logro</th><th>Lectura orientativa</th></tr></thead>";
  const body = document.createElement("tbody");
  grouped().forEach((items, criterion) => {
    const result = criterionEvidence(student, items, criterion);
    const evidenceNames = result.evaluatedItems.map(q => q.question).join(", ") || "Ninguna todavía";
    const pending = result.pendingItems.length ? "<small class='pending-note'>" + result.pendingItems.length + " pendiente(s)</small>" : "<small class='pending-note'>Todo evaluado</small>";
    const pct = result.pct === null ? "—" : format(result.pct) + "%";
    const row = document.createElement("tr");
    row.innerHTML = "<td><strong>" + escapeHTML(criterion) + "</strong></td><td><span class='evidence-list'>" + escapeHTML(evidenceNames) + "</span>" + pending + "</td><td>" + format(result.got) + " / " + format(result.maxEvaluated) + "</td><td><strong>" + pct + "</strong></td><td><span class='evidence-status'>" + escapeHTML(result.status) + "</span></td>";
    body.appendChild(row);
  });
  table.appendChild(body); tableCard.appendChild(table); grid.append(hero, tableCard); box.appendChild(grid);

  const actions = document.createElement("div"); actions.className = "card backup-card";
  actions.innerHTML = "<h2>Informes y exportación</h2><p>Personaliza el PDF individual o genera un resumen de toda la clase.</p>";
  const options = document.createElement("div"); options.className = "report-options";
  options.innerHTML = "<label><input type='checkbox' id='reportIncludeSummary' checked> Resumen por criterio</label><label><input type='checkbox' id='reportIncludeRubric' checked> Tabla detallada de la rúbrica</label><label class='report-observation'><span>Retroalimentación y observaciones para el alumno</span><textarea id='reportObservations' rows='8' placeholder='Genera una propuesta basada en las evidencias y edítala antes de incluirla en el PDF…'></textarea></label><div class='button-row feedback-actions'><button type='button' class='ghost-btn' id='generateShortFeedbackBtn'>Generar versión breve · Moodle</button><button type='button' class='ghost-btn' id='generateLongFeedbackBtn'>Generar versión ampliada · PDF</button></div><p class='table-note'>Elige el formato según el uso. La propuesta se basa en las evidencias evaluadas; revísala y edítala antes de copiarla o incluirla en el PDF.</p>";
  actions.appendChild(options);
  options.querySelector("#generateShortFeedbackBtn").onclick = () => {
    options.querySelector("#reportObservations").value = generateFeedbackDraft(student, "short");
    notify("Versión breve para Moodle generada.");
  };
  options.querySelector("#generateLongFeedbackBtn").onclick = () => {
    options.querySelector("#reportObservations").value = generateFeedbackDraft(student, "long");
    notify("Versión ampliada para el PDF generada.");
  };
  const buttons = document.createElement("div"); buttons.className = "button-row";
  [["PDF individual",printStudentRubric],["PDF del grupo",printClassReport],["CSV del alumno",()=>downloadStudent(student)],["CSV de toda la clase",downloadClass],["Sesión JSON",downloadJSON]].forEach(([label,fn])=>{const b=document.createElement("button");b.className="ghost-btn";b.textContent=label;b.onclick=fn;buttons.appendChild(b)});
  actions.appendChild(buttons); box.appendChild(actions);

}
function renderDashboard() {
  const host = $("#dashboardContent");
  if (!host) return;
  if (!state.rubric.length || !state.students.length) {
    host.innerHTML = "<div class='card dashboard-empty'><h2>Aún no hay datos suficientes</h2><p>Carga una rúbrica y añade al alumnado para consultar el panel del grupo.</p></div>";
    return;
  }
  const studentFilter = $("#dashboardStudentFilter"), criterionFilter = $("#dashboardCriterionFilter"), statusFilter = $("#dashboardStatusFilter");
  const oldStudent = studentFilter.value, oldCriterion = criterionFilter.value, oldStatus = statusFilter.value;
  studentFilter.innerHTML = "<option value='all'>Todo el alumnado</option>" + state.students.map(st => "<option value='" + escapeHTML(st.id) + "'>" + escapeHTML(st.name) + "</option>").join("");
  criterionFilter.innerHTML = "<option value='all'>Todos los criterios</option>" + [...grouped().keys()].map(c => "<option value='" + escapeHTML(c) + "'>" + escapeHTML(c) + "</option>").join("");
  studentFilter.value = state.students.some(st => st.id === oldStudent) ? oldStudent : "all";
  criterionFilter.value = [...grouped().keys()].includes(oldCriterion) ? oldCriterion : "all";
  statusFilter.value = ["all","none","partial","complete"].includes(oldStatus) ? oldStatus : "all";
  const students = state.students.filter(st => studentFilter.value === "all" || st.id === studentFilter.value);
  const criteria = [...grouped()].filter(([name]) => criterionFilter.value === "all" || name === criterionFilter.value);
  const allCells = students.flatMap(st => criteria.map(([criterion, items]) => criterionEvidence(st, items, criterion)));
  const totalAspects = allCells.reduce((sum, x) => sum + x.total, 0), evaluatedAspects = allCells.reduce((sum, x) => sum + x.evaluated, 0);
  const complete = allCells.filter(x => x.status === "Evaluación completa").length, pendingCells = allCells.filter(x => x.status !== "Evaluación completa").length;
  const coverage = totalAspects ? evaluatedAspects / totalAspects * 100 : 0;
  const stats = "<div class='dashboard-stats'>" +
    "<article class='card dashboard-stat'><span>ALUMNADO VISIBLE</span><strong>" + students.length + "</strong></article>" +
    "<article class='card dashboard-stat'><span>COBERTURA DE EVIDENCIAS</span><strong>" + format(coverage) + "%</strong><small>" + evaluatedAspects + " / " + totalAspects + " aspectos evaluados</small></article>" +
    "<article class='card dashboard-stat'><span>CRITERIOS COMPLETOS</span><strong>" + complete + "</strong><small>Combinaciones alumno-criterio</small></article>" +
    "<article class='card dashboard-stat'><span>CON TAREAS PENDIENTES</span><strong>" + pendingCells + "</strong><small>Combinaciones alumno-criterio</small></article></div>";
  const legend = "<div class='dashboard-legend'><span><i class='heat-none'></i> Sin evaluar</span><span><i class='heat-partial'></i> Evaluación parcial</span><span><i class='heat-complete'></i> Evaluación completa</span><small>El color representa el estado de evaluación, no el nivel competencial.</small></div>";
  const head = "<div class='dashboard-table-wrap'><table class='heatmap-table'><thead><tr><th>Alumno/a</th>" + criteria.map(([c]) => "<th>" + escapeHTML(c) + "</th>").join("") + "</tr></thead><tbody>";
  const body = students.map(st => {
    const cells = criteria.map(([criterion, items]) => {
      const r = criterionEvidence(st, items, criterion);
      const cls = r.evaluated === 0 ? "heat-none" : r.pendingItems.length ? "heat-partial" : "heat-complete";
      const matches = statusFilter.value === "all" || (statusFilter.value === "none" && r.evaluated === 0) || (statusFilter.value === "partial" && r.status === "Evaluación parcial") || (statusFilter.value === "complete" && r.status === "Evaluación completa");
      const pct = r.pct === null ? "—" : format(r.pct) + "%";
      return "<td><button type='button' class='heat-cell " + cls + (matches ? "" : " heat-dimmed") + "' data-student='" + escapeHTML(st.id) + "' data-criterion='" + escapeHTML(criterion) + "' title='" + escapeHTML(st.name + " · " + criterion + " · " + r.status) + "'><strong>" + pct + "</strong><span>" + r.evaluated + "/" + r.total + " evidencias</span><small>" + escapeHTML(r.status) + "</small></button></td>";
    }).join("");
    return "<tr><th class='heat-student'>" + escapeHTML(st.name) + "</th>" + cells + "</tr>";
  }).join("");
  const overviewRows = criteria.map(([criterion, items]) => {
    const evidence = students.map(st => criterionEvidence(st, items, criterion)).filter(x => x.pct !== null);
    const average = evidence.length ? evidence.reduce((sum, x) => sum + x.pct, 0) / evidence.length : null;
    const evaluated = evidence.reduce((sum, x) => sum + x.evaluated, 0), possible = students.length * items.length;
    return "<tr><td><strong>" + escapeHTML(criterion) + "</strong></td><td>" + evidence.length + " / " + students.length + "</td><td>" + (average === null ? "—" : format(average) + "%") + "</td><td>" + evaluated + " / " + possible + "</td></tr>";
  }).join("");
  const criterionAnalysis = criteria.map(([criterion, items]) => {
    const results = students.map(st => criterionEvidence(st, items, criterion)).filter(r => r.pct !== null);
    const average = results.length ? results.reduce((sum, r) => sum + r.pct, 0) / results.length : null;
    const below = results.filter(r => r.pct < 50).length;
    const lowShare = results.length ? below / results.length : 0;
    const evaluatedAspects = results.reduce((sum, r) => sum + r.evaluated, 0);
    const possibleAspects = students.length * items.length;
    let status = "Sin evidencias", statusClass = "diff-limited";
    if (results.length < 3) {
      status = "Muestra limitada"; statusClass = "diff-limited";
    } else if (average < 50 && lowShare >= 0.5) {
      status = "Prioridad de refuerzo"; statusClass = "diff-priority";
    } else if (average < 70 || lowShare >= 0.35) {
      status = "Revisar"; statusClass = "diff-review";
    } else if (average >= 75 && lowShare < 0.15) {
      status = "Consolidado"; statusClass = "diff-good";
    } else {
      status = "Seguimiento"; statusClass = "diff-watch";
    }
    return { criterion, items, results, average, below, lowShare, evaluatedAspects, possibleAspects, status, statusClass };
  });
  const assessedPairs = criterionAnalysis.reduce((sum, x) => sum + x.results.length, 0);
  const lowPairs = criterionAnalysis.reduce((sum, x) => sum + x.below, 0);
  const priorityCount = criterionAnalysis.filter(x => x.status === "Prioridad de refuerzo").length;
  const consolidatedCount = criterionAnalysis.filter(x => x.status === "Consolidado").length;
  const difficultyStats = "<div class='difficulty-stats'>" +
    "<article class='card difficulty-stat'><span>CRITERIOS PRIORITARIOS</span><strong>" + priorityCount + "</strong><small>Necesitan refuerzo según los resultados disponibles</small></article>" +
    "<article class='card difficulty-stat'><span>RESULTADOS INFERIORES AL 50%</span><strong>" + lowPairs + " / " + assessedPairs + "</strong><small>Combinaciones alumno-criterio evaluadas</small></article>" +
    "<article class='card difficulty-stat'><span>CRITERIOS CONSOLIDADOS</span><strong>" + consolidatedCount + "</strong><small>Buen resultado y pocas dificultades detectadas</small></article>" +
    "<article class='card difficulty-stat'><span>EVIDENCIAS DISPONIBLES</span><strong>" + assessedPairs + " / " + (students.length * criteria.length) + "</strong><small>Combinaciones alumno-criterio con datos</small></article></div>";
  const difficultyLegend = "<div class='difficulty-legend'><span><i class='difficulty-low'></i> Necesita refuerzo (&lt;50%)</span><span><i class='difficulty-mid'></i> En desarrollo (50–74%)</span><span><i class='difficulty-high'></i> Logro alto (75–100%)</span><span><i class='difficulty-pending'></i> Sin evidencias</span></div>";
  const difficultyRows = students.map(st => {
    const cells = criteria.map(([criterion, items]) => {
      const r = criterionEvidence(st, items, criterion);
      const cls = r.pct === null ? "difficulty-pending" : r.pct < 50 ? "difficulty-low" : r.pct < 75 ? "difficulty-mid" : "difficulty-high";
      const pct = r.pct === null ? "Sin datos" : format(r.pct) + "%";
      const title = st.name + " · " + criterion + " · " + r.status + " · " + r.evaluated + "/" + r.total + " aspectos evaluados";
      return "<td><button type='button' class='difficulty-cell " + cls + "' data-student='" + escapeHTML(st.id) + "' data-criterion='" + escapeHTML(criterion) + "' title='" + escapeHTML(title) + "'><strong>" + pct + "</strong><span>" + r.evaluated + "/" + r.total + " aspectos</span><small>" + (r.status === "Evaluación parcial" ? "Datos parciales" : r.status === "Sin evaluar" ? "Pendiente" : "Evaluación completa") + "</small></button></td>";
    }).join("");
    return "<tr><th class='heat-student'>" + escapeHTML(st.name) + "</th>" + cells + "</tr>";
  }).join("");
  const difficultyMap = "<section class='card dashboard-difficulty-map'><div class='card-head'><div><h2>Mapa de dificultades del grupo</h2><p>El color muestra el resultado sobre los aspectos evaluados de cada criterio. Selecciona una celda para consultar las evidencias del alumno.</p></div></div>" + difficultyLegend + "<div class='dashboard-table-wrap'><table class='difficulty-table'><thead><tr><th>Alumno/a</th>" + criteria.map(([c]) => "<th>" + escapeHTML(c) + "</th>").join("") + "</tr></thead><tbody>" + difficultyRows + "</tbody></table></div><p class='table-note'>Los aspectos pendientes no se consideran suspensos. Los porcentajes de cada celda se calculan solo con las evidencias evaluadas; los resultados parciales deben interpretarse con cautela.</p></section>";
  const priorityOrder = {"Prioridad de refuerzo":0,"Revisar":1,"Seguimiento":2,"Consolidado":3,"Muestra limitada":4,"Sin evidencias":5};
  const priorityRows = [...criterionAnalysis].sort((a, b) => {
    const orderDiff = priorityOrder[a.status] - priorityOrder[b.status];
    if (orderDiff !== 0) return orderDiff;
    return (a.average ?? Infinity) - (b.average ?? Infinity);
  }).map(x => {
    const lowText = x.results.length ? x.below + " / " + x.results.length + " (" + format(x.lowShare * 100) + "%)" : "—";
    const averageText = x.average === null ? "—" : format(x.average) + "%";
    const coverage = x.possibleAspects ? x.evaluatedAspects / x.possibleAspects * 100 : 0;
    return "<tr><td><strong>" + escapeHTML(x.criterion) + "</strong></td><td>" + averageText + "</td><td>" + lowText + "</td><td>" + x.results.length + " / " + students.length + "</td><td>" + x.evaluatedAspects + " / " + x.possibleAspects + " (" + format(coverage) + "%)</td><td><span class='difficulty-badge " + x.statusClass + "'>" + escapeHTML(x.status) + "</span></td></tr>";
  }).join("");
  const priorityTable = "<section class='card dashboard-priorities'><h2>Prioridades de refuerzo por criterio</h2><p class='table-note'>El orden de lectura combina el promedio, la proporción de resultados inferiores al 50% y la cantidad de evidencias disponibles. Con menos de tres alumnos evaluados, la muestra se marca como limitada.</p><div class='dashboard-table-wrap'><table class='results-table'><thead><tr><th>Criterio</th><th>Promedio</th><th>Resultados &lt;50%</th><th>Alumnado con datos</th><th>Cobertura de aspectos</th><th>Lectura orientativa</th></tr></thead><tbody>" + priorityRows + "</tbody></table></div></section>";
  host.innerHTML = stats + difficultyStats + difficultyMap + priorityTable + "<section class='card dashboard-heatmap'><div class='card-head'><div><h2>Mapa de evaluación</h2><p>Selecciona una celda para abrir los resultados de ese alumno.</p></div></div>" + legend + head + body + "</tbody></table></div></section>" +
    "<section class='card dashboard-criteria'><h2>Cobertura de evaluación por criterio</h2><p class='table-note'>El promedio solo incluye alumnado con evidencias evaluadas. No se interpreta como un nivel automático de adquisición competencial.</p><div class='dashboard-table-wrap'><table class='results-table'><thead><tr><th>Criterio</th><th>Alumnado con evidencias</th><th>Promedio sobre lo evaluado</th><th>Aspectos evaluados</th></tr></thead><tbody>" + overviewRows + "</tbody></table></div></section>";
  host.querySelectorAll(".heat-cell").forEach(button => button.addEventListener("click", () => {
    state.active = button.dataset.student; state.mode = "results"; view("rubricView"); renderEvaluation();
  }));
  host.querySelectorAll(".difficulty-cell").forEach(button => button.addEventListener("click", () => {
    state.active = button.dataset.student; state.mode = "results"; view("rubricView"); renderEvaluation();
  }));
}
function generateFeedbackDraft(student, formatType = "short") {
  const sel = selections(student);
  const evaluated = state.rubric.filter(q => sel.has(q.id));
  if (!evaluated.length) return "Aún no hay evidencias evaluadas suficientes para redactar una devolución.";
  const pending = state.rubric.filter(q => !sel.has(q.id));
  const limit = formatType === "short" ? 1 : 3;
  const strengths = evaluated.filter(q => (sel.get(q.id)?.pct ?? 0) >= 75).slice(0, limit);
  const improvements = evaluated.filter(q => (sel.get(q.id)?.pct ?? 0) <= 25).slice(0, limit);
  const developing = evaluated.filter(q => (sel.get(q.id)?.pct ?? 0) > 25 && (sel.get(q.id)?.pct ?? 0) < 75).slice(0, 3);
  const itemText = q => q.question + ": " + (sel.get(q.id)?.description || sel.get(q.id)?.label || "nivel seleccionado");
  let draft = formatType === "short"
    ? "RETROALIMENTACIÓN PARA MOODLE · " + student.name + "\n"
    : "RETROALIMENTACIÓN INDIVIDUAL · " + student.name + "\n";
  if (strengths.length) draft += (formatType === "short" ? "\nLO QUE HACES BIEN\n" : "\nFORTALEZAS OBSERVADAS\n") + strengths.map(itemText).map(x => "• " + x).join("\n") + "\n";
  if (improvements.length) draft += (formatType === "short" ? "\nQUÉ MEJORAR\n" : "\nASPECTOS PRIORITARIOS DE MEJORA\n") + improvements.map(itemText).map(x => "• " + x).join("\n") + "\n";
  if (formatType === "long" && developing.length) draft += "\nAPRENDIZAJES EN DESARROLLO\n" + developing.map(itemText).map(x => "• " + x).join("\n") + "\n";
  if (!strengths.length && !improvements.length && !(formatType === "long" && developing.length)) {
    draft += "\nVas avanzando en los aspectos evaluados. Revisa los descriptores de la rúbrica para identificar qué puedes consolidar.\n";
  }
  draft += formatType === "short"
    ? "\nSIGUIENTE PASO\n" + (improvements.length ? "Revisa el aspecto señalado y comprueba que la mejora se refleja en tu próxima respuesta." : "Aplica lo aprendido en la próxima tarea y sigue justificando tus decisiones.")
    : "\nPROPUESTA DE SIGUIENTE PASO\n" + (improvements.length ? "Compara tu respuesta con los descriptores de la rúbrica, corrige primero los aspectos prioritarios y comprueba la mejora en la siguiente entrega." : "Consolida los aprendizajes demostrados y aplícalos de forma autónoma en una nueva tarea.");
  if (pending.length) draft += "\n\nEVALUACIÓN PROVISIONAL: quedan " + pending.length + " aspecto(s) sin evaluar.";
  return draft;
}
function renderEvaluation() {
  if (!current()) return;
  updateScore();
  if (state.mode === "full") renderFull(); else if (state.mode === "quick") renderQuick(); else renderResults();
}
function renderStudents() {
  const grid = $("#studentGrid"); grid.innerHTML = "";
  $("#classSubtitle").textContent = state.students.length + " alumno" + (state.students.length === 1 ? "" : "s") + " · " + state.rubric.length + " preguntas";
  state.students.forEach(student => {
    const t = totals(student), card = document.createElement("article"); card.className = "student-card";
    card.innerHTML = "<div class='student-card-top'><div class='avatar'>" + escapeHTML(student.name.charAt(0).toUpperCase()) + "</div><button class='icon-btn'>×</button></div><h3>" + escapeHTML(student.name) + "</h3><div class='student-result'><strong>" + format(t.pct) + "%</strong><span>" + format(t.got) + " / " + format(t.max) + " puntos</span></div><div class='mini-progress'><div style='width:" + t.progress + "%'></div></div><div class='student-card-meta'>" + t.evaluated + " / " + t.total + " preguntas evaluadas</div><button class='primary-btn full-btn'>Evaluar</button>";
    card.querySelector(".icon-btn").onclick = () => removeStudent(student.id);
    card.querySelector(".full-btn").onclick = () => { state.active = student.id; state.mode = "full"; view("rubricView"); renderEvaluation(); };
    grid.appendChild(card);
  });
}
function download(filename, content, type="text/csv;charset=utf-8") {
  const blob = new Blob(["\ufeff" + content], {type}), url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}
function csvValue(v) { return '"' + String(v ?? "").replaceAll('"', '""') + '"'; }
function downloadStudent(student) {
  const sel = selections(student), rows = [["Alumno","Grupo","Actividad","Criterio","Pregunta","Nivel","Porcentaje nivel","Puntuación","Máximo"]];
  state.rubric.forEach(q => { const l=sel.get(q.id); rows.push([student.name,state.group,state.activity,q.criterion,q.question,l?.label||"",l?.pct??"",l?.points??"",q.max]); });
  download("rubrica_"+student.name.replace(/[^a-z0-9áéíóúüñ_-]+/gi,"_")+".csv",rows.map(r=>r.map(csvValue).join(";")).join("\n"));
}
function downloadClass() {
  const rows=[["Alumno","Grupo","Actividad","Criterio","Pregunta","Nivel","Porcentaje nivel","Puntuación","Máximo"]];
  state.students.forEach(student=>{const sel=selections(student);state.rubric.forEach(q=>{const l=sel.get(q.id);rows.push([student.name,state.group,state.activity,q.criterion,q.question,l?.label||"",l?.pct??"",l?.points??"",q.max]);})});
  download("rubricas_clase.csv",rows.map(r=>r.map(csvValue).join(";")).join("\n"));
}
function printBlankRubric() {
  const title = state.activity ? "Rúbrica · " + state.activity : "Rúbrica de evaluación";
  const rows = state.rubric.map(q => {
    const levels = q.levels.map(l => "<td><strong>" + escapeHTML(l.label) + " (" + l.pct + "%)</strong><br>" + escapeHTML(l.description) + "<br><b>" + format(l.points) + " pt</b></td>").join("");
    return "<tr><td><strong>" + escapeHTML(q.criterion) + "</strong></td><td>" + escapeHTML(q.question) + "<br><small>" + escapeHTML(q.aspect) + "</small></td>" + levels + "</tr>";
  }).join("");
  openPrint("<div class='print-header'><div><h1>" + escapeHTML(title) + "</h1><p>Grupo: " + escapeHTML(state.group || "__________") + " &nbsp; · &nbsp; Alumno/a: ______________________________</p></div></div><table class='print-rubric'><thead><tr><th>Criterio</th><th>Pregunta / aspecto evaluado</th><th>Insuficiente<br>0%</th><th>Básico<br>25%</th><th>Adecuado<br>50%</th><th>Notable<br>75%</th><th>Excelente<br>100%</th></tr></thead><tbody>" + rows + "</tbody></table><div class='print-footer'>Puntuación obtenida: __________ / " + format(state.rubric.reduce((s,q)=>s+q.max,0)) + " &nbsp;&nbsp;&nbsp; Nota: ______ / 10</div>", "blank");
}
function printStudentRubric() {
  try {
    const student = current();
    if (!student) { notify("No hay ningún alumno seleccionado."); return; }
    const sel = selections(student), t = totals(student);
    const grade = t.pct / 10;
    const includeSummary = $("#reportIncludeSummary") ? $("#reportIncludeSummary").checked : true;
    const includeRubric = $("#reportIncludeRubric") ? $("#reportIncludeRubric").checked : true;
    const observations = clean($("#reportObservations")?.value || "");
    const criterionRows = [...grouped()].map(([criterion, items]) => {
      const result = criterionEvidence(student, items, criterion);
      return "<tr><td><strong>" + escapeHTML(criterion) + "</strong></td><td>" + result.evaluated + " / " + result.total + "</td><td>" + format(result.got) + " / " + format(result.maxEvaluated) + "</td><td>" + (result.pct === null ? "—" : format(result.pct) + "%") + "</td><td>" + escapeHTML(result.status) + "</td></tr>";
    }).join("");
    const rows = state.rubric.map(q => {
      const l = sel.get(q.id);
      const cells = q.levels.map(level =>
        "<td class='" + (l?.key === level.key ? "selected-print" : "") + "'>" +
        (l?.key === level.key ? "✓ " : "") + format(level.points) + " pt</td>"
      ).join("");
      return "<tr><td><strong>" + escapeHTML(q.criterion) + "</strong></td>" +
        "<td>" + escapeHTML(q.question) + "<br><small>" + escapeHTML(q.aspect) + "</small></td>" +
        cells +
        "<td class='print-obtained'>" + (l ? format(l.points) : "—") + " / " + format(q.max) + "</td></tr>";
    }).join("");
    const summarySection = includeSummary
      ? "<div class='competency-title'><h2>Resumen por criterio de evaluación</h2></div><table class='competency-table'><thead><tr><th>Criterio</th><th>Evidencias</th><th>Puntuación evaluada</th><th>Logro</th><th>Lectura orientativa</th></tr></thead><tbody>" + criterionRows + "</tbody></table><p class='print-note'>El porcentaje refleja únicamente los aspectos evaluados y no determina por sí solo el nivel de adquisición de una competencia específica.</p>"
      : "";
    const rubricSection = includeRubric
      ? "<div class='competency-title'><h2>Detalle de la rúbrica</h2></div><table class='print-rubric'><thead><tr><th>Criterio</th><th>Pregunta / aspecto evaluado</th><th>0%</th><th>25%</th><th>50%</th><th>75%</th><th>100%</th><th>Obtenido</th></tr></thead><tbody>" + rows + "</tbody></table>"
      : "";
    const observationsSection = observations
      ? "<div class='print-observations'><h2>Observaciones y próximos pasos</h2><p>" + escapeHTML(observations).replace(/\n/g, "<br>") + "</p></div>"
      : "";
    const pendingNote = t.evaluated < t.total ? "<p class='print-note'>Resultado provisional: quedan " + (t.total - t.evaluated) + " aspectos sin evaluar. En el resultado global, los aspectos pendientes todavía no suman puntos.</p>" : "";
    const content =
      "<div class='print-header'><div><h1>" + (state.activity ? escapeHTML(state.activity) : "Informe individual de evaluación") +
      "</h1><p><strong>Alumno/a:</strong> " + escapeHTML(student.name) + " &nbsp; · &nbsp; <strong>Grupo:</strong> " + escapeHTML(state.group || "—") +
      "</p></div></div>" +
      "<div class='print-grade'><div><span>RESULTADO</span><strong>" + format(t.got) + " / " + format(t.max) +
      "</strong></div><div><span>NOTA PROVISIONAL / 10</span><strong>" + format(grade) + " / 10</strong></div><div><span>EVALUACIÓN</span><strong>" + t.evaluated + " / " + t.total + "</strong></div></div>" +
      pendingNote + summarySection + rubricSection + observationsSection +
      "<div class='print-footer'>Informe generado desde la rúbrica · " + escapeHTML(student.name) + "</div>";
    openPrint(content, "student");
  } catch (error) {
    console.error("Error al generar el PDF del alumno:", error);
    notify("Error al generar el PDF: " + (error.message || "revisa la consola"));
  }
}

function printAllStudentRubrics() {
  if (!state.rubric.length || !state.students.length) { notify("Carga una rúbrica y añade alumnado antes de generar el PDF."); return; }
  const includeSummary = $("#batchPdfIncludeSummary").checked;
  const includeRubric = $("#batchPdfIncludeRubric").checked;
  const sortMode = $("#batchPdfOrder").value;
  if (!includeSummary && !includeRubric) { notify("Selecciona al menos una parte de la rúbrica para imprimir."); return; }
  const students = [...state.students];
  if (sortMode === "alpha") students.sort((a,b) => a.name.localeCompare(b.name, "es", {sensitivity:"base"}));
  const reports = students.map((student, index) => {
    const sel = selections(student), t = totals(student);
    const criterionRows = [...grouped()].map(([criterion, items]) => {
      const result = criterionEvidence(student, items, criterion);
      return "<tr><td><strong>" + escapeHTML(criterion) + "</strong></td><td>" + result.evaluated + " / " + result.total + "</td><td>" + format(result.got) + " / " + format(result.maxEvaluated) + "</td><td>" + (result.pct === null ? "—" : format(result.pct) + "%") + "</td><td>" + escapeHTML(result.status) + "</td></tr>";
    }).join("");
    const rows = state.rubric.map(q => {
      const level = sel.get(q.id);
      const cells = q.levels.map(item => "<td class='" + (level?.key === item.key ? "selected-print" : "") + "'>" + (level?.key === item.key ? "✓ " : "") + format(item.points) + " pt</td>").join("");
      return "<tr><td><strong>" + escapeHTML(q.criterion) + "</strong></td><td>" + escapeHTML(q.question) + "<br><small>" + escapeHTML(q.aspect) + "</small></td>" + cells + "<td class='print-obtained'>" + (level ? format(level.points) : "—") + " / " + format(q.max) + "</td></tr>";
    }).join("");
    const summarySection = includeSummary ? "<div class='competency-title'><h2>Resumen por criterio de evaluación</h2></div><table class='competency-table'><thead><tr><th>Criterio</th><th>Evidencias</th><th>Puntuación evaluada</th><th>Logro</th><th>Lectura orientativa</th></tr></thead><tbody>" + criterionRows + "</tbody></table><p class='print-note'>El porcentaje refleja únicamente los aspectos evaluados y no determina por sí solo el nivel de adquisición de una competencia específica.</p>" : "";
    const rubricSection = includeRubric ? "<div class='competency-title'><h2>Detalle de la rúbrica</h2></div><table class='print-rubric'><thead><tr><th>Criterio</th><th>Pregunta / aspecto evaluado</th><th>0%</th><th>25%</th><th>50%</th><th>75%</th><th>100%</th><th>Obtenido</th></tr></thead><tbody>" + rows + "</tbody></table>" : "";
    const pendingNote = t.evaluated < t.total ? "<p class='print-note'>Resultado provisional: quedan " + (t.total - t.evaluated) + " aspectos sin evaluar. En el resultado global, los aspectos pendientes todavía no suman puntos.</p>" : "";
    return "<div class='student-report-page" + (index ? " student-report-next-page" : "") + "'><div class='print-header'><div><h1>" + (state.activity ? escapeHTML(state.activity) : "Informe individual de evaluación") + "</h1><p><strong>Alumno/a:</strong> " + escapeHTML(student.name) + " &nbsp; · &nbsp; <strong>Grupo:</strong> " + escapeHTML(state.group || "—") + " &nbsp; · &nbsp; <strong>Alumno/a " + (index + 1) + " de " + students.length + "</strong></p></div></div>" +
      "<div class='print-grade'><div><span>RESULTADO</span><strong>" + format(t.got) + " / " + format(t.max) + "</strong></div><div><span>NOTA PROVISIONAL / 10</span><strong>" + format(t.pct / 10) + " / 10</strong></div><div><span>EVALUACIÓN</span><strong>" + t.evaluated + " / " + t.total + "</strong></div></div>" + pendingNote + summarySection + rubricSection + "<div class='print-footer'>Informe generado desde la rúbrica · " + escapeHTML(student.name) + "</div></div>";
  }).join("");
  openPrint(reports, "all-students");
}

function printClassReport() {
  if (!state.students.length) { notify("Añade alumnado antes de generar el informe del grupo."); return; }
  const rows = [];
  state.students.forEach(student => {
    [...grouped()].forEach(([criterion, items]) => {
      const result = criterionEvidence(student, items, criterion);
      rows.push("<tr><td><strong>" + escapeHTML(student.name) + "</strong></td><td>" + escapeHTML(criterion) + "</td><td>" + result.evaluated + " / " + result.total + "</td><td>" + format(result.got) + " / " + format(result.maxEvaluated) + "</td><td>" + (result.pct === null ? "—" : format(result.pct) + "%") + "</td><td>" + escapeHTML(result.status) + "</td></tr>");
    });
  });
  const assessed = state.students.reduce((sum, student) => sum + totals(student).evaluated, 0);
  const possible = state.students.length * state.rubric.length;
  const content = "<div class='print-header'><div><h1>Informe de evaluación del grupo</h1><p><strong>Grupo:</strong> " + escapeHTML(state.group || "—") + " &nbsp; · &nbsp; <strong>Actividad:</strong> " + escapeHTML(state.activity || "Rúbrica de evaluación") + "</p></div></div>" +
    "<div class='print-grade'><div><span>ALUMNADO</span><strong>" + state.students.length + "</strong></div><div><span>EVIDENCIAS EVALUADAS</span><strong>" + assessed + " / " + possible + "</strong></div><div><span>COBERTURA</span><strong>" + format(possible ? assessed / possible * 100 : 0) + "%</strong></div></div>" +
    "<div class='competency-title'><h2>Resultados por alumno y criterio</h2></div><table class='print-rubric'><thead><tr><th>Alumno/a</th><th>Criterio</th><th>Evidencias</th><th>Puntuación evaluada</th><th>Logro</th><th>Lectura orientativa</th></tr></thead><tbody>" + rows.join("") + "</tbody></table>" +
    "<div class='print-note'>Los porcentajes por criterio se calculan solo con los aspectos evaluados. El estado indica si hay aspectos pendientes y no asigna niveles automáticos de adquisición competencial.</div>" +
    "<div class='print-footer'>Informe de grupo</div>";
  openPrint(content, "student");
}

function printGroupDashboard() {
  if (!state.rubric.length || !state.students.length) {
    notify("Carga una rúbrica y añade alumnado antes de imprimir el panel.");
    return;
  }
  const criteria = [...grouped()];
  const possible = state.students.length * state.rubric.length;
  const assessed = state.students.reduce((sum, student) => sum + totals(student).evaluated, 0);
  const coverage = possible ? assessed / possible * 100 : 0;
  const criterionAnalysis = criteria.map(([criterion, items]) => {
    const results = state.students.map(student => criterionEvidence(student, items, criterion)).filter(r => r.pct !== null);
    const average = results.length ? results.reduce((sum, r) => sum + r.pct, 0) / results.length : null;
    const below = results.filter(r => r.pct < 50).length;
    const lowShare = results.length ? below / results.length : 0;
    let status = "Sin evidencias", statusClass = "diff-limited";
    if (results.length < 3) { status = "Muestra limitada"; statusClass = "diff-limited"; }
    else if (average < 50 && lowShare >= 0.5) { status = "Prioridad de refuerzo"; statusClass = "diff-priority"; }
    else if (average < 70 || lowShare >= 0.35) { status = "Revisar"; statusClass = "diff-review"; }
    else if (average >= 75 && lowShare < 0.15) { status = "Consolidado"; statusClass = "diff-good"; }
    else { status = "Seguimiento"; statusClass = "diff-watch"; }
    const evaluatedAspects = results.reduce((sum, r) => sum + r.evaluated, 0);
    const possibleAspects = state.students.length * items.length;
    return { criterion, items, results, average, below, lowShare, evaluatedAspects, possibleAspects, status, statusClass };
  });
  const priorityOrder = {"Prioridad de refuerzo":0,"Revisar":1,"Seguimiento":2,"Consolidado":3,"Muestra limitada":4,"Sin evidencias":5};
  const priorityRows = [...criterionAnalysis].sort((a, b) => {
    const diff = priorityOrder[a.status] - priorityOrder[b.status];
    return diff || ((a.average ?? Infinity) - (b.average ?? Infinity));
  }).map(x => {
    const lowText = x.results.length ? x.below + " / " + x.results.length + " (" + format(x.lowShare * 100) + "%)" : "—";
    const averageText = x.average === null ? "—" : format(x.average) + "%";
    const aspectCoverage = x.possibleAspects ? x.evaluatedAspects / x.possibleAspects * 100 : 0;
    return "<tr><td><strong>" + escapeHTML(x.criterion) + "</strong></td><td>" + averageText + "</td><td>" + lowText + "</td><td>" + x.results.length + " / " + state.students.length + "</td><td>" + x.evaluatedAspects + " / " + x.possibleAspects + " (" + format(aspectCoverage) + "%)</td><td><span class='group-report-badge " + x.statusClass + "'>" + escapeHTML(x.status) + "</span></td></tr>";
  }).join("");
  const difficultyRows = state.students.map(student => {
    const cells = criteria.map(([criterion, items]) => {
      const r = criterionEvidence(student, items, criterion);
      const cls = r.pct === null ? "grp-pending" : r.pct < 50 ? "grp-low" : r.pct < 75 ? "grp-mid" : "grp-high";
      return "<td class='" + cls + "'><strong>" + (r.pct === null ? "Sin datos" : format(r.pct) + "%") + "</strong><small>" + r.evaluated + "/" + r.total + " aspectos</small></td>";
    }).join("");
    return "<tr><th>" + escapeHTML(student.name) + "</th>" + cells + "</tr>";
  }).join("");
  const distributionRows = criterionAnalysis.map(x => {
    const evaluated = x.results.length;
    const low = x.results.filter(r => r.pct < 50).length;
    const mid = x.results.filter(r => r.pct >= 50 && r.pct < 75).length;
    const high = x.results.filter(r => r.pct >= 75).length;
    const share = count => evaluated ? count / evaluated * 100 : 0;
    const cell = (count, cls) => evaluated
      ? "<td class='" + cls + "'><strong>" + count + " / " + evaluated + "</strong><small>" + format(share(count)) + "%</small></td>"
      : "<td class='grp-pending'>—<small>Sin datos</small></td>";
    const bar = evaluated
      ? "<div class='group-distribution-bar' aria-label='Distribución de resultados'><span class='grp-low' style='width:" + share(low) + "%'></span><span class='grp-mid' style='width:" + share(mid) + "%'></span><span class='grp-high' style='width:" + share(high) + "%'></span></div>"
      : "<span class='group-distribution-empty'>Sin alumnado evaluado</span>";
    return "<tr><th>" + escapeHTML(x.criterion) + "</th>" + cell(low, "grp-low") + cell(mid, "grp-mid") + cell(high, "grp-high") + "<td class='group-distribution-cell'>" + bar + "</td></tr>";
  }).join("");
  const criterionCoverageRows = criterionAnalysis.map(x => {
    const mean = x.average === null ? "—" : format(x.average) + "%";
    const coveragePct = x.possibleAspects ? x.evaluatedAspects / x.possibleAspects * 100 : 0;
    return "<tr><td><strong>" + escapeHTML(x.criterion) + "</strong></td><td>" + x.results.length + " / " + state.students.length + "</td><td>" + mean + "</td><td>" + x.evaluatedAspects + " / " + x.possibleAspects + "</td><td>" + format(coveragePct) + "%</td></tr>";
  }).join("");
  const matrixHead = "<thead><tr><th>Alumno/a</th>" + criteria.map(([criterion]) => "<th>" + escapeHTML(criterion) + "</th>").join("") + "</tr></thead><tbody>";
  const content =
    "<div class='print-header'><div><h1>Mapa de dificultades del grupo</h1><p><strong>Grupo:</strong> " + escapeHTML(state.group || "—") + " &nbsp; · &nbsp; <strong>Actividad:</strong> " + escapeHTML(state.activity || "Rúbrica de evaluación") + " &nbsp; · &nbsp; <strong>Fecha:</strong> " + new Date().toLocaleDateString("es-ES") + "</p></div></div>" +
    "<div class='print-grade'><div><span>ALUMNADO</span><strong>" + state.students.length + "</strong></div><div><span>EVIDENCIAS EVALUADAS</span><strong>" + assessed + " / " + possible + "</strong></div><div><span>COBERTURA GLOBAL</span><strong>" + format(coverage) + "%</strong></div></div>" +
    "<div class='group-report-section'><h2>1. Mapa de dificultades por alumno y criterio</h2><p>Porcentaje calculado solo sobre aspectos evaluados. Los datos pendientes no se consideran suspensos.</p><table class='group-report-table group-report-matrix'>" + matrixHead + difficultyRows + "</tbody></table><div class='group-report-legend'><span class='grp-low'>Menos del 50 %</span><span class='grp-mid'>50–74 %</span><span class='grp-high'>75–100 %</span><span class='grp-pending'>Sin evidencias</span></div></div>" +
    "<div class='group-report-section'><h2>2. Distribución de resultados por criterio</h2><p>Porcentaje del alumnado con evidencias evaluadas en cada criterio. Las franjas son: menos del 50 %, del 50 % a menos del 75 % y 75 % o más. El alumnado sin datos no entra en el cálculo.</p><table class='group-report-table group-distribution-table'><thead><tr><th>Criterio</th><th>Menos del 50 %</th><th>50–74 %</th><th>75–100 %</th><th>Distribución del alumnado evaluado</th></tr></thead><tbody>" + distributionRows + "</tbody></table><div class='group-report-legend'><span class='grp-low'>Menos del 50 %</span><span class='grp-mid'>50–74 %</span><span class='grp-high'>75 % o más</span></div></div>" +
    "<div class='group-report-section'><h2>3. Prioridades de refuerzo por criterio</h2><p>La clasificación es orientativa y combina el promedio, los resultados inferiores al 50 % y la cantidad de evidencias disponibles. Con menos de tres alumnos evaluados, la muestra se marca como limitada.</p><table class='group-report-table'><thead><tr><th>Criterio</th><th>Promedio</th><th>Resultados &lt;50 %</th><th>Alumnado con datos</th><th>Cobertura de aspectos</th><th>Lectura orientativa</th></tr></thead><tbody>" + priorityRows + "</tbody></table></div>" +
    "<div class='group-report-section'><h2>4. Cobertura y resultados por criterio</h2><table class='group-report-table'><thead><tr><th>Criterio</th><th>Alumnado con datos</th><th>Promedio sobre lo evaluado</th><th>Aspectos evaluados</th><th>Cobertura</th></tr></thead><tbody>" + criterionCoverageRows + "</tbody></table></div>" +
    "<div class='print-note'>Informe generado con todos los alumnos y criterios de la sesión, independientemente de los filtros activos en pantalla. Los porcentajes describen las evidencias disponibles; no sustituyen el juicio profesional del docente ni determinan automáticamente la adquisición competencial.</div>" +
    "<div class='print-footer'>Panel de grupo · Informe para uso docente</div>";
  openPrint(content, "group-dashboard");
}

function openPrint(content, type) {
  const existing = document.getElementById("printOverlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "printOverlay";
  overlay.innerHTML = content;
  document.body.appendChild(overlay);
  document.body.classList.add("printing");

  const style = document.createElement("style");
  style.id = "printOverlayStyle";
  style.textContent =
    "@page{size:A4 landscape;margin:9mm}" +
    "#printOverlay{position:fixed;inset:0;z-index:99999;background:#fff;color:#252525;overflow:auto;padding:0;font-family:Arial,Helvetica,sans-serif;line-height:1.35}" +
    "#printOverlay *{box-sizing:border-box}" +
    "#printOverlay .print-header{display:flex;justify-content:space-between;align-items:center;gap:20px;background:#f5eee8;border-left:7px solid #7b3045;border-bottom:1px solid #d8c5c9;padding:14px 18px;margin-bottom:12px;border-radius:3px}" +
    "#printOverlay .print-header h1{font-size:21px;line-height:1.15;color:#542333;margin:0 0 7px;font-weight:800;letter-spacing:-.2px}" +
    "#printOverlay .print-header p{font-size:10px;color:#555;margin:0}" +
    "#printOverlay .print-header p strong{color:#542333}" +
    "#printOverlay .print-brand{font-size:13px;font-weight:800;color:#7b3045;white-space:nowrap;border:1px solid #cbaeb7;padding:7px 10px;border-radius:4px;background:#fff}" +
    "#printOverlay .competency-title{margin:12px 0 5px;padding-bottom:4px;border-bottom:2px solid #7b3045}" +
    "#printOverlay .competency-title h2{font-size:12px;text-transform:uppercase;letter-spacing:.6px;color:#542333;margin:0}" +
    "#printOverlay .competency-table{width:100%;border-collapse:separate;border-spacing:0;font-size:8px;margin:0 0 10px;border:1px solid #cfc7c3;border-radius:4px;overflow:hidden}" +
    "#printOverlay .competency-table th,#printOverlay .competency-table td{border-right:1px solid #ddd4d0;border-bottom:1px solid #ddd4d0;padding:5px 7px;text-align:left}" +
    "#printOverlay .competency-table th{background:#eee4df;color:#542333;font-weight:800;text-transform:uppercase;font-size:7px;letter-spacing:.25px}" +
    "#printOverlay .competency-table tr:last-child td{border-bottom:0}" +
    "#printOverlay .competency-table th:last-child,#printOverlay .competency-table td:last-child{border-right:0}" +
    "#printOverlay .print-grade{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:9px 0 11px}" +
    "#printOverlay .print-grade>div{border:1px solid #d2c5c0;border-top:3px solid #7b3045;background:#faf8f7;padding:6px 10px;border-radius:3px}" +
    "#printOverlay .print-grade span{display:block;font-size:6.5px;font-weight:800;letter-spacing:.7px;color:#766b68;text-transform:uppercase;margin-bottom:2px}" +
    "#printOverlay .print-grade strong{display:block;font-size:15px;color:#542333;line-height:1.1}" +
    "#printOverlay .print-rubric{width:100%;border-collapse:separate;border-spacing:0;font-size:7px;table-layout:fixed;border:1px solid #bbb2ae;border-radius:4px;overflow:hidden}" +
    "#printOverlay .print-rubric th,#printOverlay .print-rubric td{border-right:1px solid #d2cdca;border-bottom:1px solid #d2cdca;padding:4px 5px;vertical-align:top;line-height:1.25}" +
    "#printOverlay .print-rubric th{background:#542333;color:#fff;text-align:center;font-weight:800;font-size:7px;letter-spacing:.2px}" +
    "#printOverlay .print-rubric th:nth-child(1){width:7%}" +
    "#printOverlay .print-rubric th:nth-child(2){width:19%}" +
    "#printOverlay .print-rubric th:nth-child(n+3){width:10.5%}" +
    "#printOverlay .print-rubric th:last-child{width:9%}" +
    "#printOverlay .print-rubric tr:last-child td{border-bottom:0}" +
    "#printOverlay .print-rubric th:last-child,#printOverlay .print-rubric td:last-child{border-right:0}" +
    "#printOverlay .print-rubric tbody tr:nth-child(even){background:#faf9f8}" +
    "#printOverlay .print-rubric small{font-size:6.5px;color:#666;line-height:1.2}" +
    "#printOverlay .print-rubric tr{break-inside:avoid}" +
    "#printOverlay .selected-print{background:#eadde1!important;color:#542333;font-weight:800;box-shadow:inset 0 0 0 1px #b77d8d}" +
    "#printOverlay .print-obtained{text-align:center;font-weight:800;color:#542333;background:#f5eee8}" +
    "#printOverlay .print-footer{display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:9px;padding:7px 10px;background:#f5eee8;border-top:2px solid #7b3045;color:#542333;font-size:9px}" +
    "#printOverlay .print-note{font-size:8px;color:#6b555b;margin:5px 0 8px;padding:6px 8px;background:#faf4f5;border-left:3px solid #b77d8d}" +
    "#printOverlay .print-observations{margin-top:10px;padding:10px 12px;border:1px solid #d8c5c9;background:#faf8f7;break-inside:avoid}" +
    "#printOverlay .print-observations h2{font-size:10px;text-transform:uppercase;color:#542333;margin:0 0 5px}" +
    "#printOverlay .print-observations p{font-size:9px;line-height:1.4;margin:0;white-space:normal}" +
    "#printOverlay .student-report-next-page{break-before:page;page-break-before:always}" +

    "#printOverlay .group-report-section{margin:12px 0 15px;break-inside:auto}" +
    "#printOverlay .group-report-section h2{font-size:12px;color:#542333;border-bottom:2px solid #7b3045;padding-bottom:4px;margin:0 0 5px;text-transform:uppercase;letter-spacing:.35px}" +
    "#printOverlay .group-report-section>p{font-size:8px;color:#62575a;margin:0 0 7px}" +
    "#printOverlay .group-report-table{width:100%;border-collapse:collapse;font-size:7.5px;margin:0 0 7px}" +
    "#printOverlay .group-report-table th,#printOverlay .group-report-table td{border:1px solid #d5cecb;padding:4px 5px;text-align:left;vertical-align:top;line-height:1.25}" +
    "#printOverlay .group-report-table th{background:#542333;color:#fff;font-size:7px;text-transform:uppercase;letter-spacing:.15px}" +
    "#printOverlay .group-report-matrix{table-layout:auto}" +
    "#printOverlay .group-report-matrix th:first-child{min-width:100px;width:13%;background:#eee4df;color:#542333}" +
    "#printOverlay .group-report-matrix td{text-align:center;min-width:55px}" +
    "#printOverlay .group-distribution-table th:first-child{width:18%;background:#eee4df;color:#542333}" +
    "#printOverlay .group-distribution-table td{text-align:center;vertical-align:middle}" +
    "#printOverlay .group-distribution-table td small{font-size:7px}" +
    "#printOverlay .group-distribution-cell{width:30%;min-width:120px}" +
    "#printOverlay .group-distribution-bar{display:flex;width:100%;height:15px;overflow:hidden;border-radius:3px;background:#f1f2f4;border:1px solid #d5cecb}" +
    "#printOverlay .group-distribution-bar span{display:block;height:100%;min-width:0}" +
    "#printOverlay .group-distribution-empty{font-size:7px;color:#596273}" +
    "#printOverlay .group-report-table small{display:block;font-size:6.5px;margin-top:2px}" +
    "#printOverlay .grp-low{background:#f2d9d8!important;color:#70252b}" +
    "#printOverlay .grp-mid{background:#f3e5c9!important;color:#72501a}" +
    "#printOverlay .grp-high{background:#d5e7dd!important;color:#235e42}" +
    "#printOverlay .grp-pending{background:#f1f2f4!important;color:#596273}" +
    "#printOverlay .grp-partial{background:#ead8bf!important;color:#6b4b23}" +
    "#printOverlay .grp-complete{background:#d5e7dd!important;color:#235e42}" +
    "#printOverlay .group-report-legend{display:flex;flex-wrap:wrap;gap:5px 10px;font-size:7px;margin:4px 0 10px}" +
    "#printOverlay .group-report-legend span{padding:3px 6px;border-radius:3px}" +
    "#printOverlay .group-report-badge{display:inline-block;padding:3px 5px;border-radius:3px;font-weight:800;font-size:7px}" +
    "#printOverlay .diff-priority{background:#f2d9d8;color:#7f2028}" +
    "#printOverlay .diff-review{background:#f3e5c9;color:#80551a}" +
    "#printOverlay .diff-good{background:#d5e7dd;color:#235e42}" +
    "#printOverlay .diff-limited{background:#f1f2f4;color:#596273}" +
    "#printOverlay .diff-watch{background:#eadde1;color:#542333}" +

    "@media print{#printOverlay .grp-low,#printOverlay .grp-mid,#printOverlay .grp-high,#printOverlay .grp-pending,#printOverlay .grp-partial,#printOverlay .grp-complete,#printOverlay .group-report-table th,#printOverlay .print-header,#printOverlay .print-grade>div{-webkit-print-color-adjust:exact;print-color-adjust:exact}#printOverlay .group-report-section{break-inside:auto}#printOverlay .group-report-table tr{break-inside:avoid}body.printing>*:not(#printOverlay){display:none!important}#printOverlay{position:static!important;overflow:visible!important;padding:0!important;width:auto!important;height:auto!important}#printOverlay .print-rubric tbody tr:nth-child(even){background:#faf9f8!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}#printOverlay .print-header,#printOverlay .competency-table th,#printOverlay .print-grade>div,#printOverlay .print-rubric th,#printOverlay .selected-print,#printOverlay .print-obtained,#printOverlay .print-footer{-webkit-print-color-adjust:exact;print-color-adjust:exact}}";

  document.head.appendChild(style);

  const cleanup = () => {
    document.body.classList.remove("printing");
    overlay.remove();
    style.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);

  requestAnimationFrame(() => window.print());
}
function downloadJSON() {
  download("rubricas_sesion.json",JSON.stringify({version:3,exportedAt:new Date().toISOString(),csv:$("#csvInput").value,rubric:state.rubric,students:state.students,active:state.active,group:state.group,activity:state.activity},null,2),"application/json;charset=utf-8");
}
function importBackupData(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.rubric) || !Array.isArray(data.students)) {
    throw new Error("El archivo no contiene una copia de seguridad válida de Rúbricas.");
  }
  if (!data.rubric.length) throw new Error("La copia no contiene ninguna pregunta de rúbrica.");
  const validQuestions = data.rubric.every(q =>
    q && typeof q.id === "string" && typeof q.criterion === "string" &&
    typeof q.question === "string" && typeof q.aspect === "string" &&
    Array.isArray(q.levels) && q.levels.length > 0 &&
    q.levels.every(l => l && typeof l.key === "string" && typeof l.label === "string" && Number.isFinite(Number(l.points)))
  );
  const validStudents = data.students.every(st =>
    st && typeof st.id === "string" && typeof st.name === "string" && Array.isArray(st.selections)
  );
  if (!validQuestions || !validStudents) throw new Error("La estructura de la copia está incompleta o dañada.");
  const rubricIds = new Set(data.rubric.map(q => q.id));
  const students = data.students.map(st => ({
    id: st.id,
    name: clean(st.name),
    selections: st.selections.filter(pair => Array.isArray(pair) && rubricIds.has(pair[0]) && pair[1] && typeof pair[1] === "object")
  }));
  if (students.some(st => !st.name)) throw new Error("La copia contiene algún alumno sin nombre.");
  state.rubric = data.rubric;
  state.students = students;
  state.active = students.some(st => st.id === data.active) ? data.active : (students[0]?.id || null);
  state.group = clean(data.group);
  state.activity = clean(data.activity);
  state.quick = 0;
  $("#csvInput").value = typeof data.csv === "string" ? data.csv : "";
  save();
  $("#classNav").classList.remove("hidden");
  $("#dashboardNav").classList.remove("hidden");
  renderStudents();
  view("classView");
  notify("Copia cargada correctamente · " + state.students.length + " alumnos");
}
async function handleBackupFile(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!confirm("Vas a sustituir la rúbrica, el grupo, el alumnado y todas las evaluaciones de esta sesión por los datos del archivo seleccionado. Esta acción no se puede deshacer. ¿Quieres continuar?")) return;
    importBackupData(data);
  } catch (error) {
    notify(error instanceof SyntaxError ? "El archivo no es un JSON válido." : (error.message || "No se ha podido cargar la copia."));
  } finally {
    $("#importBackupFile").value = "";
  }
}
function loadRubric() {
  const validation = validateCSV($("#csvInput").value);
  renderValidation(validation);
  if (validation.errors.length) { notify("Corrige los errores del CSV antes de cargarlo."); return; }
  try {
    state.rubric = parseCSV($("#csvInput").value); state.students=[]; state.active=null; state.quick=0; state.group=""; state.activity=""; save();
    $("#classNav").classList.remove("hidden"); $("#dashboardNav").classList.remove("hidden"); view("classView"); renderStudents(); notify("Rúbrica cargada: "+state.rubric.length+" preguntas");
  } catch (e) { notify(e.message || "No se ha podido leer el CSV."); }
}
function restore() {
  const raw = localStorage.getItem("rubricas-app-v3"); if (!raw) return;
  try {
    const data=JSON.parse(raw); state.rubric=data.rubric||[]; state.students=data.students||[]; state.active=data.active||state.students[0]?.id||null; state.group=data.group||""; state.activity=data.activity||"";
    if(data.csv) $("#csvInput").value=data.csv;
    if(state.rubric.length){$("#classNav").classList.remove("hidden");$("#dashboardNav").classList.remove("hidden");view("classView");renderStudents();}
  } catch {}
}
function setup() {
  $("#copyPromptBtn").onclick=async()=>{try{await navigator.clipboard.writeText($("#rubricPrompt").value);notify("Prompt copiado al portapapeles")}catch{notify("No se ha podido copiar automáticamente")}};
  $("#loadBtn").onclick=loadRubric;
  $("#exampleBtn").onclick=()=>{$("#csvInput").value=EXAMPLE_CSV;$("#csvInput").dispatchEvent(new Event("input"));};
  $("#csvInput").oninput=()=>{
    const result = validateCSV($("#csvInput").value);
    renderValidation(result);
    $("#parseStatus").textContent = !$("#csvInput").value.trim() ? "Esperando CSV…" : result.errors.length ? result.errors.length + " error(es) · " + result.rows + " filas detectadas" : result.warnings.length ? "Estructura correcta · revisa las advertencias" : "CSV validado · " + result.rows + " filas detectadas";
    $("#loadBtn").disabled = result.errors.length > 0;
  };
  $("#resetBtn").onclick=()=>{if(state.rubric.length&&!confirm("¿Empezar una nueva rúbrica? Se borrará la sesión de este navegador."))return;localStorage.removeItem("rubricas-app-v3");location.reload()};
  document.querySelectorAll(".nav-btn").forEach(b=>b.onclick=()=>{
    if(b.dataset.view==="promptView" || state.rubric.length){
      view(b.dataset.view);
      if(b.dataset.view==="dashboardView") renderDashboard();
    }
  });
  ["dashboardStudentFilter","dashboardCriterionFilter","dashboardStatusFilter"].forEach(id => {
    const control = $("#" + id);
    if (control) control.addEventListener("change", renderDashboard);
  });
  $("#addStudentBtn").onclick=()=>{$("#studentAddBox").classList.remove("hidden");$("#newStudentName").focus()};
  $("#confirmStudentBtn").onclick=()=>{addStudent($("#newStudentName").value);$("#newStudentName").value="";$("#studentAddBox").classList.add("hidden")};
  $("#newStudentName").onkeydown=e=>{if(e.key==="Enter")$("#confirmStudentBtn").click()};
  $("#pasteStudentsBtn").onclick=()=>{$("#studentListInput").classList.remove("hidden");$("#studentPasteActions").classList.remove("hidden")};
  $("#cancelStudentListBtn").onclick=()=>{$("#studentListInput").classList.add("hidden");$("#studentPasteActions").classList.add("hidden")};
  $("#saveStudentListBtn").onclick=()=>{clean($("#studentListInput").value).split("\n").map(clean).filter(Boolean).forEach(addStudent);$("#studentListInput").value="";$("#studentListInput").classList.add("hidden");$("#studentPasteActions").classList.add("hidden");renderStudents()};
  $("#blankPdfBtn").onclick=printBlankRubric;
  $("#exportBackupBtn").onclick=downloadJSON;
  $("#importBackupBtn").onclick=()=>$("#importBackupFile").click();
  $("#importBackupFile").onchange=e=>handleBackupFile(e.target.files?.[0]);
  $("#batchPdfBtn").onclick=printAllStudentRubrics;
  $("#printDashboardBtn").onclick=printGroupDashboard;
  $("#fullModeBtn").onclick=()=>{state.mode="full";renderEvaluation()};
  $("#quickModeBtn").onclick=()=>{state.mode="quick";state.quick=0;renderEvaluation()};
  $("#resultsBtn").onclick=()=>{state.mode="results";renderEvaluation()};
  $("#groupName").oninput=e=>{state.group=e.target.value;save()};
  $("#activityName").oninput=e=>{state.activity=e.target.value;save()};
  document.addEventListener("keydown", e => {
    if (state.mode !== "quick" || $("#rubricView").classList.contains("hidden")) return;
    if (e.target && (["INPUT","TEXTAREA","SELECT"].includes(e.target.tagName) || e.target.isContentEditable)) return;
    if (e.key >= "1" && e.key <= "5") {
      const question = state.rubric[state.quick];
      const level = question?.levels[Number(e.key) - 1];
      if (!question || !level) return;
      e.preventDefault();
      choose(question.id, level.key);
      if (state.quick < state.rubric.length - 1) state.quick++;
      renderQuick();
    } else if (e.key === "ArrowRight") {
      e.preventDefault(); state.quick = Math.min(state.rubric.length - 1, state.quick + 1); renderQuick();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault(); state.quick = Math.max(0, state.quick - 1); renderQuick();
    }
  });
}
setup(); restore();