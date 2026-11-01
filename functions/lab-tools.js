/**
 * Racing Lab · Herramientas del asistente (lab-tools.js)
 * ======================================================
 * TODO lo que el asistente puede afirmar sale de aquí. El modelo de lenguaje
 * solo interpreta la pregunta y decide a qué herramienta llamar; las cifras
 * las calcula este fichero a partir de Firestore (mismo principio que
 * stats_engine.py: si un número aparece en una respuesta, salió de código).
 *
 * Es código puro: recibe `db` (Firestore admin o un doble de pruebas) y no
 * toca la red. Así se puede probar sin Firebase ni API.
 */

const TEMPORADA = "2026-27";
const INICIO_TEMPORADA = "2026-07-01"; // para filtrar por fecha sesiones sin campo temporada fiable
const BASE_URL = "https://ruedagomez.github.io/racingLab/";

/* ── Módulos a los que se puede remitir. El modelo elige un id; la URL sale de aquí. ── */
const MODULOS = {
  analisis:       { nombre: "Análisis · informes de rival", url: BASE_URL + "analisis.html" },
  tercera:        { nombre: "Tercera RFEF · clasificación y equipos", url: BASE_URL + "tercera.html" },
  calendario:     { nombre: "Calendario", url: BASE_URL + "calendario.html" },
  entrenamientos: { nombre: "Entrenamientos", url: BASE_URL + "entrenamientos.html" },
  asistencia:     { nombre: "Asistencia y Multas", url: BASE_URL + "asistencia.html" },
  actas:          { nombre: "Actas", url: BASE_URL + "actas.html" },
  diapartido:     { nombre: "Día de Partido", url: BASE_URL + "diapartido.html" },
  plantilla:      { nombre: "Plantilla", url: BASE_URL + "plantilla.html" },
  estadisticas:   { nombre: "Estadísticas", url: BASE_URL + "estadisticas.html" },
  performance:    { nombre: "Performance", url: BASE_URL + "performance.html" },
  cuerpotecnico:  { nombre: "Cuerpo Técnico", url: BASE_URL + "cuerpo-tecnico.html" },
};

/* ── Clubes del Grupo 10 (ids = los de tercera.html y pep_scraper.py) ── */
const CLUBES = [
  { id: "racing",       nombre: "Racing Club Portuense", alias: ["racing", "portuense", "rcp", "nosotros"], extra: "rcp el puerto de santa maria" },
  { id: "san-roque",    nombre: "San Roque de Lepe",     alias: ["san roque", "lepe"], extra: "srl" },
  { id: "xerez-dfc",    nombre: "Xerez DFC",             alias: ["xerez", "jerez"], extra: "xdf jerez de la frontera" },
  { id: "onubense",     nombre: "Atlético Onubense",     alias: ["onubense", "atletico onubense", "huelva"], extra: "aon" },
  { id: "cadiz-b",      nombre: "Cádiz CF Mirandilla",   alias: ["cadiz", "mirandilla", "cadiz b"], extra: "cdz" },
  { id: "pozoblanco",   nombre: "CD Pozoblanco",         alias: ["pozoblanco"], extra: "poz" },
  { id: "ceuta-b",      nombre: "AD Ceuta FC B",         alias: ["ceuta"], extra: "ceu" },
  { id: "bollullos",    nombre: "Bollullos CF",          alias: ["bollullos"], extra: "bcf" },
  { id: "sevilla-c",    nombre: "Sevilla FC C",          alias: ["sevilla", "sevilla c"], extra: "sev" },
  { id: "dos-hermanas", nombre: "Dos Hermanas CF 1971",  alias: ["dos hermanas", "dh71"], extra: "" },
  { id: "egabrense",    nombre: "Egabrense",             alias: ["egabrense", "cabra"], extra: "ega" },
  { id: "linense",      nombre: "RB Linense",            alias: ["linense", "la linea"], extra: "rbl real balompedica" },
  { id: "tomares",      nombre: "UD Tomares",            alias: ["tomares"], extra: "tom" },
  { id: "utrera",       nombre: "CD Utrera",             alias: ["utrera"], extra: "utr" },
  { id: "chiclana",     nombre: "Chiclana CF",           alias: ["chiclana"], extra: "chi" },
  { id: "conil",        nombre: "Conil CF",              alias: ["conil"], extra: "cnl" },
  { id: "cordoba-b",    nombre: "Córdoba CF B",          alias: ["cordoba", "cordoba b"], extra: "cor" },
  { id: "betis-c",      nombre: "Real Betis C",          alias: ["betis", "betis c", "real betis"], extra: "rbc" },
];
const CLUB_POR_ID = Object.fromEntries(CLUBES.map(c => [c.id, c]));

