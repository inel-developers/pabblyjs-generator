const assert = require('node:assert/strict');
const vm = require('node:vm');
const { parseRows, generate, detectLayout, summarizeWeights, WEIGHT_TOLERANCE } = require('../generator');

function run(questions, variables) {
  const context = { ...variables };
  vm.runInNewContext(generate(questions), context);
  return context.output;
}

function single(score) {
  return parseRows([['Q', '100', 'Valor', String(score)]]);
}

// 1. Caso base con pesos positivos que suman 100.
const base = parseRows([
  ['¿Ya estudió?', '40', 'Sí', '100', 'No', '0', '', ''],
  ['País', '60', 'Perú, Chile', '100', 'otros países', '25', '', '']
]);
assert.equal(base.length, 2);
assert.equal(base[0].peso, 40);
const high = run(base, { p0: 'Respuesta: SI', p1: 'País: Perú' });
assert.equal(high.Puntuacion, 100);
assert.equal(high.Tipo, 'CALIENTE');
assert.equal(high.Porcentaje, '100.00%');
assert.deepEqual(Object.keys(high).sort(), ['Debug', 'Porcentaje', 'Puntuacion', 'Tipo']);
const medium = run(base, { p0: 'No', p1: 'País: Chile' });
assert.equal(medium.Puntuacion, 60);
assert.equal(medium.Tipo, 'FRIO');
const other = run(base, { p0: 'Sí', p1: 'País: Bolivia' });
assert.equal(other.Puntuacion, 55);
assert.equal(other.Tipo, 'FRIO');

// 2. Una pregunta con 0 %: se conserva y no influye en el resultado.
const withZero = parseRows([
  ['A', '40', 'Sí', '100', 'No', '0'],
  ['B', '30', 'Sí', '100', 'No', '0'],
  ['C', '0', 'Sí', '100', 'No', '0'],
  ['D', '20', 'Sí', '100', 'No', '0'],
  ['E', '10', 'Sí', '100', 'No', '0']
]);
assert.deepEqual(withZero.map((question) => question.peso), [40, 30, 0, 20, 10]);
const withZeroCode = generate(withZero);
assert.match(withZeroCode, /"p2":0/);
assert.match(withZeroCode, /var raw2=/);
assert.match(withZeroCode, /var raw4=/);
const zeroYes = run(withZero, { p0: 'Sí', p1: 'Sí', p2: 'Sí', p3: 'Sí', p4: 'Sí' });
const zeroNo = run(withZero, { p0: 'Sí', p1: 'Sí', p2: 'No', p3: 'Sí', p4: 'Sí' });
assert.equal(zeroYes.Puntuacion, 100);
assert.equal(zeroNo.Puntuacion, 100);
assert.equal(zeroNo.Debug.raw2, 0);

// 3. Varias preguntas con 0 %.
const manyZeros = parseRows([
  ['A', '50', 'Sí', '100'],
  ['B', '50', 'Sí', '100'],
  ['C', '0', 'Sí', '100'],
  ['D', '0', 'Sí', '100']
]);
assert.deepEqual(manyZeros.map((question) => question.peso), [50, 50, 0, 0]);

// 4. Una pregunta con 100 % y las demás con 0 %.
const onlyOne = parseRows([
  ['A', '100', 'Sí', '100', 'No', '0'],
  ['B', '0', 'Sí', '100', 'No', '0'],
  ['C', '0', 'Sí', '100', 'No', '0']
]);
assert.deepEqual(onlyOne.map((question) => question.peso), [100, 0, 0]);
assert.equal(run(onlyOne, { p0: 'No', p1: 'Sí', p2: 'Sí' }).Puntuacion, 0);

// 5. Pesos que suman menos y más de 100, con mensaje de cuánto falta o sobra.
assert.throws(() => parseRows([['A', '40', 'Sí', '100'], ['B', '50', 'Sí', '100']]), /faltan 10 puntos porcentuales/);
assert.throws(() => parseRows([['A', '60', 'Sí', '100'], ['B', '50', 'Sí', '100']]), /sobran 10 puntos porcentuales/);

// 6. Tolerancia decimal razonable.
assert.equal(parseRows([['A', '33.33', 'Sí', '100'], ['B', '66.66', 'Sí', '100']])[1].peso, 66.66);
assert.equal(parseRows([['A', '33.33', 'Sí', '100'], ['B', '66.71', 'Sí', '100']])[1].peso, 66.71);
assert.throws(() => parseRows([['A', '33.33', 'Sí', '100'], ['B', '66.61', 'Sí', '100']]), /faltan/);
assert.equal(WEIGHT_TOLERANCE, 0.05);

