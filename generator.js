/* Motor independiente del servidor y de la interfaz. Compatible con Node y navegador. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PabblyGenerator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const COLUMNS = 8;
  const TARGET_WEIGHT = 100;
  // Tolerancia en puntos porcentuales. Permite 33,33 + 66,66 sin falsos errores.
  const WEIGHT_TOLERANCE = 0.05;

  const normalize = (x) => String(x == null ? '' : x).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim();
  const clean = (x) => String(x == null ? '' : x).replace(/\u00a0/g, ' ').trim();
  const number = (x) => {
    const s = clean(x).replace(/%/g, '').replace(/\s+/g, '').replace(',', '.');
    if (!s || !/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
    return Number(s);
  };
  const display = (n) => {
    if (!Number.isFinite(n)) return String(n);
    return String(Number(n.toFixed(4))).replace('.', ',');
  };
  const trimCells = (row) => {
    const cells = Array.isArray(row) ? row.map(clean) : [];
    while (cells.length && !cells[cells.length - 1]) cells.pop();
    return cells;
  };
  const padCells = (cells) => Array.from({ length: COLUMNS }, (_, i) => clean(cells[i]));
  const hasContent = (cells) => cells.some(Boolean);
  const isHeaderRow = (row) => {
    const values = trimCells(row).map(normalize);
    for (let i = 0; i < values.length - 1; i++) {
      const isQuestion = values[i] === 'pregunta';
      const isWeight = values[i + 1].startsWith('peso') || values[i + 1].startsWith('ponderacion');
      if (isQuestion && isWeight) return true;
    }
    return false;
  };
  const isIndexHeader = (value) => clean(value) === '#' || /^(?:n\s*(?:de\s*)?eje|eje|n[uú]m(?:ero)?|nro|id|item)$/.test(normalize(value));

  /**
   * Analiza la forma de una matriz pegada sin modificarla.
   * Devuelve si trae encabezado, si la primera columna es "N.º Eje" y cuántas
   * columnas de datos quedan después de esa columna.
   */
  function detectLayout(rows) {
    const numbered = (Array.isArray(rows) ? rows : []).map((row, i) => ({ row: i + 1, cells: trimCells(row) }));
    const first = numbered.find((item) => hasContent(item.cells));
    const headerRemoved = !!first && isHeaderRow(first.cells);
    const bodyStart = headerRemoved ? numbered.indexOf(first) + 1 : 0;
    let offset = 0;

    if (headerRemoved) {
      const header = first.cells;
      if (isIndexHeader(header[0]) || (normalize(header[1] || '') === 'pregunta' && header.length >= 9)) offset = 1;
    }

    const body = numbered.slice(bodyStart);
    if (!offset) {
      const populated = body.filter((item) => hasContent(item.cells)).map((item) => item.cells);
      if (populated.length) {
        const width = populated.reduce((max, cells) => Math.max(max, cells.length), 0);
        const firstColumn = populated.map((cells) => clean(cells[0]));
        const numericLike = firstColumn.every((value) => value === '' || /^\d+$/.test(value));
        const hasNumeric = firstColumn.some((value) => /^\d+$/.test(value));
        const secondHasText = populated.every((cells) => clean(cells[1]) !== '' && /[a-záéíóúñ]/i.test(clean(cells[1])));
        const indexedSequence = firstColumn.every((value, i) => {
          if (value === '') return true;
          const n = Number(value);
          return n === i || n === i + 1;
        });
        // La columna índice puede aparecer con o sin encabezado. Se exige que
        // la segunda columna sea la pregunta para no confundir una tabla normal.
        if (numericLike && hasNumeric && secondHasText && (width >= 9 || indexedSequence)) offset = 1;
      }
    }

    const dataRows = body.map((item) => item.cells.slice(offset));
    const totalColumns = body.reduce((max, item) => Math.max(max, item.cells.length), 0);
    const columns = dataRows.reduce((max, cells) => Math.max(max, cells.length), 0);
    return {
      headerRemoved,
      offset,
      columns,
      totalColumns,
      extraColumns: Math.max(0, columns - COLUMNS)
    };
  }

  function prepare(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const layout = detectLayout(list);
    const numbered = list.map((row, i) => ({ row: i + 1, cells: trimCells(row) }));
    let start = 0;
    if (layout.headerRemoved) {
      const headerIndex = numbered.findIndex((item) => hasContent(item.cells));
      start = headerIndex + 1;
    }
    const items = numbered.slice(start)
      .map((item) => ({ row: item.row, cells: padCells(item.cells.slice(layout.offset)) }))
      .filter((item) => hasContent(item.cells));
    return { items, layout };
  }

  function weightContext(items) {
    const raw = items.map((item) => clean(item.cells[1]));
    const present = raw.filter(Boolean);
    const values = present.map(number);
    const sum = values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
    // Excel puede entregar 0.08 en lugar de 8%. Solo se escala si todos los
    // valores parecen fracciones y el conjunto representa como máximo 1.
    const allFractions = present.length > 0
      && present.every((value) => !value.includes('%') && Number.isFinite(number(value)) && number(value) >= 0 && number(value) <= 1)
      && sum <= 1.0001
      && sum > 0;
    const scale = allFractions ? 100 : 1;
    const parsed = raw.map((value) => {
      const n = number(value);
      return Number.isFinite(n) ? n * scale : NaN;
    });
    const total = parsed.reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0);
    const allValid = parsed.every((value) => Number.isFinite(value) && value >= 0 && value <= 100);
    return { raw, present, parsed, scale, allFractions, total, allValid };
  }

  function summarizeWeights(rows) {
    const { items } = prepare(rows);
    const context = weightContext(items);
    return {
      total: context.total,
      count: context.present.length,
      scaled: context.allFractions,
      valid: context.allValid,
      tolerance: WEIGHT_TOLERANCE
    };
  }

  function parseRows(rows) {
    const { items, layout } = prepare(rows);
    if (layout.extraColumns > 0) {
      const message = `La tabla tiene ${layout.columns} columnas de datos y solo se esperaban 8 (Pregunta, Peso, Opción 1, Puntaje 1, Opción 2, Puntaje 2, Opción 3, Puntaje 3). Revisa si sobra alguna columna.`;
      const error = new Error(message);
      error.issues = [message];
      throw error;
    }
    if (!items.length) throw new Error('Pega primero una tabla con preguntas, pesos y opciones.');

    const context = weightContext(items);
    const errors = [];
    const questions = [];

    items.forEach((item, index) => {
      const [question, weightRaw, ...pairs] = item.cells;
      const weight = context.parsed[index];
      const weightValid = Number.isFinite(weight) && weight >= 0 && weight <= 100;

      if (!question) errors.push(`Fila ${item.row}: falta el texto de la pregunta.`);
      if (!clean(weightRaw)) {
        errors.push(`Fila ${item.row}: falta el peso (debe estar entre 0 y 100).`);
      } else if (!Number.isFinite(number(weightRaw))) {
        errors.push(`Fila ${item.row}: el peso "${clean(weightRaw)}" no es un número válido.`);
      } else if (!weightValid) {
        errors.push(`Fila ${item.row}: el peso debe estar entre 0 y 100; se recibió ${display(weight)}%.`);
      }

      const options = [];
      let sawOption = false;
      for (let k = 0; k < 3; k++) {
        const label = clean(pairs[k * 2]);
        const scoreRaw = clean(pairs[k * 2 + 1]);
        if (!label && !scoreRaw) continue;
        sawOption = true;
        if (!label) {
          errors.push(`Fila ${item.row}: la opción ${k + 1} tiene puntaje pero le falta el texto.`);
          continue;
        }
        if (!scoreRaw) {
          errors.push(`Fila ${item.row}: la opción ${k + 1} tiene texto pero le falta el puntaje.`);
          continue;
        }
        const score = number(scoreRaw);
        if (!Number.isFinite(score)) {
          errors.push(`Fila ${item.row}: el puntaje de la opción ${k + 1} ("${scoreRaw}") no es un número válido.`);
          continue;
        }
        if (score < 0 || score > 100) {
          errors.push(`Fila ${item.row}: el puntaje de la opción ${k + 1} debe estar entre 0 y 100; se recibió ${display(score)}.`);
          continue;
        }
        options.push({ texto: label, puntaje: score });
      }
      if (!sawOption) errors.push(`Fila ${item.row}: ingresa al menos una opción con texto y puntaje.`);

      if (question && weightValid) questions.push({ pregunta: question, peso: weight, opciones: options });
    });

    if (context.allValid && Math.abs(context.total - TARGET_WEIGHT) > WEIGHT_TOLERANCE) {
      if (context.total < TARGET_WEIGHT) {
        errors.push(`La suma de pesos es ${display(context.total)}%; faltan ${display(TARGET_WEIGHT - context.total)} puntos porcentuales para llegar a 100%.`);
      } else {
        errors.push(`La suma de pesos es ${display(context.total)}%; sobran ${display(context.total - TARGET_WEIGHT)} puntos porcentuales (debe ser 100%).`);
      }
    }

    if (errors.length) {
      const error = new Error(errors.join('\n'));
      error.issues = errors;
      throw error;
    }
    return questions;
  }

  const stringify = (value) => JSON.stringify(value);

  function generate(questions, readable = false) {
    if (!Array.isArray(questions) || !questions.length) throw new Error('No hay preguntas para generar.');
    const blocks = [];
    blocks.push('function normalizar(x){return(x==null?"":x).toString().toLowerCase().replace(/[áàäâ]/g,"a").replace(/[éèëê]/g,"e").replace(/[íìïî]/g,"i").replace(/[óòöô]/g,"o").replace(/[úùüû]/g,"u").replace(/ñ/g,"n").replace(/_/g," ").replace(/[^a-z0-9 ]/g," ").replace(/\\s+/g," ").trim();}');
    blocks.push('function obtenerRespuesta(x){var s=(x==null?"":x).toString();var k=s.lastIndexOf(":");return normalizar(k===-1?s:s.substring(k+1));}');
    blocks.push('function scorePorTokens(texto,opciones,defecto){var todo=normalizar(texto);var t=obtenerRespuesta(texto);if(!t||t==="no data"||todo.indexOf("source deleted")===0)return 0;for(var i=0;opciones.length>i;i++){var op=opciones[i];for(var j=0;op.tokens.length>j;j++){if(t===normalizar(op.tokens[j]))return op.score;}}return defecto;}');
    blocks.push('function ponderado(raw,peso){return raw*peso/100;}');
    const weights = {};
    questions.forEach((question, i) => { weights['p' + i] = question.peso; });
    blocks.push('var PESOS=' + stringify(weights) + ';');
    questions.forEach((question, i) => {
      const country = ['pais', 'country'].includes(normalize(question.pregunta));
      let fallback = 0;
      const options = question.opciones.map((option) => {
        if (country && normalize(option.texto).includes('otro')) fallback = option.puntaje;
        return { tokens: country ? option.texto.split(',').map((token) => token.trim()) : [option.texto], score: option.puntaje };
      });
      blocks.push('var opsP' + i + '=' + stringify(options) + ';');
      blocks.push('var raw' + i + '=scorePorTokens(p' + i + ',opsP' + i + ',' + fallback + ');');
    });
    blocks.push('var score=' + questions.map((question, i) => 'ponderado(raw' + i + ',PESOS.p' + i + ')').join('+') + ';');
    blocks.push('score=Math.round(score*100)/100;if(score>100)score=100;if(0>score)score=0;');
    blocks.push('var tipo="";if(score>=80){tipo="CALIENTE";}else if(score>60&&80>score){tipo="TIBIO";}else{tipo="FRIO";}');
    blocks.push('output={Puntuacion:score,Tipo:tipo,Porcentaje:score.toFixed(2)+"%",Debug:{' + questions.map((question, i) => 'raw' + i + ':raw' + i).join(',') + '}};');
    return blocks.join(readable ? '\n' : '') + '\n';
  }

  return {
    parseRows,
    generate,
    detectLayout,
    summarizeWeights,
    COLUMNS,
    WEIGHT_TOLERANCE
  };
});