/* ── Calendario oficial 26/27 (idéntico a calendario.html; contrastado con el PDF de la RFAF) ── */
const RIVAL_A_ID = {
  "Xerez DFC": "xerez-dfc", "San Roque de Lepe": "san-roque", "CD Egabrense": "egabrense",
  "Chiclana CF": "chiclana", "UD Tomares": "tomares", "Dos Hermanas CF 1971": "dos-hermanas",
  "Conil CF": "conil", "CD Pozoblanco": "pozoblanco", "CD Utrera": "utrera",
  "Cádiz CF Mirandilla": "cadiz-b", "RB Linense": "linense", "Córdoba CF B": "cordoba-b",
  "AD Ceuta B": "ceuta-b", "At. Onubense": "onubense", "Sevilla FC C": "sevilla-c",
  "Bollullos CF": "bollullos", "Real Betis C": "betis-c",
};
const LIGA_2627 = [
  { j: 1, d: "2026-09-06", r: "Xerez DFC", c: 0 }, { j: 2, d: "2026-09-13", r: "San Roque de Lepe", c: 1 },
  { j: 3, d: "2026-09-20", r: "CD Egabrense", c: 0 }, { j: 4, d: "2026-09-27", r: "Chiclana CF", c: 1 },
  { j: 5, d: "2026-10-04", r: "UD Tomares", c: 0 }, { j: 6, d: "2026-10-11", r: "Dos Hermanas CF 1971", c: 1 },
  { j: 7, d: "2026-10-18", r: "Conil CF", c: 0 }, { j: 8, d: "2026-10-25", r: "CD Pozoblanco", c: 1 },
  { j: 9, d: "2026-11-01", r: "CD Utrera", c: 0 }, { j: 10, d: "2026-11-08", r: "Cádiz CF Mirandilla", c: 1 },
  { j: 11, d: "2026-11-15", r: "RB Linense", c: 0 }, { j: 12, d: "2026-11-22", r: "Córdoba CF B", c: 1 },
  { j: 13, d: "2026-11-29", r: "AD Ceuta B", c: 0 }, { j: 14, d: "2026-12-06", r: "At. Onubense", c: 1 },
  { j: 15, d: "2026-12-08", r: "Sevilla FC C", c: 1 }, { j: 16, d: "2026-12-13", r: "Bollullos CF", c: 0 },
  { j: 17, d: "2026-12-20", r: "Real Betis C", c: 1 }, { j: 18, d: "2027-01-03", r: "Xerez DFC", c: 1 },
  { j: 19, d: "2027-01-10", r: "San Roque de Lepe", c: 0 }, { j: 20, d: "2027-01-17", r: "CD Egabrense", c: 1 },
  { j: 21, d: "2027-01-24", r: "Chiclana CF", c: 0 }, { j: 22, d: "2027-01-31", r: "UD Tomares", c: 1 },
  { j: 23, d: "2027-02-07", r: "Dos Hermanas CF 1971", c: 0 }, { j: 24, d: "2027-02-14", r: "Conil CF", c: 1 },
  { j: 25, d: "2027-02-21", r: "CD Pozoblanco", c: 0 }, { j: 26, d: "2027-02-28", r: "CD Utrera", c: 1 },
  { j: 27, d: "2027-03-07", r: "Cádiz CF Mirandilla", c: 0 }, { j: 28, d: "2027-03-14", r: "RB Linense", c: 1 },
  { j: 29, d: "2027-03-21", r: "Córdoba CF B", c: 0 }, { j: 30, d: "2027-04-04", r: "AD Ceuta B", c: 1 },
  { j: 31, d: "2027-04-11", r: "At. Onubense", c: 0 }, { j: 32, d: "2027-04-18", r: "Sevilla FC C", c: 0 },
  { j: 33, d: "2027-04-25", r: "Bollullos CF", c: 1 }, { j: 34, d: "2027-05-02", r: "Real Betis C", c: 0 },
];