// 7. Fracciones de Excel y peso 0 combinados.
const fractions = parseRows([
  ['A', '0.40', 'Sí', '100'],
  ['B', '0.30', 'Sí', '100'],
  ['C', '0', 'Sí', '100'],
  ['D', '0.30', 'Sí', '100']
]);
assert.deepEqual(fractions.map((question) => question.peso), [40, 30, 0, 30]);

// 8. Formatos de porcentaje y coma decimal.
assert.equal(parseRows([['A', '8 %', 'Sí', '100'], ['B', '92 %', 'Sí', '100']])[0].peso, 8);
assert.equal(parseRows([['A', '33,5', 'Sí', '100'], ['B', '66,5', 'Sí', '100']])[0].peso, 33.5);

// 9. Preguntas con una, dos y tres opciones.
assert.equal(parseRows([['A', '100', 'Sí', '100']])[0].opciones.length, 1);
assert.equal(parseRows([['A', '50', 'Sí', '100', 'No', '0'], ['B', '50', 'Sí', '100', 'No', '0']])[0].opciones.length, 2);
assert.equal(parseRows([['A', '100', 'A', '100', 'B', '50', 'C', '0']])[0].opciones.length, 3);

// 10. Filas vacías ignoradas, conservando el número de fila en los errores.
assert.equal(parseRows([['', '', ''], ['A', '100', 'Sí', '100'], ['', '', '']]).length, 1);
assert.throws(() => parseRows([['', '', ''], ['A', '100', 'Sí', '100'], ['', 'abc', '']]), /Fila 3: el peso "abc" no es un número válido/);

// 11. IDs y variables desde 0, sin saltos, hasta p9.
const ten = parseRows(Array.from({ length: 10 }, (_, i) => ['P' + i, '10', 'Sí', '100']));
const tenCode = generate(ten);
for (let i = 0; i < 10; i++) assert.match(tenCode, new RegExp('"p' + i + '":10'));
assert.match(tenCode, /var raw0=/);
assert.match(tenCode, /var raw9=/);
assert.doesNotMatch(tenCode, /var raw10=/);
assert.match(tenCode, /PESOS\.p0/);

// 12. Compatibilidad con las filas originales del cuestionario.
const original = require('./original_rows.json');
const originalQuestions = parseRows(original);
assert.equal(originalQuestions.length, 7);
assert.deepEqual(originalQuestions.map((question) => question.peso), [8, 18, 22, 22, 15, 10, 5]);
const firstAnswers = {
  p0: 'Respuesta: SI',
  p1: 'Respuesta: Si, actualmente participo',
  p2: 'Respuesta: Me parece una propuesta muy alineada a mis necesidades',
  p3: 'Respuesta: Estaría dispuesto(a) a invertir en ese rango de precio',
  p4: 'Respuesta: En 1 a 3 meses',
  p5: 'Respuesta: Ingeniero(a) o analista en datos energéticos',
  p6: 'País: Chile'
};
const originalHigh = run(originalQuestions, firstAnswers);
assert.equal(originalHigh.Puntuacion, 100);
assert.equal(originalHigh.Tipo, 'CALIENTE');
const secondAnswers = {
  p0: 'Respuesta: NO',
  p1: 'Respuesta: No, pero planeo participar',
  p2: 'Respuesta: Me parece una propuesta alineada en cierto nivel a mis necesidades',
  p3: 'Respuesta: Lo consideraría solo con facilidades de pago a cuotas',
  p4: 'Respuesta: En 4 a 6 meses',
  p5: 'Respuesta: Consultor(a) o gestor(a) de proyectos energéticos',
  p6: 'País: Uruguay'
};
const originalMedium = run(originalQuestions, secondAnswers);
assert.equal(originalMedium.Puntuacion, 56);
assert.equal(originalMedium.Tipo, 'FRIO');
assert.equal(originalMedium.Debug.raw6, 50);

