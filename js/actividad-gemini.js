// Clasificador compartido de actividad real de Gemini (Fase 13).
// Relaciona herramientas, comandos, archivos y contexto con la etapa y el personaje
// que la representa visualmente en la oficina LEGO.
// IMPORTANTE: los personajes NO ejecutan tareas ni reciben delegaciones; solo visualizan el trabajo de Gemini.

export const ETAPAS_GEMINI = {
  planificacion:  { id: 'planificacion',  etiqueta: 'Planificación',        representante: 'gemini',       estadoVisual: 'pensando' },
  investigacion:  { id: 'investigacion',  etiqueta: 'Investigación',        representante: 'investigador', estadoVisual: 'investigando' },
  navegacion:     { id: 'navegacion',     etiqueta: 'Navegación web',       representante: 'browser',      estadoVisual: 'trabajando' },
  lectura:        { id: 'lectura',        etiqueta: 'Lectura de archivos',  representante: 'investigador', estadoVisual: 'pensando' },
  analisis:       { id: 'analisis',       etiqueta: 'Análisis de datos',    representante: 'investigador', estadoVisual: 'investigando' },
  memoria:        { id: 'memoria',        etiqueta: 'Memoria y contexto',   representante: 'memoria',      estadoVisual: 'trabajando' },
  redaccion:      { id: 'redaccion',      etiqueta: 'Redacción / guion',    representante: 'gemini',       estadoVisual: 'trabajando' },
  programacion:   { id: 'programacion',   etiqueta: 'Programación',         representante: 'gemini',       estadoVisual: 'trabajando' },
  edicion_codigo: { id: 'edicion_codigo', etiqueta: 'Edición de código',    representante: 'gemini',       estadoVisual: 'trabajando' },
  diseno_visual:  { id: 'diseno_visual',  etiqueta: 'Diseño visual',        representante: 'imagen',       estadoVisual: 'trabajando' },
  produccion_av:  { id: 'produccion_av',  etiqueta: 'Producción audiovisual', representante: 'director-av', estadoVisual: 'trabajando' },
  audio:          { id: 'audio',          etiqueta: 'Generación de audio',  representante: 'audio',        estadoVisual: 'trabajando' },
  pruebas:        { id: 'pruebas',        etiqueta: 'Ejecución de pruebas', representante: 'qa',           estadoVisual: 'revisando' },
  verificacion:   { id: 'verificacion',   etiqueta: 'Verificación',         representante: 'qa',           estadoVisual: 'revisando' },
  correccion:     { id: 'correccion',     etiqueta: 'Corrección de errores', representante: 'gemini',      estadoVisual: 'trabajando' },
  entrega:        { id: 'entrega',        etiqueta: 'Entrega final',        representante: 'gemini',       estadoVisual: 'entregando' },
  desconocida:    { id: 'desconocida',    etiqueta: 'Sin actividad clara',  representante: 'gemini',       estadoVisual: 'desconocido' },
};

const low = (v) => String(v ?? '').toLowerCase();

function pack(etapaId, evidenciaTipo, motivo, overrideEstado) {
  const def = ETAPAS_GEMINI[etapaId] || ETAPAS_GEMINI.desconocida;
  return {
    etapa: def.id,
    etiqueta: def.etiqueta,
    representante: def.representante,
    estadoVisual: overrideEstado || def.estadoVisual,
    evidenciaTipo,
    motivo,
  };
}

/**
 * Clasifica un evento real de Gemini combinando herramienta + archivo + comando + texto + contexto.
 */