/* ── Utilidades ── */
function norm(s) {
  if (s == null) return "";
  return String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, " ").split(/\s+/).filter(Boolean).join(" ");
}
const STOP = new Set(["cf", "cd", "ud", "fc", "club", "de", "la", "el", "los", "las", "b", "c", "del", "real", "sad"]);
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const ddmmyyyy = iso => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
const diaSemana = iso => DIAS[new Date(iso + "T12:00:00Z").getUTCDay()];
const fechaTexto = iso => `${diaSemana(iso)} ${ddmmyyyy(iso)}`;

/* Caché en memoria de la instancia: evita releer miles de documentos en
   preguntas seguidas. 2 min: una jornada recién cargada se ve enseguida. */
const CACHE = new Map();
const CACHE_MS = 120 * 1000;
async function leer(db, col, filtros = []) {
  const clave = col + JSON.stringify(filtros);
  const hit = CACHE.get(clave);
  if (hit && Date.now() - hit.t < CACHE_MS) return hit.v;
  let q = db.collection(col);
  for (const [f, op, v] of filtros) q = q.where(f, op, v);
  const snap = await q.get();
  const v = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
  CACHE.set(clave, { t: Date.now(), v });
  return v;
}
function limpiarCache() { CACHE.clear(); }

/* ── Resolución determinista de equipos ── */
function resolverEquipo(texto) {
  const q = norm(texto);
  if (!q) return { candidatos: [] };
  const exactos = CLUBES.filter(c => c.alias.includes(q) || norm(c.nombre) === q);
  if (exactos.length) return { candidatos: exactos };
  const toks = q.split(" ").filter(t => !STOP.has(t) && t.length >= 2);
  if (!toks.length) return { candidatos: [] };
  const cand = CLUBES.filter(c => {
    const bolsa = (norm(c.nombre) + " " + c.alias.join(" ") + " " + c.extra).split(" ");
    return toks.every(t => bolsa.some(b => b.startsWith(t)));
  });
  return { candidatos: cand };
}
function equipoOAclarar(texto) {
  const { candidatos } = resolverEquipo(texto);
  if (candidatos.length === 1) return { club: candidatos[0] };
  if (candidatos.length === 0) {
    return { aclarar: true, motivo: `No reconozco ningún equipo del Grupo 10 con "${texto}".`,
             candidatos: CLUBES.map(c => c.nombre) };
  }
  return { aclarar: true, motivo: `"${texto}" puede ser más de un equipo.`, candidatos: candidatos.map(c => c.nombre) };
}

/* ══════════════ HERRAMIENTAS ══════════════ */

