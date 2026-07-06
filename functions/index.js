/**
 * Racing Lab — Cloud Function: cargarDesdeLapreferente
 * Scrapea plantilla + cuerpo técnico de lapreferente.com para un equipo
 * del Grupo 10 de Tercera Federación y devuelve JSON normalizado al
 * esquema de Firestore existente (rivals/{clubId}/players|staff).
 *
 * IMPORTANTE — selectores escritos SIN haber visto el HTML real
 * (el mapa viene del brief). Si el parseo devuelve 0 registros, la
 * respuesta incluye debugHtml con los primeros 6000 caracteres del HTML
 * recibido para ajustar selectores en Fase 3.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const cheerio = require("cheerio");
const iconv = require("iconv-lite");

admin.initializeApp();
const db = admin.firestore();

/* ── Config ── */
const CLOUDINARY_CLOUD = "dprtymvge";
const CLOUDINARY_PRESET = "racing_lab"; // unsigned, mismo que el resto del proyecto
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — 1 petición/equipo/día máximo
const COMP_TOKEN = "C26702-1"; // Tercera Federación Grupo 10 (Andalucía)
const PHOTO_DELAY_MS = 300;

/* ── Léxico para clasificación (heurístico, ajustable en Fase 3) ── */
const STAFF_ROLES = [
  "entrenador", "segundo entrenador", "2º entrenador", "preparador físico",
  "preparador fisico", "entrenador de porteros", "delegado", "fisioterapeuta",
  "fisio", "utillero", "director deportivo", "coordinador", "médico", "medico",
  "analista", "readaptador", "encargado material",
];
const DEMARCACIONES = [
  "portero", "central", "lateral derecho", "lateral izquierdo", "lateral",
  "carrilero", "líbero", "libero", "defensa", "mediocentro", "pivote",
  "interior derecho", "interior izquierdo", "interior", "mediapunta",
  "centrocampista", "volante", "extremo derecho", "extremo izquierdo",
  "extremo", "delantero centro", "delantero", "punta", "ariete",
];

function mapPos(dem) {
  const d = (dem || "").toLowerCase();
  if (/porter/.test(d)) return "POR";
  if (/(defens|central|lateral|carrilero|l[ií]bero)/.test(d)) return "DEF";
  if (/(centrocamp|mediocentro|pivote|interior|mediapunta|volante|medio)/.test(d)) return "MED";
  if (/(delanter|extremo|punta|ariete)/.test(d)) return "DEL";
  return "MED";
}

function absolutize(src) {
  if (!src) return null;
  if (src.startsWith("http")) return src;
  if (src.startsWith("//")) return "https:" + src;
  if (src.startsWith("/")) return "https://www.lapreferente.com" + src;
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── Cloudinary: subida por URL remota (Cloudinary hace el fetch) ── */
async function uploadRemote(remoteUrl, publicId) {
  const attempt = async (withId) => {
    const fd = new FormData();
    fd.append("file", remoteUrl);
    fd.append("upload_preset", CLOUDINARY_PRESET);
    fd.append("folder", "racing-lab/lapreferente");
    if (withId) fd.append("public_id", publicId);
    const r = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,
      { method: "POST", body: fd }
    );
    return r.json();
  };
  let d = await attempt(true);
  // Algunos presets unsigned no permiten public_id → reintento sin él
  if (d.error && /public_id/i.test(d.error.message || "")) d = await attempt(false);
  if (d.error) throw new Error(d.error.message || "cloudinary error");
  return d.secure_url || null;
}

