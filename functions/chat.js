/**
 * Racing Lab · Asistente (preguntarLab)
 * =====================================
 * El modelo (Claude) SOLO interpreta la pregunta y elige herramientas; no
 * tiene permiso para responder con conocimiento propio. Las cifras vienen de
 * lab-tools.js (código sobre Firestore). Tres salvaguardas en el servidor:
 *
 *  1. La respuesta final se da únicamente mediante la herramienta `responder`
 *     y un estado "ok" exige haber consultado datos reales en ese turno.
 *  2. Guardia numérica: toda cifra que aparezca en el texto debe aparecer
 *     literalmente en los resultados de las herramientas (o en la propia
 *     pregunta). Si no, se rechaza y, si persiste, se contesta "sin dato".
 *     Ojo: comprueba que la cifra EXISTE en los datos, no que se refiera a
 *     lo correcto; por eso las herramientas devuelven los totales ya hechos.
 *  3. Las fuentes y los enlaces los añade el servidor (no el modelo).
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");
const lab = require("./lab-tools");

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const CHAT_CODE = defineSecret("CHAT_CODE");

const MODELO = process.env.CHAT_MODEL || "claude-sonnet-5-5";
const LIMITE_DIARIO = Number(process.env.CHAT_LIMITE_DIARIO) || 300;
const MAX_RONDAS = 7;

const RESPONDER = {
  name: "responder",
  description:
    "ÚNICA forma de contestar al usuario. Llámala cuando tengas los resultados de las herramientas, o para pedir aclaración, o para decir que no hay dato.",
  input_schema: {
    type: "object",
    properties: {
      entendido: { type: "string", description: "Una línea: qué dato se está buscando exactamente, incluyendo la temporada 26/27." },
      estado: { type: "string", enum: ["ok", "aclarar", "sin_dato"] },
      respuesta: { type: "string", description: "Texto para el usuario. Breve." },
      opciones: { type: "array", items: { type: "string" }, description: "Solo con estado 'aclarar': opciones que el usuario puede pulsar." },
      modulos: { type: "array", items: { type: "string", enum: Object.keys(lab.MODULOS) }, description: "Módulos donde el usuario puede consultarlo." },
    },
    required: ["entendido", "estado", "respuesta"],
  },
};

function systemPrompt(hoy) {
  const modulos = Object.entries(lab.MODULOS).map(([id, m]) => `- ${id}: ${m.nombre}`).join("\n");
  const equipos = lab.CLUBES.map(c => c.nombre).join(", ");
  return `Eres el asistente del cuerpo técnico del Racing Club Portuense (Tercera Federación, Grupo 10, temporada 26/27). Hoy es ${hoy}.

REGLA PRINCIPAL: solo puedes afirmar lo que te devuelvan las herramientas en esta conversación. No uses conocimiento propio sobre fútbol, equipos, jugadores ni resultados. Si no hay herramienta o dato que lo cubra, estado "sin_dato".

CÓMO RESPONDER: termina SIEMPRE llamando a la herramienta "responder".
- Cifras: copia las cifras literalmente de los resultados. No sumes, restes, promedies ni calcules nada. Si hace falta un total que la herramienta no da, estado "sin_dato".
- Alcance: di siempre hasta qué jornada llegan los datos si la herramienta lo indica.
- Si un resultado trae "nota" o "aviso", respétalo y mencionalo si afecta a la respuesta.
- Un resultado con "sin_dato" o "error" no es una respuesta: no inventes alrededor.

AMBIGÜEDAD (nunca elijas por el usuario):
- Si una herramienta devuelve "aclarar", o "buscar_jugador" devuelve varios candidatos, estado "aclarar" y pon cada candidato como opción (jugador, equipo y dorsal habitual).
- Los jugadores se pueden pedir por nombre, nombre completo, nombre + equipo o dorsal + equipo. Un dorsal sin equipo no basta: pregunta el equipo.
- Si no se nombra equipo y no se habla en primera persona ("llevamos", "jugamos", "nuestro"), pregunta de qué equipo. "Nosotros" = Racing Club Portuense.
- La temporada es siempre 26/27; no la preguntes.
- Para un jugador: primero buscar_jugador y, cuando haya UNA sola coincidencia, partidos_jugador con su ref.

ESTILO: español de España, tuteo, directo, máximo 4 frases. Sin emojis. Sin Markdown salvo guiones para listas cortas. No hagas valoraciones tácticas ni opiniones.

MÓDULOS (usa solo estos ids en "modulos"):
${modulos}

EQUIPOS DEL GRUPO 10: ${equipos}.`;
}

/* ── Guardia numérica ── */
function digitos(texto) {
  return new Set((String(texto).match(/\d+/g) || []).map(x => String(Number(x))));
}
function cifrasNoVerificadas(textos, permitidos) {
  const malas = new Set();
  for (const t of textos) for (const d of digitos(t)) if (!permitidos.has(d)) malas.add(d);
  return [...malas];
}