async function goleadores_equipo(db, { equipo, limite }) {
  const r = equipoOAclarar(equipo);
  if (!r.club) return r;
  const snap = await db.collection("rivalStats").doc(r.club.id).get();
  if (!snap.exists) {
    return { sin_dato: true, motivo: `No hay estadísticas calculadas de ${r.club.nombre}.`, modulos_sugeridos: ["analisis"] };
  }
  const st = snap.data();
  const todos = (st.goleadores || []).map(g => ({
    nombre: g.nombre, dorsal: g.dorsal || null, goles: g.goles, penaltis: g.penaltis || 0,
    dorsal_variable: !!g.dorsalVariable,
  }));
  if (!todos.length) {
    return { sin_dato: true, motivo: `${r.club.nombre}: no consta ningún gol con autor en las actas cargadas.`, modulos_sugeridos: ["analisis"] };
  }
  const max = todos[0].goles;
  const n = Math.max(1, Math.min(Number(limite) || 5, 10));
  const gfEquipo = st.clasificacion?.propia?.gf;
  const suma = todos.reduce((s, g) => s + g.goles, 0);
  return {
    fuente: `Actas RFAF · ${r.club.nombre} · hasta J${st.hastaJornada}`,
    equipo: r.club.nombre,
    hasta_jornada: st.hastaJornada,
    maximo_goleador: todos.filter(g => g.goles === max).map(g => ({ nombre: g.nombre, dorsal: g.dorsal, goles: g.goles })),
    empate_en_cabeza: todos.filter(g => g.goles === max).length > 1,
    clasificacion_goleadores: todos.slice(0, n),
    goles_a_favor_equipo: gfEquipo ?? null,
    goles_con_autor_sumados: suma,
    nota: "Los goles en propia puerta del rival no cuentan como goleador. Si goles_a_favor_equipo es mayor que goles_con_autor_sumados, esa diferencia son goles en propia puerta rival o sin autor en el acta.",
    modulos_sugeridos: ["analisis"],
  };
}

async function alineacionesDe(db, clubId) {
  const filtros = [["temporada", "==", TEMPORADA]];
  if (clubId) filtros.push(["equipo_id", "==", clubId]);
  return leer(db, "alineaciones", filtros);
}

async function buscar_jugador(db, { texto, equipo, dorsal }) {
  let club = null;
  if (equipo) {
    const r = equipoOAclarar(equipo);
    if (!r.club) return r;
    club = r.club;
  }
  const q = norm(texto);
  const dor = dorsal != null && String(dorsal).trim() !== "" ? String(dorsal).trim() : null;
  if (!q && !dor) return { aclarar: true, motivo: "Falta el nombre o el dorsal del jugador." };
  if (!q && dor && !club) {
    return { aclarar: true, motivo: "Un dorsal solo no identifica a nadie: se repite en cada equipo. ¿De qué equipo?",
             candidatos: CLUBES.map(c => c.nombre) };
  }
  const filas = await alineacionesDe(db, club ? club.id : null);
  const grupos = new Map();
  for (const a of filas) {
    const n = norm(a.jugador);
    if (!n) continue;
    const k = a.equipo_id + "|" + n;
    let g = grupos.get(k);
    if (!g) { g = { equipo_id: a.equipo_id, nombre: a.jugador, n, dorsales: {}, apariciones: 0 }; grupos.set(k, g); }
    g.apariciones++;
    const d = String(a.dorsal ?? "").trim();
    if (d) g.dorsales[d] = (g.dorsales[d] || 0) + 1;
  }
  const toks = q ? q.split(" ") : [];
  const cand = [...grupos.values()].filter(g => {
    const bolsa = g.n.split(" ");
    if (!toks.every(t => bolsa.some(b => b.startsWith(t)))) return false;
    if (dor && !(dor in g.dorsales)) return false;
    return true;
  }).sort((a, b) => b.apariciones - a.apariciones || a.n.localeCompare(b.n));
  if (!cand.length) {
    return { sin_dato: true,
      motivo: `No hay ningún jugador de esta temporada que coincida con "${texto || ""}"${dor ? " y dorsal " + dor : ""}${club ? " en " + club.nombre : ""} en las actas cargadas.`,
      modulos_sugeridos: ["plantilla", "analisis"] };
  }
  const salida = cand.slice(0, 8).map(g => {
    const ds = Object.entries(g.dorsales).sort((a, b) => b[1] - a[1]).map(x => x[0]);
    return {
      ref: g.equipo_id + "|" + g.n,
      jugador: g.nombre,
      equipo: CLUB_POR_ID[g.equipo_id]?.nombre || g.equipo_id,
      dorsal_habitual: ds[0] || null,
      dorsales_usados: ds,
      apariciones_en_acta: g.apariciones,
    };
  });
  return {
    fuente: `Alineaciones de actas RFAF · temporada ${TEMPORADA}`,
    total_coincidencias: cand.length,
    mostrando: salida.length,
    candidatos: salida,
    regla: cand.length === 1
      ? "Una sola coincidencia: se puede continuar con su ref."
      : "Hay varias coincidencias: NO elijas. Pide confirmación al usuario con estas opciones.",
  };
}