/* ── Parseo ── */
function parseTeamPage(html) {
  const $ = cheerio.load(html);
  const players = [];
  const staff = [];
  const seen = new Set();
  const warnings = [];

  // Estrategia: todo registro (jugador o staff) enlaza a su ficha /J{id}...
  $('a[href*="/J"]').each((_, a) => {
    const href = $(a).attr("href") || "";
    const m = href.match(/\/J(\d+)/);
    if (!m) return;
    const jId = m[1];
    if (seen.has(jId)) return;

    const name = $(a).text().replace(/\s+/g, " ").trim();
    if (!name || name.length < 2) return;
    seen.add(jId);

    // Contexto: fila de tabla si existe; si no, bloque padre
    const $row = $(a).closest("tr").length ? $(a).closest("tr") : $(a).parent().parent();
    const rowText = $row.text().replace(/\s+/g, " ").trim();
    const rowLower = rowText.toLowerCase();

    // Foto en la fila
    const imgSrc = absolutize($row.find("img").first().attr("src"));

    // ¿Staff o jugador?
    const staffRole = STAFF_ROLES.find((r) => rowLower.includes(r));
    const demarc = DEMARCACIONES.find((d) => rowLower.includes(d));

    if (staffRole && !demarc) {
      // ── STAFF ──
      const ageMatch = rowText.match(/(\d{2})\s*años/i);
      staff.push({
        jId,
        name,
        role: staffRole.charAt(0).toUpperCase() + staffRole.slice(1),
        age: ageMatch ? parseInt(ageMatch[1]) : null,
        notes: "",
        fotoSrc: imgSrc,
      });
      return;
    }

    // ── JUGADOR ──
    // Dorsal y edad: heurística sobre celdas numéricas
    const cells = $row.find("td").map((i, td) => $(td).text().trim()).get();
    const nums = cells.filter((c) => /^\d{1,2}$/.test(c)).map(Number);
    let dorsal = null;
    let age = null;
    const ageMatch = rowText.match(/(\d{2})\s*años/i);
    if (ageMatch) age = parseInt(ageMatch[1]);
    if (nums.length) {
      // Si hay match de "XX años", el otro número es dorsal.
      // Si no, asumimos: primer número = dorsal, número 15-49 restante = edad.
      if (age !== null) {
        dorsal = nums.find((n) => n !== age) ?? null;
      } else {
        dorsal = nums[0] ?? null;
        age = nums.find((n) => n >= 15 && n <= 49 && n !== dorsal) ?? null;
      }
    }

    const sub23 = /sub\s*-?\s*23/i.test(rowText);
    let estado = null;
    if (/renovado/i.test(rowText)) estado = "renovado";
    else if (/nuevo\s+fichaje/i.test(rowText)) estado = "nuevo_fichaje";
    let procedencia = null;
    const procMatch = rowText.match(/procedente\s+del?\s+([^.,;()]{3,60})/i);
    if (procMatch) procedencia = procMatch[1].trim();

    players.push({
      jId,
      name,
      dorsal,
      pos: mapPos(demarc),
      dem: demarc
        ? demarc.charAt(0).toUpperCase() + demarc.slice(1)
        : "",
      age,
      sub23,
      estado,
      procedencia,
      from: procedencia || "",
      fotoSrc: imgSrc,
    });
  });

  if (!players.length && !staff.length) {
    warnings.push("Parseo vacío: el HTML no coincide con los selectores previstos.");
  }
  return { players, staff, warnings };
}

/* ── Function principal ── */
exports.cargarDesdeLapreferente = onCall(
  { region: "europe-west1", timeoutSeconds: 180, memory: "512MiB" },
  async (req) => {
    const teamId = String(req.data?.teamId || "").trim();
    if (!/^\d+$/.test(teamId)) {
      throw new HttpsError("invalid-argument", "teamId numérico requerido");
    }
    const force = req.data?.force === true;

    // ── Caché 24h compartida ──
    const cacheRef = db.collection("lpCache").doc(teamId);
    if (!force) {
      const snap = await cacheRef.get();
      if (snap.exists) {
        const c = snap.data();
        if (Date.now() - c.fetchedAt < CACHE_TTL_MS) {
          return { ...c.payload, cached: true, fetchedAt: c.fetchedAt };
        }
      }
    }

    // ── Fetch con decodificación latin-1 ──
    const url = `https://www.lapreferente.com/E${teamId}${COMP_TOKEN}/equipo`;
    let resp;
    try {
      resp = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
          "Accept-Language": "es-ES,es;q=0.9",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
      });
    } catch (e) {
      throw new HttpsError("unavailable", "No se pudo conectar a lapreferente: " + e.message);
    }
    if (!resp.ok) {
      throw new HttpsError("unavailable", `lapreferente respondió HTTP ${resp.status}`);
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    const html = iconv.decode(buf, "iso-8859-1"); // ñ/á/í correctas

    // ── Parseo ──
    const { players, staff, warnings } = parseTeamPage(html);

    if (!players.length && !staff.length) {
      // Devolvemos debug para ajustar selectores en Fase 3 — NO cacheamos fallos
      return {
        ok: false,
        teamId,
        players: [],
        staff: [],
        warnings,
        finalUrl: resp.url,
        debugHtml: html.slice(0, 6000),
      };
    }

    // ── Fotos → Cloudinary (throttled) ──
    for (const rec of [...players, ...staff]) {
      if (rec.fotoSrc) {
        try {
          rec.fotoUrl = await uploadRemote(rec.fotoSrc, `J${rec.jId}`);
        } catch (e) {
          rec.fotoUrl = null;
        }
        await sleep(PHOTO_DELAY_MS);
      } else {
        rec.fotoUrl = null;
      }
      delete rec.fotoSrc;
    }

    const payload = {
      ok: true,
      teamId,
      players,
      staff,
      warnings,
      source: resp.url,
      counts: { players: players.length, staff: staff.length },
    };

    await cacheRef.set({ fetchedAt: Date.now(), payload });
    return { ...payload, cached: false };
  }
);