/* ── Llamada a la API de Anthropic ── */
async function llamarClaude({ apiKey, system, messages, tools }) {
  const cuerpo = JSON.stringify({ model: MODELO, max_tokens: 1500, temperature: 0, system, messages, tools });
  for (let intento = 0; intento < 2; intento++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: cuerpo,
      signal: AbortSignal.timeout(45000),
    });
    if (r.ok) return r.json();
    if (intento === 0 && (r.status === 429 || r.status >= 500)) {
      await new Promise(res => setTimeout(res, 1500));
      continue;
    }
    const txt = await r.text().catch(() => "");
    throw new Error(`Anthropic ${r.status}: ${txt.slice(0, 200)}`);
  }
}

function normalizarHistorial(historial, pregunta) {
  const out = [];
  for (const h of (Array.isArray(historial) ? historial : []).slice(-8)) {
    const role = h && h.role === "assistant" ? "assistant" : "user";
    const content = String((h && h.text) || "").slice(0, 1500);
    if (!content) continue;
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += "\n" + content;
    else out.push({ role, content });
  }
  while (out.length && out[0].role !== "user") out.shift();
  if (out.length && out[out.length - 1].role === "user") out.pop(); // la última pregunta va aparte
  out.push({ role: "user", content: pregunta });
  // Debe alternar: si quedan dos user seguidos, se unen
  const fin = [];
  for (const m of out) {
    if (fin.length && fin[fin.length - 1].role === m.role) fin[fin.length - 1].content += "\n" + m.content;
    else fin.push(m);
  }
  return fin;
}

const FALLBACK = {
  estado: "sin_dato",
  entendido: "",
  respuesta: "No he podido verificar esta respuesta con los datos del Lab, así que prefiero no darte una cifra dudosa.",
  opciones: [],
  modulos: [],
  fuentes: [],
};

/**
 * Núcleo, sin Firebase ni red salvo `llamar` (inyectable para pruebas).
 */