async function partidos_jugador(db, { ref }) {
  const [equipoId, n] = String(ref || "").split("|");
  const club = CLUB_POR_ID[equipoId];
  if (!club || !n) return { error: "ref inválida: usa la ref devuelta por buscar_jugador." };
  const [loc, vis, alin] = await Promise.all([
    leer(db, "actas", [["temporada", "==", TEMPORADA], ["equipo_local", "==", equipoId]]),
    leer(db, "actas", [["temporada", "==", TEMPORADA], ["equipo_visitante", "==", equipoId]]),
    alineacionesDe(db, equipoId),
  ]);
  const actas = [...loc, ...vis].sort((a, b) => Number(a.jornada) - Number(b.jornada));
  if (!actas.length) {
    return { sin_dato: true, motivo: `No hay actas cargadas de ${club.nombre}.`, modulos_sugeridos: ["actas"] };
  }
  const mias = new Map();
  for (const a of alin) if (norm(a.jugador) === n) mias.set(a.cod_acta, a);
  const nombre = [...mias.values()][0]?.jugador || n;
  const partidos = actas.map(ac => {
    const cod = ac.cod_acta || ac._id;
    const esLocal = ac.equipo_local === equipoId;
    const rivalId = esLocal ? ac.equipo_visitante : ac.equipo_local;
    const gf = esLocal ? ac.goles_local : ac.goles_visitante;
    const gc = esLocal ? ac.goles_visitante : ac.goles_local;
    const r = mias.get(cod);
    let estado = "no figura en el acta";
    let minutos = null;
    if (r) {
      minutos = typeof r.minutos === "number" ? r.minutos : null;
      if (r.condicion === "TITULAR") estado = "titular";
      else if (minutos === null) estado = "suplente";
      else estado = minutos > 0 ? "suplente (entró)" : "suplente (no entró)";
    }
    return {
      jornada: Number(ac.jornada), rival: CLUB_POR_ID[rivalId]?.nombre || rivalId,
      condicion: esLocal ? "casa" : "fuera", marcador: `${gf ?? 0}-${gc ?? 0}`,
      estado, minutos,
    };
  });
  const ultima = partidos[partidos.length - 1];
  const noFigura = partidos.filter(p => p.estado === "no figura en el acta").map(p => p.jornada);
  return {
    fuente: `Actas RFAF · ${club.nombre} · hasta J${ultima.jornada}`,
    jugador: nombre, equipo: club.nombre,
    partidos_con_acta: partidos.length,
    ultima_jornada_con_acta: ultima.jornada,
    ultima_jornada_detalle: ultima,
    jornadas_en_las_que_no_figura: noFigura,
    numero_de_jornadas_en_las_que_no_figura: noFigura.length,
    titular_veces: partidos.filter(p => p.estado === "titular").length,
    detalle_por_jornada: partidos,
    nota: "Que no figure en el acta significa que no fue convocado ni inscrito en ese partido; el motivo (lesión, sanción, decisión técnica) no consta en las actas.",
    modulos_sugeridos: ["actas", "diapartido"],
  };
}

