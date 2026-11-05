import '../generator.js';

(() => {
  'use strict';
  const generator = globalThis.PabblyGenerator;
  if (!generator) throw new Error('No se cargó el motor PabblyGenerator.');
  const HEADERS = ['Pregunta', 'Peso %', 'Opción 1', 'Puntaje', 'Opción 2', 'Puntaje', 'Opción 3', 'Puntaje'];
  const COLS = generator.COLUMNS || 8;
  const body = document.getElementById('grid-body');
  const sheet = document.getElementById('sheet');
  const validation = document.getElementById('validation');
  const notice = document.getElementById('notice');
  const result = document.getElementById('code-output');
  const codeStatus = document.getElementById('code-status');
  const pretty = document.getElementById('pretty');
  const copyButton = document.getElementById('copy-code');
  const downloadButton = document.getElementById('download-code');
  const resultCount = document.getElementById('result-count');
  const weightTag = document.getElementById('weight-total');
  const codeBody = result.querySelector('.code-body');
  const themeToggle = document.getElementById('theme-toggle');
  const themeMedia = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const numberFormat = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });
  let rows = [];
  let generated = null;
  let toastTimer;
  let themeTimer;
  let manualTheme = false;

  // ---------- Tema claro / oscuro (solo durante la sesión) ----------
  function syncTheme() {
    if (!themeToggle) return;
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = dark ? 'claro' : 'oscuro';
    themeToggle.setAttribute('aria-pressed', dark ? 'true' : 'false');
    themeToggle.setAttribute('aria-label', 'Cambiar a tema ' + next);
    themeToggle.title = 'Cambiar a tema ' + next;
    const label = themeToggle.querySelector('.theme-label');
    if (label) label.textContent = dark ? 'Claro' : 'Oscuro';
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    // Evita que los colores queden a mitad de transición al cambiar de tema.
    root.classList.add('theme-switching');
    root.setAttribute('data-theme', theme);
    syncTheme();
    clearTimeout(themeTimer);
    themeTimer = setTimeout(() => root.classList.remove('theme-switching'), 200);
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      manualTheme = true;
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      applyTheme(dark ? 'light' : 'dark');
    });
  }

  if (themeMedia) {
    const followSystem = (event) => {
      if (!manualTheme) applyTheme(event.matches ? 'dark' : 'light');
    };
    if (themeMedia.addEventListener) themeMedia.addEventListener('change', followSystem);
    else if (themeMedia.addListener) themeMedia.addListener(followSystem);
  }

  if (!document.documentElement.getAttribute('data-theme')) {
    applyTheme(themeMedia && themeMedia.matches ? 'dark' : 'light');
  } else {
    syncTheme();
  }

  // ---------- Resaltado de sintaxis JavaScript ----------
  const KEYWORDS = new Set([
    'var', 'let', 'const', 'function', 'return', 'if', 'else', 'for', 'while', 'do',
    'switch', 'case', 'break', 'continue', 'new', 'typeof', 'instanceof', 'in', 'of',
    'try', 'catch', 'finally', 'throw', 'delete', 'void', 'class', 'extends', 'super',
    'this', 'null', 'undefined', 'true', 'false'
  ]);
  const BUILTINS = new Set([
    'Math', 'JSON', 'String', 'Number', 'Boolean', 'Array', 'Object', 'Date',
    'RegExp', 'parseInt', 'parseFloat', 'isNaN', 'console'
  ]);
  const TOKEN_RE = /(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\b(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?)\b|[A-Za-z_$][\w$]*/g;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function highlightJS(source) {
    const text = String(source == null ? '' : source);
    let out = '';
    let last = 0;
    let match;
    TOKEN_RE.lastIndex = 0;
    while ((match = TOKEN_RE.exec(text))) {
      const token = match[0];
      out += escapeHtml(text.slice(last, match.index));
      let cls = '';
      if (token.startsWith('//') || token.startsWith('/*')) {
        cls = 'tok-comment';
      } else if (token[0] === '"' || token[0] === "'" || token[0] === '`') {
        cls = 'tok-string';
      } else if (/^(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?)$/.test(token)) {
        cls = 'tok-number';
      } else if (KEYWORDS.has(token)) {
        cls = 'tok-keyword';
      } else if (/^\s*\(/.test(text.slice(match.index + token.length))) {
        cls = 'tok-function';
      } else if (BUILTINS.has(token)) {
        cls = 'tok-builtin';
      }
      out += cls ? '<span class="' + cls + '">' + escapeHtml(token) + '</span>' : escapeHtml(token);
      last = TOKEN_RE.lastIndex;
    }
    out += escapeHtml(text.slice(last));
    return out;
  }

  function setCode(html) {
    if (codeBody) codeBody.innerHTML = html;
    else result.innerHTML = html;
  }

  const empty = () => Array(COLS).fill('');
  const validIndex = (r, c) => r >= 0 && c >= 0 && c < COLS;
  const format = (value) => numberFormat.format(Number.isFinite(value) ? value : 0);

  function rowElement(values, r) {
    const tr = document.createElement('tr');
    const num = document.createElement('td');
    num.className = 'row-number';
    num.textContent = String(r + 1);
    tr.appendChild(num);
    for (let c = 0; c < COLS; c++) {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'text';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.dataset.row = r;
      input.dataset.col = c;
      input.value = values[c] || '';
      input.setAttribute('aria-label', HEADERS[c] + ' fila ' + (r + 1));
      if (r === 0) {
        input.placeholder = ['Escribe o pega aquí', 'Ej.: 20', 'Respuesta A', '100', 'Respuesta B', '50', 'Respuesta C', '0'][c];
      }
      td.appendChild(input);
      tr.appendChild(td);
    }
    const end = document.createElement('td');
    end.className = 'row-actions';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'del';
    remove.textContent = '×';
    remove.title = 'Eliminar fila ' + (r + 1);
    remove.setAttribute('aria-label', 'Eliminar fila ' + (r + 1));
    remove.dataset.remove = r;
    end.appendChild(remove);
    tr.appendChild(end);
    return tr;
  }

  function appendRows(count) {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const r = rows.length;
      const data = empty();
      rows.push(data);
      fragment.appendChild(rowElement(data, r));
    }
    body.appendChild(fragment);
  }

  function ensureRows(required) {
    if (required > rows.length) appendRows(Math.max(required - rows.length, 5));
  }

  function focusAt(r, c) {
    r = Math.max(0, r);
    c = Math.max(0, Math.min(c, COLS - 1));
    ensureRows(r + 1);
    const input = body.rows[r]?.cells[c + 1]?.querySelector('input');
    if (input) input.focus();
  }

  function showErrors(issues) {
    if (!issues || !issues.length) {
      validation.hidden = true;
      validation.replaceChildren();
      return;
    }
    const title = document.createElement('strong');
    title.textContent = 'Revisa estos puntos';
    const list = document.createElement('ul');
    issues.forEach((issue) => {
      const item = document.createElement('li');
      item.textContent = issue;
      list.appendChild(item);
    });
    validation.replaceChildren(title, list);
    validation.hidden = false;
  }

  function showNotice(message) {
    notice.textContent = message || '';
    notice.hidden = !message;
  }

  function clearNotice() {
    notice.textContent = '';
    notice.hidden = true;
  }

  function getFilledRows() {
    return rows.filter((row) => row.some((value) => String(value).trim()));
  }

  function updateMetrics() {
    const filled = getFilledRows();
    const questionCount = filled.filter((row) => String(row[0]).trim()).length;
    document.getElementById('question-count').textContent = String(questionCount);

    const summary = generator.summarizeWeights(rows);
    weightTag.textContent = 'Peso total: ';
    const strong = document.createElement('b');
    strong.textContent = format(summary.total) + '%';
    weightTag.appendChild(strong);

    const ok = summary.count > 0 && summary.valid && Math.abs(summary.total - 100) <= generator.WEIGHT_TOLERANCE;
    weightTag.className = 'weight ' + (ok ? 'ok' : summary.count ? 'bad' : '');
    weightTag.title = summary.scaled ? 'Valores decimales de Excel interpretados como porcentajes.' : '';
  }

  function resetOutput() {
    generated = null;
    codeStatus.textContent = 'Sin generar';
    codeStatus.className = 'status';
    setCode(highlightJS('// Tu código JavaScript aparecerá aquí después de generar.'));
    copyButton.disabled = true;
    downloadButton.disabled = true;
    resultCount.textContent = 'Esperando datos…';
  }

  function invalidate() {
    resetOutput();
    showErrors([]);
    clearNotice();
    updateMetrics();
  }

  function assign(r, c, value) {
    if (!validIndex(r, c)) return;
    ensureRows(r + 1);
    rows[r][c] = value;
    const cell = body.rows[r]?.cells[c + 1]?.querySelector('input');
    if (cell && cell.value !== value) cell.value = value;
  }

  function cleanPasted(data) {
    const matrix = data.replace(/\r\n?/g, '\n').split('\n').map((line) => line.split('\t'));
    while (matrix.length && matrix[matrix.length - 1].every((value) => value === '')) matrix.pop();
    return matrix;
  }

  function pasteTable(input, text) {
    const matrix = cleanPasted(text);
    if (!matrix.length) return;
    const startR = Number(input.dataset.row);
    const startC = Number(input.dataset.col);
    const layout = startC === 0 ? generator.detectLayout(matrix) : null;

    if (layout && layout.extraColumns > 0) {
      invalidate();
      showNotice('No se pegó nada: la tabla tiene ' + layout.columns + ' columnas de datos y la cuadrícula admite 8. Revisa si sobra alguna columna (por ejemplo, notas o una columna vacía).');
      toast('Revisa la estructura de la tabla');
      return;
    }

    let data = matrix;
    if (layout && layout.headerRemoved) {
      const headerIndex = matrix.findIndex((row) => row.some((cell) => String(cell).trim()));
      data = matrix.slice(headerIndex + 1);
    }

    if (startC > 0) {
      const width = matrix.reduce((max, row) => Math.max(max, row.length), 0);
      if (startC + width > COLS) {
        invalidate();
        showNotice('No se pegó nada: desde esa columna se necesitan ' + width + ' columnas y solo quedan ' + (COLS - startC) + '.');
        toast('La selección no cabe en la cuadrícula');
        return;
      }
    }

    if (!data.length) {
      showNotice('La tabla pegada solo contiene encabezados. Pega también las filas de datos.');
      toast('No hay filas de datos');
      return;
    }

    ensureRows(startR + data.length);
    const offset = layout ? layout.offset : 0;
    for (let ri = 0; ri < data.length; ri++) {
      const source = data[ri];
      for (let ci = offset; ci < source.length; ci++) {
        const value = String(source[ci] == null ? '' : source[ci]).replace(/\u00a0/g, ' ').trim();
        assign(startR + ri, startC + ci - offset, value);
      }
    }

    invalidate();
    const notes = [];
    if (layout && layout.headerRemoved) notes.push('Se omitió la fila de encabezado.');
    if (layout && layout.offset) notes.push('Se omitió la columna «N.º Eje».');
    if (notes.length) showNotice(notes.join(' '));
    focusAt(startR, startC);
    toast('Tabla pegada: ' + data.length + ' fila' + (data.length === 1 ? '' : 's'));
  }

  function toast(message) {
    const element = document.getElementById('toast');
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove('show'), 2400);
  }

  sheet.addEventListener('input', (event) => {
    const input = event.target.closest('input[data-row]');
    if (!input) return;
    const r = Number(input.dataset.row);
    const c = Number(input.dataset.col);
    if (!rows[r]) return;
    rows[r][c] = input.value;
    invalidate();
    if (r === rows.length - 1 && input.value.trim()) appendRows(5);
  });

  sheet.addEventListener('paste', (event) => {
    const input = event.target.closest('input[data-row]');
    if (!input) return;
    const text = event.clipboardData?.getData('text/plain');
    if (text == null) return;
    if (!text.includes('\t') && !text.includes('\n')) return;
    event.preventDefault();
    pasteTable(input, text);
  });

  sheet.addEventListener('keydown', (event) => {
    const input = event.target.closest('input[data-row]');
    if (!input) return;
    const r = Number(input.dataset.row);
    const c = Number(input.dataset.col);
    if (event.key === 'Enter') {
      event.preventDefault();
      focusAt(r + 1, c);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      let nr = r;
      let nc = c + (event.shiftKey ? -1 : 1);
      if (nc >= COLS) { nc = 0; nr += 1; }
      if (nc < 0) { nc = COLS - 1; nr = Math.max(0, nr - 1); }
      focusAt(nr, nc);
    } else if (event.altKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      const nr = r + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0);
      const nc = c + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0);
      focusAt(nr, nc);
    }
  });

  sheet.addEventListener('click', (event) => {
    const remove = event.target.closest('button[data-remove]');
    if (!remove) return;
    const r = Number(remove.dataset.remove);
    rows.splice(r, 1);
    if (!rows.length) rows.push(empty());
    render();
    invalidate();
  });

  function render() {
    body.textContent = '';
    const fragment = document.createDocumentFragment();
    rows.forEach((row, i) => fragment.appendChild(rowElement(row, i)));
    body.appendChild(fragment);
  }

  document.getElementById('add-row').addEventListener('click', () => {
    appendRows(1);
    body.lastElementChild?.querySelector('input')?.focus();
  });

  document.getElementById('clear-grid').addEventListener('click', () => {
    if (getFilledRows().length && !confirm('¿Limpiar toda la tabla? Se perderán los datos no guardados.')) return;
    rows = Array.from({ length: 10 }, empty);
    render();
    invalidate();
    toast('Tabla limpia');
  });

  document.getElementById('generate').addEventListener('click', () => {
    try {
      const parsed = generator.parseRows(rows);
      generated = parsed;
      showErrors([]);
      clearNotice();
      renderCode();
      codeStatus.textContent = 'Listo para copiar';
      codeStatus.className = 'status ready';
      copyButton.disabled = false;
      downloadButton.disabled = false;
      const last = parsed.length - 1;
      resultCount.textContent = parsed.length + (parsed.length === 1 ? ' pregunta' : ' preguntas')
        + ' · ' + (parsed.length === 1 ? 'variable p0' : 'variables p0–p' + last);
      document.getElementById('output-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast('Código JS generado correctamente');
    } catch (error) {
      resetOutput();
      showErrors(error.issues || [error.message]);
      validation.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  function code() {
    return generated ? generator.generate(generated, pretty.checked) : '';
  }

  function renderCode() {
    if (generated) setCode(highlightJS(code()));
  }

  pretty.addEventListener('change', renderCode);

  copyButton.addEventListener('click', async () => {
    if (!generated) return;
    const text = code();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      if (!ok) {
        toast('No se pudo copiar; selecciona el código manualmente.');
        return;
      }
    }
    toast('Código copiado al portapapeles');
  });

  downloadButton.addEventListener('click', () => {
    if (!generated) return;
    const blob = new Blob([code()], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'codigo_pabbly.js';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  appendRows(10);
  updateMetrics();
})();
