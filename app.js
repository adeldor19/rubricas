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
function totals(student) {
  const sel = selections(student);
  const max = state.rubric.reduce((a, q) => a + q.max, 0);
  const got = state.rubric.reduce((a, q) => a + (sel.get(q.id)?.points || 0), 0);
  const evaluated = state.rubric.filter(q => sel.has(q.id)).length;
  return { max, got, evaluated, total: state.rubric.length, pct: max ? got / max * 100 : 0, progress: state.rubric.length ? evaluated / state.rubric.length * 100 : 0 };
}
function save() {
  localStorage.setItem("rubricas-app-v3", JSON.stringify({
    csv: $("#csvInput")?.value || "",
    rubric: state.rubric,
    students: state.students,
    active: state.active,
    group: state.group,
    activity: state.activity
  }));
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
  previous.onclick = () => { state.quick = Math.max(0, state.quick - 1); renderQuick(); };
  next.onclick = () => { state.quick = Math.min(state.rubric.length - 1, state.quick + 1); renderQuick(); };
  nav.append(previous, counter, next); box.append(head, levels, nav);
}
function renderResults() {
  const box = $("#resultsContainer"); box.innerHTML = ""; box.classList.remove("hidden");
  $("#rubricContainer").classList.add("hidden"); $("#quickContainer").classList.add("hidden");
  $("#modeHelp").textContent = "Resumen del alumno";
  const student = current(), t = totals(student), sel = selections(student);
  const grid = document.createElement("div"); grid.className = "results-grid";
  const hero = document.createElement("div"); hero.className = "result-hero card";
  hero.innerHTML = "<span class='eyebrow'>RESULTADO</span><strong>" + format(t.pct) + "%</strong><span>" + format(t.got) + " / " + format(t.max) + " puntos</span><div class='result-progress'><div style='width:" + t.pct + "%'></div></div>";
  const tableCard = document.createElement("div"); tableCard.className = "card results-table-wrap";
  tableCard.innerHTML = "<h2>Resultados por criterio</h2>";
  const table = document.createElement("table"); table.className = "results-table";
  table.innerHTML = "<thead><tr><th>Criterio</th><th>Evaluadas</th><th>Puntuación</th><th>Porcentaje</th></tr></thead>";
  const body = document.createElement("tbody");
  grouped().forEach((items, criterion) => {
    const max = items.reduce((a,q)=>a+q.max,0), got = items.reduce((a,q)=>a+(sel.get(q.id)?.points||0),0);
    const row = document.createElement("tr");
    row.innerHTML = "<td><strong>"+escapeHTML(criterion)+"</strong></td><td>"+items.filter(q=>sel.has(q.id)).length+" / "+items.length+"</td><td>"+format(got)+" / "+format(max)+"</td><td><strong>"+format(max?got/max*100:0)+"%</strong></td>";
    body.appendChild(row);
  });
  table.appendChild(body); tableCard.appendChild(table); grid.append(hero, tableCard); box.appendChild(grid);
  const actions = document.createElement("div"); actions.className = "card backup-card";
  actions.innerHTML = "<h2>Exportación y copia de seguridad</h2><p>Guarda los resultados o una copia completa de esta sesión.</p>";
  const buttons = document.createElement("div"); buttons.className = "button-row";
  [["PDF del alumno",printStudentRubric],["CSV del alumno",()=>downloadStudent(student)],["CSV de toda la clase",downloadClass],["Sesión JSON",downloadJSON]].forEach(([label,fn])=>{const b=document.createElement("button");b.className="ghost-btn";b.textContent=label;b.onclick=fn;buttons.appendChild(b)});
  actions.appendChild(buttons); box.appendChild(actions);
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
  openPrint("<div class='print-header'><div><h1>" + escapeHTML(title) + "</h1><p>Grupo: " + escapeHTML(state.group || "__________") + " &nbsp; · &nbsp; Alumno/a: ______________________________</p></div><div class='print-brand'>ProfeAlbertoD</div></div><table class='print-rubric'><thead><tr><th>Criterio</th><th>Pregunta / aspecto evaluado</th><th>Insuficiente<br>0%</th><th>Básico<br>25%</th><th>Adecuado<br>50%</th><th>Notable<br>75%</th><th>Excelente<br>100%</th></tr></thead><tbody>" + rows + "</tbody></table><div class='print-footer'>Puntuación obtenida: __________ / " + format(state.rubric.reduce((s,q)=>s+q.max,0)) + " &nbsp;&nbsp;&nbsp; Nota: ______ / 10</div>", "blank");
}
function printStudentRubric() {
  try {
    const student = current();
    if (!student) {
      notify("No hay ningún alumno seleccionado.");
      return;
    }

    const sel = selections(student);
    const t = totals(student);
    const grade = t.pct / 10;

    const competencyRows = competencyResults(student).map(c =>
      "<tr><td><strong>" + escapeHTML(c.name) + "</strong></td>" +
      "<td>" + c.evaluated + " / " + c.total + "</td>" +
      "<td>" + format(c.got) + " / " + format(c.max) + "</td>" +
      "<td>" + format(c.pct) + "%</td>" +
      "<td>" + format(c.pct / 10) + "</td></tr>"
    ).join("");

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

    const content =
      "<div class='print-header'><div><h1>" +
      (state.activity ? escapeHTML(state.activity) : "Rúbrica de evaluación") +
      "</h1><p><strong>Alumno/a:</strong> " + escapeHTML(student.name) +
      " &nbsp; · &nbsp; <strong>Grupo:</strong> " + escapeHTML(state.group || "—") +
      "</p></div><div class='print-brand'>ProfeAlbertoD</div></div>" +

      "<div class='competency-title'><h2>Notas por competencia</h2></div>" +
      "<table class='competency-table'><thead><tr><th>Competencia</th><th>Evaluadas</th><th>Puntuación</th><th>%</th><th>Nota / 10</th></tr></thead><tbody>" +
      competencyRows + "</tbody></table>" +

      "<div class='print-grade'>" +
      "<div><span>RESULTADO</span><strong>" + format(t.got) + " / " + format(t.max) + "</strong></div>" +
      "<div><span>NOTA</span><strong>" + format(grade) + " / 10</strong></div>" +
      "<div><span>EVALUACIÓN</span><strong>" + t.evaluated + " / " + t.total + "</strong></div>" +
      "</div>" +

      "<table class='print-rubric'><thead><tr><th>Criterio</th><th>Pregunta / aspecto evaluado</th><th>0%</th><th>25%</th><th>50%</th><th>75%</th><th>100%</th><th>Obtenido</th></tr></thead><tbody>" +
      rows + "</tbody></table>" +

      "<div class='print-footer'>Puntuación: <strong>" + format(t.got) + " / " + format(t.max) +
      "</strong> &nbsp;&nbsp; · &nbsp;&nbsp; Nota: <strong>" + format(grade) + " / 10</strong></div>";

    openPrint(content, "student");
  } catch (error) {
    console.error("Error al generar el PDF del alumno:", error);
    notify("Error al generar el PDF: " + (error.message || "revisa la consola"));
  }
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
    "@media print{body.printing>*:not(#printOverlay){display:none!important}#printOverlay{position:static!important;overflow:visible!important;padding:0!important;width:auto!important;height:auto!important}#printOverlay .print-rubric tbody tr:nth-child(even){background:#faf9f8!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}#printOverlay .print-header,#printOverlay .competency-table th,#printOverlay .print-grade>div,#printOverlay .print-rubric th,#printOverlay .selected-print,#printOverlay .print-obtained,#printOverlay .print-footer{-webkit-print-color-adjust:exact;print-color-adjust:exact}}";

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
function loadRubric() {
  try {
    state.rubric = parseCSV($("#csvInput").value); state.students=[]; state.active=null; state.quick=0; state.group=""; state.activity=""; save();
    $("#classNav").classList.remove("hidden"); view("classView"); renderStudents(); notify("Rúbrica cargada: "+state.rubric.length+" preguntas");
  } catch (e) { notify(e.message || "No se ha podido leer el CSV."); }
}
function restore() {
  const raw = localStorage.getItem("rubricas-app-v3"); if (!raw) return;
  try {
    const data=JSON.parse(raw); state.rubric=data.rubric||[]; state.students=data.students||[]; state.active=data.active||state.students[0]?.id||null; state.group=data.group||""; state.activity=data.activity||"";
    if(data.csv) $("#csvInput").value=data.csv;
    if(state.rubric.length){$("#classNav").classList.remove("hidden");view("classView");renderStudents();}
  } catch {}
}
function setup() {
  $("#copyPromptBtn").onclick=async()=>{try{await navigator.clipboard.writeText($("#rubricPrompt").value);notify("Prompt copiado al portapapeles")}catch{notify("No se ha podido copiar automáticamente")}};
  $("#loadBtn").onclick=loadRubric;
  $("#exampleBtn").onclick=()=>{$("#csvInput").value=EXAMPLE_CSV;$("#parseStatus").textContent="Ejemplo cargado."};
  $("#csvInput").oninput=()=>{try{$("#parseStatus").textContent="CSV válido · "+parseCSV($("#csvInput").value).length+" preguntas detectadas"}catch{$("#parseStatus").textContent=$("#csvInput").value.trim()?"Revisa el formato del CSV.":"Esperando CSV…"}};
  $("#resetBtn").onclick=()=>{if(state.rubric.length&&!confirm("¿Empezar una nueva rúbrica? Se borrará la sesión de este navegador."))return;localStorage.removeItem("rubricas-app-v3");location.reload()};
  document.querySelectorAll(".nav-btn").forEach(b=>b.onclick=()=>{if(b.dataset.view==="promptView" || state.rubric.length)view(b.dataset.view)});
  $("#addStudentBtn").onclick=()=>{$("#studentAddBox").classList.remove("hidden");$("#newStudentName").focus()};
  $("#confirmStudentBtn").onclick=()=>{addStudent($("#newStudentName").value);$("#newStudentName").value="";$("#studentAddBox").classList.add("hidden")};
  $("#newStudentName").onkeydown=e=>{if(e.key==="Enter")$("#confirmStudentBtn").click()};
  $("#pasteStudentsBtn").onclick=()=>{$("#studentListInput").classList.remove("hidden");$("#studentPasteActions").classList.remove("hidden")};
  $("#cancelStudentListBtn").onclick=()=>{$("#studentListInput").classList.add("hidden");$("#studentPasteActions").classList.add("hidden")};
  $("#saveStudentListBtn").onclick=()=>{clean($("#studentListInput").value).split("\n").map(clean).filter(Boolean).forEach(addStudent);$("#studentListInput").value="";$("#studentListInput").classList.add("hidden");$("#studentPasteActions").classList.add("hidden");renderStudents()};
  $("#blankPdfBtn").onclick=printBlankRubric;
  $("#fullModeBtn").onclick=()=>{state.mode="full";renderEvaluation()};
  $("#quickModeBtn").onclick=()=>{state.mode="quick";state.quick=0;renderEvaluation()};
  $("#resultsBtn").onclick=()=>{state.mode="results";renderEvaluation()};
  $("#groupName").oninput=e=>{state.group=e.target.value;save()};
  $("#activityName").oninput=e=>{state.activity=e.target.value;save()};
}
setup(); restore();