async function calendario_racing(db, { rival, condicion, jornada, proximos, hoy }) {
  let lista = LIGA_2627.map(p => ({ ...p, rivalId: RIVAL_A_ID[p.r] }));
  let filtroRival = null;
  if (rival) {
    const r = equipoOAclarar(rival);
    if (!r.club) return r;
    if (r.club.id === "racing") return { aclarar: true, motivo: "Racing es nuestro equipo: ¿contra qué rival?", candidatos: CLUBES.filter(c => c.id !== "racing").map(c => c.nombre) };
    filtroRival = r.club;
    lista = lista.filter(p => p.rivalId === r.club.id);
  }
  if (condicion === "casa") lista = lista.filter(p => p.c === 1);
  if (condicion === "fuera") lista = lista.filter(p => p.c === 0);
  if (jornada != null) lista = lista.filter(p => p.j === Number(jornada));
  if (proximos) lista = lista.filter(p => p.d >= hoy).slice(0, 3);
  if (!lista.length) return { sin_dato: true, motivo: "Ningún partido del calendario coincide con esa consulta.", modulos_sugeridos: ["calendario"] };

  const [loc, vis] = await Promise.all([
    leer(db, "actas", [["temporada", "==", TEMPORADA], ["equipo_local", "==", "racing"]]),
    leer(db, "actas", [["temporada", "==", TEMPORADA], ["equipo_visitante", "==", "racing"]]),
  ]);
  const porJornada = new Map([...loc, ...vis].map(a => [Number(a.jornada), a]));
  return {
    fuente: "Calendario oficial RFAF 26/27 (el de calendario.html)",
    hoy,
    partidos: lista.map(p => {
      const ac = porJornada.get(p.j);
      const gf = ac ? (ac.equipo_local === "racing" ? ac.goles_local : ac.goles_visitante) : null;
      const gc = ac ? (ac.equipo_local === "racing" ? ac.goles_visitante : ac.goles_local) : null;
      return {
        jornada: p.j, fecha: fechaTexto(p.d), rival: p.r,
        donde: p.c ? "en casa" : `fuera (en ${p.r})`,
        resultado_si_jugado: ac ? `${gf}-${gc}` : null,
      };
    }),
    nota: "El calendario no incluye horas ni aplazamientos posteriores a su carga. Para la hora, consultar el calendario oficial de la RFAF o el módulo Calendario.",
    modulos_sugeridos: ["calendario"],
  };
}

async function entrenamientos_resumen(db, { desde, hasta }) {
  const d0 = desde || INICIO_TEMPORADA;
  const d1 = hasta || "9999-12-31";
  const [ses, asi] = await Promise.all([leer(db, "trainingSessions"), leer(db, "attendance")]);
  const sesOk = ses.filter(s => s.deleted !== true && s.date >= d0 && s.date <= d1).map(s => s.date).sort();
  const asiOk = asi.filter(s => s.date >= d0 && s.date <= d1).map(s => s.date).sort();
  if (!sesOk.length && !asiOk.length) {
    return { sin_dato: true, motivo: "No hay sesiones registradas en ese periodo.", modulos_sugeridos: ["entrenamientos", "asistencia"] };
  }
  return {
    fuente: "Entrenamientos y Asistencia (datos registrados por el cuerpo técnico)",
    periodo: { desde: d0, hasta: hasta || null },
    sesiones_registradas_en_modulo_entrenamientos: sesOk.length,
    primera_sesion_entrenamientos: sesOk[0] ? ddmmyyyy(sesOk[0]) : null,
    ultima_sesion_entrenamientos: sesOk.length ? ddmmyyyy(sesOk[sesOk.length - 1]) : null,
    sesiones_con_asistencia_registrada: asiOk.length,
    primera_sesion_asistencia: asiOk[0] ? ddmmyyyy(asiOk[0]) : null,
    ultima_sesion_asistencia: asiOk.length ? ddmmyyyy(asiOk[asiOk.length - 1]) : null,
    nota: "Son dos registros distintos y pueden no coincidir: uno es la sesión planificada/subida en Entrenamientos y otro la lista pasada en Asistencia. Ninguno distingue por sí solo un entrenamiento de otro tipo de sesión. Da las dos cifras y di a qué módulo corresponde cada una.",
    modulos_sugeridos: ["entrenamientos", "asistencia"],
  };
}