export function clasificaActividadGemini(ev = {}, ctx = {}) {
  const h = low(ev.herramienta);
  const arch = low(ev.archivo);
  const cmd = low(ev.comando);
  const txt = low(ev.texto);
  const tipoSub = low(ev.tipo_subagente);
  const estado = low(ev.estado);
  const accion = low(ev.accion);
  const combinado = `${h} ${arch} ${cmd} ${txt}`;

  const esObservada = Boolean(
    ev.origen === 'real' ||
    ev.fuente === 'gemini-vigia' ||
    h || cmd || arch || ev.resultado
  );
  const evTipo = esObservada ? 'observada' : (txt ? 'inferida' : 'desconocida');

  if (estado === 'error' || accion === 'error') {
    return pack('correccion', esObservada ? 'observada' : 'inferida', 'Fallo detectado en ejecución de Gemini', 'error');
  }
  if (estado === 'finalizado' || (estado === 'entregando' && ev.a === 'usuario') || accion === 'finalizacion') {
    return pack('entrega', esObservada ? 'observada' : 'inferida', 'Respuesta o entrega final de Gemini al usuario', estado === 'finalizado' ? 'finalizado' : 'entregando');
  }
  if (estado === 'desconocido' || estado === 'desconectado' || estado === 'libre') {
    return pack('desconocida', ev.origen === 'inferido' ? 'inferida' : 'desconocida', 'Sin señal activa reciente', estado || 'desconocido');
  }

  // 1) Subagentes / capacidades específicas
  if (tipoSub === 'browser' || /^browser_|navigate|click|scroll|screenshot/.test(h)) {
    return pack('navegacion', evTipo, 'Navegación o inspección web');
  }
  if (tipoSub === 'image-generator' || /\bimage-generator\b/.test(combinado)) {
    return pack('diseno_visual', evTipo, 'Generación de imagen visual');
  }

  // 2) Herramientas de lectura con análisis de contexto de archivo
  if (h === 'read_file' || h === 'view_file' || h === 'read_resource' || accion === 'lectura') {
    if (/(^|\/)(tests?|backup)\/|\.(log|png|jpg|jpeg|webp)$/.test(arch)) {
      return pack('verificacion', evTipo, `Inspección de resultado o prueba (${ev.archivo || 'archivo'})`);
    }
    if (/memoria|resumen|estado\.md|\.db$/.test(arch)) {
      return pack('memoria', evTipo, `Consulta de memoria/estado (${ev.archivo || 'archivo'})`);
    }
    return pack('lectura', evTipo, `Lectura documental (${ev.archivo || 'archivo'})`);
  }

  // 3) Herramientas de investigación y búsqueda
  if (h === 'search_web' || h === 'search_marketplace' || h === 'grep_search' || h === 'find_by_name' || h === 'list_dir' || accion === 'investigacion') {
    return pack('investigacion', evTipo, 'Búsqueda de información o código');
  }

  // 4) Escritura y edición diferenciada por contexto (redacción vs código vs diseño vs corrección)
  if (h === 'write_file') {
    if (/\.(png|jpg|jpeg|svg|webp)$|carrusel/.test(arch)) {
      return pack('diseno_visual', evTipo, `Creación visual (${ev.archivo || 'imagen'})`);
    }
    if (/\.(md|txt)$|guion|narrador|estado\.md/.test(arch)) {
      return pack('redaccion', evTipo, `Redacción documental/guion (${ev.archivo || 'documento'})`);
    }
    return pack('programacion', evTipo, `Escritura de código (${ev.archivo || 'archivo'})`);
  }
  if (h === 'edit_file' || h === 'replace_file_content' || h === 'multi_replace_file_content' || accion === 'escritura') {
    if (ctx.ultimoError || /\b(fix|correg|error|bug|fall[oa])\b/.test(txt)) {
      return pack('correccion', evTipo, `Corrección en ${ev.archivo || 'archivo'}`);
    }
    if (/\.(md|txt)$|guion|narrador|estado\.md/.test(arch)) {
      return pack('redaccion', evTipo, `Edición de texto/guion (${ev.archivo || 'documento'})`);
    }
    return pack('edicion_codigo', evTipo, `Edición de código (${ev.archivo || 'archivo'})`);
  }

  // 5) Comandos de terminal clasificados por propósito real
  if (h === 'run_command' || cmd) {
    if (/node\s+--test|\btests?\/|\bnpm\s+test\b|\bverify\b|\bverificar\b/.test(cmd)) {
      return pack('pruebas', evTipo, 'Ejecución de pruebas automatizadas');
    }
    if (/ffmpeg|render-reel|grabar-|capturar-|reels\/|\.mp4\b/.test(cmd)) {
      return pack('produccion_av', evTipo, 'Captura o renderizado audiovisual');
    }
    if (/\bvoz\b|tts|edge-tts|piper|\.wav\b|\.mp3\b|audio/.test(cmd)) {
      return pack('audio', evTipo, 'Procesamiento o síntesis de audio');
    }
    if (/memoria\.mjs|resumidor\.mjs|sqlite|memoria\.db/.test(cmd)) {
      return pack('memoria', evTipo, 'Operación de memoria local SQLite');
    }
    if (/ciclo\.mjs|metricas\.mjs|mundo\.mjs\s+estado|audit|sha256/.test(cmd)) {
      return pack('analisis', evTipo, 'Análisis de datos y métricas del proyecto');
    }
    if (/^\s*(rg|grep|find|ls|dir|git\s+(log|status|diff|show))\b/.test(cmd)) {
      return pack('investigacion', evTipo, 'Inspección y búsqueda en el proyecto');
    }
    if (/oficina\.mjs\s+evento/.test(cmd)) {
      return pack('planificacion', evTipo, 'Actualización de plan/estado de trabajo');
    }
    return pack('programacion', evTipo, 'Ejecución técnica de comandos');
  }

  // 6) Supervisión / planificación
  if (h === 'manage_task' || h === 'manage_subagents' || accion === 'revision' || estado === 'revisando') {
    return pack('verificacion', evTipo, 'Verificación de estado y resultados');
  }
  if (h === 'ask_question' || accion === 'planificacion' || estado === 'pensando') {
    return pack('planificacion', evTipo, 'Análisis y planificación de tarea');
  }

  // 7) Inferencia por texto si no hubo herramienta explícita
  if (/\b(v[ií]deo|reel|render|ffmpeg|grabar|toma)\b/.test(txt)) return pack('produccion_av', 'inferida', 'Deducido por contexto audiovisual');
  if (/\b(voz|audio|sonido|locuci[oó]n)\b/.test(txt)) return pack('audio', 'inferida', 'Deducido por contexto de audio');
  if (/\b(imagen|foto|dise[nñ]o|miniatura|carrusel)\b/.test(txt)) return pack('diseno_visual', 'inferida', 'Deducido por contexto visual');
  if (/\b(test|prueba|verifica|qa|audit)\b/.test(txt)) return pack('pruebas', 'inferida', 'Deducido por contexto de verificación');
  if (/\b(guion|redacta|escribe|historia)\b/.test(txt)) return pack('redaccion', 'inferida', 'Deducido por contexto de redacción');
  if (/\b(investiga|busca|explora|consulta)\b/.test(txt)) return pack('investigacion', 'inferida', 'Deducido por contexto de búsqueda');
  if (/\b(navega|instagram|tiktok|youtube|browser)\b/.test(txt)) return pack('navegacion', 'inferida', 'Deducido por contexto web');
  if (/\b(memoria|recuerda|resumen|sqlite)\b/.test(txt)) return pack('memoria', 'inferida', 'Deducido por contexto de memoria');

  if (txt) return pack('programacion', 'inferida', 'Actividad general de Gemini');
  return pack('desconocida', 'desconocida', 'Sin contexto suficiente');
}