async function procesarPregunta({ db, llamar, pregunta, historial, hoy }) {
  const mensajes = normalizarHistorial(historial, pregunta);
  const tools = [...lab.TOOL_DEFS, RESPONDER];
  const system = systemPrompt(hoy);
  const usadas = []; // {nombre, args, resultado}
  let reintentosCifras = 0;
  let avisoProtocolo = false;

  const permitidosBase = new Set(["26", "27", "2026", "2027", ...digitos(pregunta)]);

  for (let ronda = 0; ronda < MAX_RONDAS; ronda++) {
    const resp = await llamar({ system, messages: mensajes, tools });
    const bloques = Array.isArray(resp.content) ? resp.content : [];
    const usos = bloques.filter(b => b.type === "tool_use");

    if (!usos.length) {
      if (avisoProtocolo) break;
      avisoProtocolo = true;
      mensajes.push({ role: "assistant", content: bloques.length ? bloques : [{ type: "text", text: "(sin respuesta)" }] });
      mensajes.push({ role: "user", content: "Responde únicamente llamando a la herramienta responder." });
      continue;
    }

    mensajes.push({ role: "assistant", content: bloques });
    const resultados = [];
    const resp_ = usos.find(u => u.name === "responder");
    const datos = usos.filter(u => u.name !== "responder");

    for (const u of datos) {
      const r = await lab.ejecutarHerramienta(db, u.name, u.input, { hoy });
      usadas.push({ nombre: u.name, args: u.input, resultado: r });
      resultados.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(r) });
    }

    if (resp_ && datos.length) {
      resultados.push({ type: "tool_result", tool_use_id: resp_.id, is_error: true,
        content: "Aún no: acabas de pedir datos. Mira los resultados y vuelve a llamar a responder." });
      mensajes.push({ role: "user", content: resultados });
      continue;
    }

    if (!resp_) {
      mensajes.push({ role: "user", content: resultados });
      continue;
    }

    /* ── Validación de la respuesta final ── */
    const a = resp_.input || {};
    const estado = ["ok", "aclarar", "sin_dato"].includes(a.estado) ? a.estado : "sin_dato";
    const opciones = Array.isArray(a.opciones) ? a.opciones.map(String).slice(0, 8) : [];
    const textos = [a.entendido || "", a.respuesta || "", ...opciones];

    const buenas = usadas.filter(u => u.resultado && u.resultado.fuente && !u.resultado.sin_dato && !u.resultado.error && !u.resultado.aclarar);

    if (estado === "ok" && !buenas.length) {
      mensajes.push({ role: "user", content: [{ type: "tool_result", tool_use_id: resp_.id, is_error: true,
        content: "Estado 'ok' exige datos de las herramientas en esta conversación. Consulta los datos o usa 'sin_dato'." }] });
      continue;
    }

    const permitidos = new Set(permitidosBase);
    for (const u of usadas) for (const d of digitos(JSON.stringify(u.resultado))) permitidos.add(d);
    const malas = cifrasNoVerificadas(textos, permitidos);
    if (malas.length) {
      if (reintentosCifras < 1) {
        reintentosCifras++;
        mensajes.push({ role: "user", content: [{ type: "tool_result", tool_use_id: resp_.id, is_error: true,
          content: `Tu respuesta contiene cifras que no aparecen en los resultados de las herramientas: ${malas.join(", ")}. Usa solo cifras literales de los resultados, sin calcular nada. Corrige o usa 'sin_dato'.` }] });
        continue;
      }
      return { ...FALLBACK, pendienteSugerido: true, herramientas: usadas.map(u => u.nombre), cifrasRechazadas: malas };
    }

    /* ── Respuesta aceptada: fuentes y módulos los pone el servidor ── */
    const sugeridos = [];
    for (const u of usadas) for (const m of (u.resultado && u.resultado.modulos_sugeridos) || []) if (!sugeridos.includes(m)) sugeridos.push(m);
    let ids = (Array.isArray(a.modulos) ? a.modulos : []).filter(m => lab.MODULOS[m]);
    if (estado !== "aclarar" && !ids.length) ids = sugeridos;
    const modulos = [...new Set(ids)].slice(0, 3).map(id => ({ id, ...lab.MODULOS[id] }));
    const fuentes = estado === "ok" ? [...new Set(buenas.map(u => u.resultado.fuente))] : [];

    return {
      estado,
      entendido: String(a.entendido || ""),
      respuesta: String(a.respuesta || ""),
      opciones: estado === "aclarar" ? opciones : [],
      modulos: estado === "aclarar" ? [] : modulos,
      fuentes,
      pendienteSugerido: estado === "sin_dato",
      herramientas: usadas.map(u => u.nombre),
    };
  }
  return { ...FALLBACK, pendienteSugerido: true, herramientas: usadas.map(u => u.nombre) };
}