/* ── Definición para el modelo (nombre, descripción, esquema) ── */
const TOOL_DEFS = [
  {
    name: "goleadores_equipo",
    description: "Goleadores de un equipo del Grupo 10 esta temporada (desde actas RFAF): máximo goleador y clasificación. 'equipo' es texto libre (p. ej. 'Chiclana', 'Mirandilla'); el servidor lo resuelve y, si es ambiguo, devuelve aclarar.",
    input_schema: { type: "object", properties: { equipo: { type: "string" }, limite: { type: "integer", description: "cuántos goleadores listar (1-10, por defecto 5)" } }, required: ["equipo"] },
  },
  {
    name: "buscar_jugador",
    description: "Busca jugadores de esta temporada en las alineaciones de las actas. Se puede buscar por nombre (parcial o completo), por nombre + equipo, o por dorsal + equipo. Devuelve candidatos con una 'ref'. Si hay varios, hay que pedir confirmación al usuario.",
    input_schema: { type: "object", properties: { texto: { type: "string", description: "nombre o apellido; vacío si se busca solo por dorsal" }, equipo: { type: "string", description: "equipo (texto libre), opcional" }, dorsal: { type: "string" } } },
  },
  {
    name: "partidos_jugador",
    description: "Participación de un jugador (por 'ref' de buscar_jugador) en cada partido con acta de su equipo: titular, suplente, minutos o 'no figura en el acta'. Sirve para '¿jugó X la jornada pasada?', '¿ha faltado X a algún partido?'.",
    input_schema: { type: "object", properties: { ref: { type: "string" } }, required: ["ref"] },
  },
  {
    name: "calendario_racing",
    description: "Calendario oficial de liga del Racing 26/27 (jornada, fecha, rival, casa/fuera) y resultado si ya hay acta. Filtros opcionales: rival (texto libre), condicion ('casa'|'fuera'), jornada (número), proximos (true = los próximos 3 partidos desde hoy).",
    input_schema: { type: "object", properties: { rival: { type: "string" }, condicion: { type: "string", enum: ["casa", "fuera"] }, jornada: { type: "integer" }, proximos: { type: "boolean" } } },
  },
  {
    name: "entrenamientos_resumen",
    description: "Cuántas sesiones hay registradas esta temporada: en el módulo Entrenamientos y en Asistencia (dos registros distintos). Fechas opcionales en formato AAAA-MM-DD.",
    input_schema: { type: "object", properties: { desde: { type: "string" }, hasta: { type: "string" } } },
  },
];

const IMPL = { goleadores_equipo, buscar_jugador, partidos_jugador, calendario_racing, entrenamientos_resumen };

async function ejecutarHerramienta(db, nombre, args, ctx = {}) {
  const f = IMPL[nombre];
  if (!f) return { error: `Herramienta desconocida: ${nombre}` };
  try {
    return await f(db, { ...(args || {}), hoy: ctx.hoy });
  } catch (e) {
    console.error("[lab-tools]", nombre, e);
    return { error: "Fallo interno consultando los datos." };
  }
}

module.exports = {
  TEMPORADA, MODULOS, CLUBES, TOOL_DEFS, ejecutarHerramienta, norm, resolverEquipo,
  limpiarCache, LIGA_2627, _impl: IMPL,
};