// 13. Columna «N.º Eje» con encabezado y sin encabezado.
const indexed = [
  ['N.º Eje', 'Pregunta', 'Peso (%)', 'Opción 1', 'Puntaje', 'Opción 2', 'Puntaje', 'Opción 3', 'Puntaje'],
  ['1', 'A', '40', 'Sí', '100', 'No', '0', '', ''],
  ['2', 'B', '60', 'Sí', '100', 'No', '0', '', '']
];
const indexedLayout = detectLayout(indexed);
assert.equal(indexedLayout.headerRemoved, true);
assert.equal(indexedLayout.offset, 1);
assert.equal(indexedLayout.extraColumns, 0);
const indexedQuestions = parseRows(indexed);
assert.deepEqual(indexedQuestions.map((question) => question.pregunta), ['A', 'B']);
assert.deepEqual(indexedQuestions.map((question) => question.peso), [40, 60]);
const noHeaderIndex = [['1', 'A', '40', 'Sí', '100', 'No', '0'], ['2', 'B', '60', 'Sí', '100', 'No', '0']];
assert.equal(detectLayout(noHeaderIndex).offset, 1);
assert.equal(parseRows(noHeaderIndex).length, 2);

// 14. Encabezado normal de 8 columnas.
const header8 = [
  ['Pregunta', 'Peso %', 'Opción 1', 'Puntaje', 'Opción 2', 'Puntaje', 'Opción 3', 'Puntaje'],
  ['A', '100', 'Sí', '100', '', '', '', '']
];
const headerLayout = detectLayout(header8);
assert.equal(headerLayout.headerRemoved, true);
assert.equal(headerLayout.offset, 0);
assert.equal(headerLayout.extraColumns, 0);
assert.equal(parseRows(header8)[0].pregunta, 'A');

// Una pregunta real que empieza con "Pregunta" no debe confundirse con encabezado.
const notHeader = parseRows([['Pregunta', '100', 'Peso opción', '50']]);
assert.equal(notHeader.length, 1);
assert.equal(notHeader[0].pregunta, 'Pregunta');

// 15. Columnas adicionales: se detectan y no se recortan en silencio.
const extra = [
  ['Pregunta', 'Peso', 'Opción 1', 'Puntaje', 'Opción 2', 'Puntaje', 'Opción 3', 'Puntaje', 'Nota'],
  ['A', '100', 'Sí', '100', '', '', '', '', 'x']
];
assert.equal(detectLayout(extra).extraColumns, 1);
assert.throws(() => parseRows(extra), /La tabla tiene 9 columnas de datos/);
assert.throws(() => parseRows([]), /Pega primero una tabla/);

// 16. Mensajes de validación específicos.
assert.throws(() => parseRows([['A', '', 'Sí', '100']]), /falta el peso/);
assert.throws(() => parseRows([['A', 'abc', 'Sí', '100']]), /el peso "abc" no es un número válido/);
assert.throws(() => parseRows([['A', '-1', 'Sí', '100'], ['B', '101', 'Sí', '100']]), /entre 0 y 100/);
assert.throws(() => parseRows([['A', '100', 'Sí', 'abc']]), /puntaje de la opción 1/);
assert.throws(() => parseRows([['A', '100', 'Sí', '']]), /le falta el puntaje/);
assert.throws(() => parseRows([['A', '100', '', '50']]), /le falta el texto/);

// 17. Clasificación sin cambios: 80 CALIENTE, >60 TIBIO, 60 FRÍO.
assert.equal(run(single(80), { p0: 'Valor' }).Tipo, 'CALIENTE');
assert.equal(run(single(79.99), { p0: 'Valor' }).Tipo, 'TIBIO');
assert.equal(run(single(60.01), { p0: 'Valor' }).Tipo, 'TIBIO');
assert.equal(run(single(60), { p0: 'Valor' }).Tipo, 'FRIO');

// 18. Resumen de pesos compartido por la interfaz.
const summary = summarizeWeights([['A', '40', 'Sí', '100'], ['B', '0', 'Sí', '100']]);
assert.equal(summary.total, 40);
assert.equal(summary.count, 2);
assert.equal(summary.valid, true);
assert.equal(summary.tolerance, 0.05);
const fractionSummary = summarizeWeights([['A', '0.4', 'Sí', '100'], ['B', '0.6', 'Sí', '100']]);
assert.equal(fractionSummary.total, 100);
assert.equal(fractionSummary.scaled, true);

// 19. Formato compacto y legible.
assert.ok(generate(base, true).split('\n').length > generate(base).split('\n').length);

console.log('Pruebas completadas correctamente: 19 grupos de casos.');