/* ── Control de acceso y coste ── */
function codigoValido(dado, esperado) {
  if (!dado || !esperado) return false;
  const h = s => crypto.createHash("sha256").update(String(s)).digest();
  return crypto.timingSafeEqual(h(dado), h(esperado));
}
const hoyMadrid = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

async function contarUso(db) {
  const ref = db.collection("chatUso").doc(hoyMadrid());
  const s = await ref.get();
  const n = s.exists ? Number(s.data().n) || 0 : 0;
  if (n >= LIMITE_DIARIO) return false;
  await ref.set({ n: n + 1 }, { merge: true });
  return true;
}

exports.preguntarLab = onCall(
  { region: "europe-west1", timeoutSeconds: 90, memory: "512MiB", cors: true, secrets: [ANTHROPIC_API_KEY, CHAT_CODE] },
  async (req) => {
    const d = req.data || {};
    if (!codigoValido(d.codigo, CHAT_CODE.value())) {
      throw new HttpsError("permission-denied", "Código incorrecto");
    }
    const db = admin.firestore();
    const accion = d.accion || "preguntar";

    if (accion === "verificar") return { ok: true };

    if (accion === "pendiente") {
      const pregunta = String(d.pregunta || "").trim().slice(0, 600);
      if (!pregunta) throw new HttpsError("invalid-argument", "Falta la pregunta");
      const ref = await db.collection("preguntasPendientes").add({
        pregunta,
        nombre: String(d.nombre || "").trim().slice(0, 60),
        contexto: (Array.isArray(d.contexto) ? d.contexto : []).slice(-4).map(x => String(x).slice(0, 500)),
        estado: "nueva",
        temporada: lab.TEMPORADA,
        creadaEn: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { ok: true, id: ref.id };
    }

    if (accion === "bandeja") {
      const s = await db.collection("preguntasPendientes").where("estado", "==", "nueva").get();
      const items = s.docs.map(x => {
        const v = x.data();
        return { id: x.id, pregunta: v.pregunta, nombre: v.nombre || "", contexto: v.contexto || [],
                 creadaEn: v.creadaEn && v.creadaEn.toMillis ? v.creadaEn.toMillis() : 0 };
      }).sort((a, b) => b.creadaEn - a.creadaEn).slice(0, 30);
      return { ok: true, items };
    }

    if (accion === "resolver") {
      if (!d.id) throw new HttpsError("invalid-argument", "Falta el id");
      await db.collection("preguntasPendientes").doc(String(d.id)).update({
        estado: "resuelta", resueltaEn: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { ok: true };
    }

    /* accion === "preguntar" */
    const pregunta = String(d.pregunta || "").trim().slice(0, 500);
    if (!pregunta) throw new HttpsError("invalid-argument", "Falta la pregunta");
    if (!(await contarUso(db))) {
      throw new HttpsError("resource-exhausted", "Se ha alcanzado el límite diario de preguntas.");
    }
    const apiKey = ANTHROPIC_API_KEY.value();
    let r;
    try {
      r = await procesarPregunta({
        db, pregunta, historial: d.historial, hoy: hoyMadrid(),
        llamar: (p) => llamarClaude({ apiKey, ...p }),
      });
    } catch (e) {
      console.error("[preguntarLab]", e);
      throw new HttpsError("internal", "No he podido procesar la pregunta ahora mismo.");
    }
    // Registro para poder auditar fiabilidad (pregunta, estado, herramientas)
    db.collection("chatLog").add({
      pregunta, estado: r.estado, herramientas: r.herramientas || [],
      respuesta: String(r.respuesta || "").slice(0, 600),
      cifrasRechazadas: r.cifrasRechazadas || [],
      ts: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {});
    return r;
  }
);

exports._test = { procesarPregunta, cifrasNoVerificadas, normalizarHistorial, codigoValido };
