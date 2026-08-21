import React, { useState, useEffect, useRef } from "react";
import * as Tone from "tone";
import { supabase, supabaseConfigured } from "./supabaseClient.js";
import {
  Home, Calculator, Plus, Coffee, UtensilsCrossed, Beer, Dumbbell, Car,
  MoreHorizontal, X, TrendingDown, Receipt, Zap, Building2, Fuel,
  Cigarette, Wifi, ArrowRight, Settings2, CreditCard, ShoppingBag, Gift, HeartPulse, BarChart3, ChevronLeft, ChevronRight, Lightbulb, PiggyBank, Landmark, Bell, Info, HandCoins, ExternalLink, TriangleAlert, Calendar, TrendingUp, Clock, HelpCircle, ChevronDown, Lock
} from "lucide-react";

// ---- Versione Kickstarter/MVP: nasconde tutto ciò che è collegamento bancario,
// open banking o lettura automatica di transazioni da istituti terzi. L'app in
// questa modalità funziona solo a input manuale (reddito + ore) più import da
// file (rinominato in modo neutro, senza linguaggio bancario). Rimettere a
// `false` per riattivare le funzionalità di collegamento conto complete.
const KICKSTARTER_BUILD = false;

// ---- Fasce di abbonamento: Free, Premium, Elite. Questa riga resta il valore di
// PARTENZA per ogni nuovo utente — ma ogni tester può cambiarla da solo, sul proprio
// telefono, dalle Impostazioni → "Cambia fascia (solo test)", senza bisogno che il
// codice venga ricaricato ogni volta.
//   Free: Diario, tariffa oraria, Simulatore (Cash/3 rate), Budget (1 obiettivo)
//   Premium: + Calendario, Chiusura, Rendiconto, Import file, Simulatore completo, Budget illimitato
//   Elite: + Regime fiscale, Progetti, tariffa oraria reale dallo storico
const TIER = "free"; // "free" | "premium" | "elite" — valore di partenza
const TIER_RANK = { free: 0, premium: 1, elite: 2 };
let ACTIVE_TIER = TIER; // valore effettivo in uso, aggiornato da MainApp ad ogni render
function hasTier(minTier) {
  return TIER_RANK[ACTIVE_TIER] >= TIER_RANK[minTier];
}

// ---- Design tokens (applied via inline style, NOT via bg-[#..] classes) ----
const C = {
  bg: "#F7F3EA",
  panel: "#FFFFFF",
  panelBorder: "#E7E1D2",
  inputBg: "#FBF9F3",
  ticket: "#F2ECDD",
  brass: "#FF6B4A",
  brassDim: "#E5522F",
  paper: "#171717",
  ink: "#171717",
  rust: "#E14A2E",
  green: "#7CB342",
  textDim: "#5C5C58",
  textFaint: "#8C8C86",
  textFainter: "#BDBAB0",
  fixedBar: "#3D4550",
  outerBg: "#EDE7D8",
};

const DISPLAY_FONT = "'Archivo Black', system-ui, sans-serif";
const SERIF_FONT = "'Playfair Display', Georgia, serif"; // numeri/prezzi in evidenza — tono "alta moda"
const SANS_FONT = "'DM Sans', system-ui, sans-serif"; // etichette e testo corrente, geometrico e pulito
const MONO_FONT = "'JetBrains Mono', 'Courier New', monospace";

// ---- Effetti sonori sintetizzati (nessun file audio, generati al volo) ----
let audioReady = false;
async function ensureAudio() {
  try {
    if (Tone.getContext().state !== "running") {
      await Tone.start();
    }
    audioReady = true;
  } catch (e) {
    // contesto audio non disponibile, ignora silenziosamente
  }
}

// Suono di inserimento spesa: ticchettio rapido + gettone che entra
async function playExpenseSound() {
  await ensureAudio();
  const now = Tone.now();

  const tick = new Tone.Synth({
    oscillator: { type: "square" },
    envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.02 },
  }).toDestination();
  tick.volume.value = -14;
  tick.triggerAttackRelease("C7", 0.03, now);
  tick.triggerAttackRelease("C7", 0.03, now + 0.06);
  tick.triggerAttackRelease("C7", 0.03, now + 0.12);

  const coin = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.001, decay: 0.22, sustain: 0, release: 0.12 },
  }).toDestination();
  coin.volume.value = -6;
  coin.triggerAttackRelease("E6", 0.18, now + 0.2);
  coin.triggerAttackRelease("A6", 0.14, now + 0.27);

  setTimeout(() => {
    tick.dispose();
    coin.dispose();
  }, 900);
}

// Suono di trasferimento budget: cascata di gettoni stile jackpot
async function playJackpotSound() {
  await ensureAudio();
  const now = Tone.now();

  const poly = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.12 },
  }).toDestination();
  poly.volume.value = -8;

  const notes = ["C6", "E6", "G6", "C7", "A6", "E6", "G6", "C7", "D6", "G6", "B6", "E7"];
  notes.forEach((n, i) => {
    const t = now + i * 0.06 + Math.random() * 0.015;
    poly.triggerAttackRelease(n, 0.14, t);
  });

  setTimeout(() => poly.dispose(), 1800);
}


const FIXED_ICONS = { affitto: Building2, bollette: Zap, auto: Car, carburante: Fuel, sigarette: Cigarette, internet: Wifi, altro: Receipt };
const CATEGORIES = [
  { id: "colazione", label: "Colazione", icon: Coffee, suggested: 2.5 },
  { id: "pranzo", label: "Pranzo", icon: UtensilsCrossed, suggested: 9 },
  { id: "aperitivo", label: "Aperitivo", icon: Beer, suggested: 8 },
  { id: "palestra", label: "Palestra", icon: Dumbbell, suggested: 45 },
  { id: "trasporti", label: "Trasporti", icon: Car, suggested: 4 },
  { id: "bollette", label: "Bollette", icon: Zap, suggested: 60 },
  { id: "finanziamento", label: "Finanziamento", icon: CreditCard, suggested: 95 },
  { id: "spesa", label: "Spesa", icon: ShoppingBag, suggested: 35 },
  { id: "salute", label: "Salute", icon: HeartPulse, suggested: 20 },
  { id: "regalo", label: "Regalo", icon: Gift, suggested: 25 },
  { id: "sigarette", label: "Sigarette", icon: Cigarette, suggested: 5.5 },
  { id: "altro", label: "Altro", icon: MoreHorizontal, suggested: null },
];

// Transazioni bancarie simulate, per la demo "conto collegato"
const BANK_MERCHANTS = [
  { merchant: "Bar Centrale", min: 1.5, max: 6, suggestedCat: "colazione" },
  { merchant: "Conad City", min: 15, max: 60, suggestedCat: "spesa" },
  { merchant: "Ristorante Da Mario", min: 12, max: 38, suggestedCat: "pranzo" },
  { merchant: "Distributore Eni", min: 20, max: 50, suggestedCat: "trasporti" },
  { merchant: "Tabaccheria Rossi", min: 4, max: 12, suggestedCat: "sigarette" },
  { merchant: "PayPal *Amazon", min: 10, max: 80, suggestedCat: "spesa" },
  { merchant: "Aperitivo Bar Luna", min: 6, max: 22, suggestedCat: "aperitivo" },
  { merchant: "Farmacia Comunale", min: 8, max: 40, suggestedCat: "salute" },
];

const ACCOUNT_SOURCES = {
  banca: { label: "Conto bancario", icon: Landmark },
  revolut: { label: "Revolut", icon: Landmark },
  paypal: { label: "PayPal", icon: CreditCard },
};

function generateFakeTransaction(source) {
  const m = BANK_MERCHANTS[Math.floor(Math.random() * BANK_MERCHANTS.length)];
  const euro = Math.round((m.min + Math.random() * (m.max - m.min)) * 100) / 100;
  return { id: Date.now() + Math.random(), merchant: m.merchant, euro, suggestedCat: m.suggestedCat, source: source || "banca" };
}

// Genera un elenco di transazioni simulate distribuite tra i conti collegati
function generateTransactionFeed(connectedAccounts, count = 6) {
  const activeSources = Object.keys(ACCOUNT_SOURCES).filter((id) => connectedAccounts[id]);
  if (activeSources.length === 0) return [];
  return Array.from({ length: count }).map(() => {
    const source = activeSources[Math.floor(Math.random() * activeSources.length)];
    return generateFakeTransaction(source);
  });
}



// Converte "quanto ti vendi" nell'unità scelta (ora/giorno/settimana/mese) in tariffa
// oraria lorda equivalente, usando le ore/settimana come base comune di conversione.
function tariffaOrariaLordaDa(data) {
  const importo = Number(data.tariffaOrariaLorda) || 0;
  const unita = data.tariffaUnita || "ora";
  const oreSett = Number(data.oreSettimana) || 0;
  if (unita === "ora") return importo;
  if (!oreSett) return 0; // serve sapere le ore/settimana per convertire, senza non si può
  if (unita === "settimana") return importo / oreSett;
  if (unita === "giorno") return importo / (oreSett / 5); // assume 5 giorni lavorativi/settimana
  if (unita === "mese") return importo / (oreSett * 4.33);
  return importo;
}

function toMonthly(spesa) {
  if (spesa.frequenza === "giornaliera") return spesa.importo * 30;
  if (spesa.frequenza === "settimanale") return spesa.importo * 4.33;
  if (spesa.frequenza === "annuale") return spesa.importo / 12;
  return spesa.importo;
}

// Margine mensile libero: stipendio meno spese fisse, prima ancora di considerare gli extra quotidiani
function freeMonthlyMargin(profile) {
  const fixedMonthly = profile.fixedList.reduce((s, f) => s + toMonthly(f), 0);
  return profile.monthlyIncome - fixedMonthly;
}
function euroToDaysHours(euro, hourlyRate, dailyHours = 8) {
  const totalHours = euro / hourlyRate;
  const days = Math.floor(totalHours / dailyHours);
  const hours = Math.round(totalHours % dailyHours);
  if (days === 0) return `${hours}h`;
  if (hours === 0) return `${days} g`;
  return `${days} g ${hours}h`;
}
function euroToTime(euro, hourlyRate) {
  if (!hourlyRate || !isFinite(hourlyRate) || hourlyRate <= 0) return "—";
  const totalMinutes = (euro / hourlyRate) * 60;
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

// ---- Calendario: entrate/uscite/turni, principalmente per redditi variabili ----
const MESI_IT = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const GIORNI_IT = ["L", "M", "M", "G", "V", "S", "D"];

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayKey() {
  return dateKey(new Date());
}
// Griglia del mese: include i giorni di riempimento del mese prima/dopo, settimana che parte da lunedì
function getMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // lunedì = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// Calcola la tariffa oraria "reale" dai turni/entrate a consuntivo registrati nel calendario.
// Sotto una soglia minima di ore registrate, il numero è troppo rumoroso: si torna alla stima.
// Serve anche che ci sia già un'entrata REALE (non solo ore lavorate) — altrimenti, se hai
// registrato dei turni ma il compenso è ancora una fattura "in attesa" (non pagata), il calcolo
// darebbe 0€/h e quello zero si propagherebbe a tutta l'app. Meglio restare sulla stima finché
// non arriva un incasso vero.
const REAL_RATE_MIN_HOURS = 15;
function computeRealRate(calendario) {
  let ore = 0, entrate = 0, uscite = 0;
  Object.values(calendario || {}).forEach((entries) => {
    (entries || []).forEach((e) => {
      if (e.stato !== "consuntivo") return;
      if (e.tipo === "turno") ore += Number(e.ore) || 0;
      if (e.tipo === "entrata") entrate += Number(e.importo) || 0;
      if (e.tipo === "uscita") uscite += Number(e.importo) || 0;
    });
  });
  if (ore < REAL_RATE_MIN_HOURS || entrate <= 0) return { ready: false, ore, entrate, uscite, rate: null };
  return { ready: true, ore, entrate, uscite, rate: (entrate - uscite) / ore };
}

// Scaglioni IRPEF 2026 (Legge di Bilancio 2026, L. 199/2025): 23% fino a 28.000€,
// 33% da 28.001 a 50.000€, 43% oltre. Non include addizionali regionali/comunali
// né detrazioni — è una stima di riferimento, non una dichiarazione fiscale.
const SCAGLIONI_IRPEF_2026 = [
  { fino: 28000, aliquota: 23 },
  { fino: 50000, aliquota: 33 },
  { fino: null, aliquota: 43 },
];
function calcolaIrpefProgressiva(imponibile, scaglioni) {
  let imposta = 0;
  let precedente = 0;
  for (const s of scaglioni) {
    const soglia = s.fino === null ? imponibile : Math.min(imponibile, s.fino);
    if (soglia > precedente) {
      imposta += (soglia - precedente) * (s.aliquota / 100);
      precedente = soglia;
    }
    if (s.fino !== null && imponibile <= s.fino) break;
  }
  return imposta;
}
// Deriva la percentuale netta "effettiva" dalle aliquote già salvate nel Regime Fiscale
// (se l'utente le ha compilate), così da poter convertire lordo→netto su un singolo
// pagamento usando le stesse regole, senza doverle reinserire ogni volta. Restituisce
// null se l'utente non ha ancora fatto l'onboarding del Regime Fiscale.
function percentualeNettaDaRegimeFiscale(regimeFiscale) {
  const rf = regimeFiscale || {};
  const redditoLordo = Number(rf.redditoLordoAnnuo) || 0;
  if (redditoLordo <= 0) return null;
  const tipo = rf.tipo || "forfettario";
  const coeff = rf.coefficienteRedditivita !== undefined && rf.coefficienteRedditivita !== "" ? Number(rf.coefficienteRedditivita) : 78;
  const aliquotaForf = rf.aliquotaImposta !== undefined && rf.aliquotaImposta !== "" ? Number(rf.aliquotaImposta) : 15;
  const inpsPct = rf.inpsPct !== undefined && rf.inpsPct !== "" ? Number(rf.inpsPct) : 26.07;
  const commercialista = Number(rf.costoCommercialista) || 0;

  let contributiINPS, imposta;
  if (tipo === "forfettario") {
    const imponibile = redditoLordo * (coeff / 100);
    contributiINPS = imponibile * (inpsPct / 100);
    const imponibileNetto = Math.max(imponibile - contributiINPS, 0);
    imposta = imponibileNetto * (aliquotaForf / 100);
  } else {
    contributiINPS = redditoLordo * (inpsPct / 100);
    const imponibileIrpef = Math.max(redditoLordo - contributiINPS, 0);
    imposta = calcolaIrpefProgressiva(imponibileIrpef, SCAGLIONI_IRPEF_2026);
  }
  const nettoAnnuo = redditoLordo - contributiINPS - imposta - commercialista;
  return Math.max(Math.min(nettoAnnuo / redditoLordo, 1), 0);
}

// ---- Import estratto conto (CSV) ----
// Parser CSV minimale: rileva da solo se il separatore è virgola o punto e
// virgola (le banche italiane usano quasi sempre quest'ultimo), gestisce le
// virgolette base.
function parseCSV(text) {
  const firstLine = text.split(/\r?\n/)[0] || "";
  const delimiter = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ";" : ",";
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows = lines.map((line) => {
    const cells = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === delimiter && !inQuotes) { cells.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  });
  return { delimiter, rows };
}
// Numeri in formato italiano: "1.234,56" → 1234.56. Gestisce anche il segno.
function parseItalianNumber(str) {
  if (!str) return 0;
  let s = String(str).trim().replace(/[€\s]/g, "");
  const neg = s.startsWith("-") || s.startsWith("(");
  s = s.replace(/[()\-+]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  return neg ? -Math.abs(n) : n;
}
// Riconosce le date più comuni: GG/MM/AAAA, GG-MM-AAAA, AAAA-MM-GG.
function parseFlexibleDate(str) {
  if (!str) return null;
  const s = str.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return null;
}

// Trova la colonna giusta guardando i VALORI, non solo il nome dell'intestazione —
// utile quando la banca usa intestazioni insolite o non ne mette proprio.
function detectColumnByContent(rows, testFn, excludeIndex = -1, sampleSize = 8) {
  if (!rows.length) return -1;
  const numCols = Math.max(...rows.slice(0, sampleSize).map((r) => r.length));
  let bestCol = -1, bestScore = 0;
  const sample = rows.slice(0, sampleSize);
  for (let c = 0; c < numCols; c++) {
    if (c === excludeIndex) continue;
    let matches = 0;
    sample.forEach((r) => { if (testFn(r[c] || "")) matches++; });
    const score = matches / sample.length;
    if (score > bestScore) { bestScore = score; bestCol = c; }
  }
  return bestScore >= 0.6 ? bestCol : -1; // serve che almeno il 60% delle righe campione corrisponda
}
const isDateLike = (s) => /^\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}/.test(String(s).trim()) || /^\d{4}-\d{2}-\d{2}/.test(String(s).trim());
const isAmountLike = (s) => {
  const t = String(s).trim();
  if (!t || !/\d/.test(t)) return false;
  // richiede sempre i decimali (i centesimi): un ID intero non li ha, un vero importo sì
  return /^-?\d{1,3}([.\s]\d{3})*,\d{2}$/.test(t) || /^-?\d+\.\d{2}$/.test(t);
};
// Molti estratti conto hanno righe di riepilogo (conto, periodo...) PRIMA della vera
// intestazione — non si può assumere che i dati comincino dalla prima riga. Cerchiamo
// la prima riga in cui, in una stessa colonna, per due righe di fila il test passa
// (es. due date consecutive): lì iniziano davvero i dati.
function findDataStartRow(rows, testFn) {
  const maxScan = Math.min(rows.length, 40);
  for (let i = 0; i < maxScan; i++) {
    const row = rows[i];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      if (testFn(row[c])) {
        const next = rows[i + 1];
        if (!next || testFn(next[c])) return i;
      }
    }
  }
  return -1;
}

// ---- Esportazione dati e promemoria ----
function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
// Esporta tutto lo storico entrate/uscite/turni come CSV, utile per backup o per fare
// analisi proprie fuori dall'app.
function exportCalendarioCSV(calendario) {
  const rows = [["Data", "Tipo", "Stato", "Importo €", "Ore", "Descrizione"]];
  Object.keys(calendario).sort().forEach((k) => {
    (calendario[k] || []).forEach((e) => {
      rows.push([
        k,
        e.tipo,
        e.stato,
        e.tipo !== "turno" ? String(e.importo ?? "").replace(".", ",") : "",
        e.tipo === "turno" ? String(e.ore ?? "") : "",
        e.descrizione || "",
      ]);
    });
  });
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
  downloadBlob("\uFEFF" + csv, `orelibere-storico-${todayKey()}.csv`, "text/csv;charset=utf-8;");
}
// Stima il reddito annuo a partire dallo storico entrate a consuntivo registrato: fa la
// media sui mesi per cui c'è davvero un dato, poi la moltiplica per 12 — usata come
// suggerimento di partenza, mai come valore imposto.
function estimateAnnualIncomeFromCalendario(calendario) {
  let total = 0;
  const monthsWithData = new Set();
  Object.entries(calendario || {}).forEach(([k, entries]) => {
    (entries || []).forEach((e) => {
      if (e.tipo === "entrata" && e.stato === "consuntivo") {
        total += Number(e.importo) || 0;
        monthsWithData.add(k.slice(0, 7));
      }
    });
  });
  const numMonths = monthsWithData.size;
  if (numMonths === 0) return null;
  return { total, numMonths, annualEstimate: (total / numMonths) * 12 };
}
// Genera un file .ics (iCalendar) scaricabile: aggiunto al calendario del telefono,
// crea un vero promemoria nativo — l'app web da sola non può mandare notifiche push.
function generateICS(events) {
  const pad = (n) => String(n).padStart(2, "0");
  const fmtDate = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const esc = (s) => String(s || "").replace(/[,;]/g, " ").replace(/\n/g, " ");
  const body = events.map((e, i) => `BEGIN:VEVENT
UID:orelibere-${fmtDate(e.date)}-${i}-${Date.now()}@orelibere.app
DTSTART;VALUE=DATE:${fmtDate(e.date)}
DTEND;VALUE=DATE:${fmtDate(e.date)}
SUMMARY:${esc(e.title)}
DESCRIPTION:${esc(e.notes)}
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:${esc(e.title)}
TRIGGER:-P1D
END:VALARM
END:VEVENT`).join("\n");
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//OreLibere//IT
CALSCALE:GREGORIAN
${body}
END:VCALENDAR`;
}

// ---- Import estratto conto (PDF) ----
// Ricostruisce le righe di testo dal PDF raggruppando i frammenti per posizione verticale
// (PDF.js non restituisce "righe", solo frammenti di testo posizionati nello spazio).
async function extractTextFromPDF(file) {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs";
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let lastY = null, line = "";
    for (const item of content.items) {
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        fullText += line.trim() + "\n";
        line = "";
      }
      line += item.str + " ";
      lastY = y;
    }
    if (line.trim()) fullText += line.trim() + "\n";
  }
  return fullText;
}
// Raggruppa le righe tra una data e la successiva in un unico "blocco" prima di cercare
// l'importo — necessario perché molte banche (es. Intesa Sanpaolo) vanno a capo con
// categoria/importo su righe diverse dalla data. Un parser riga-per-riga perdeva la
// maggior parte dei movimenti in questi casi (testato: 21% di successo); a blocco: 100%.
function parseTransactionLines(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const dateStartRe = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/;
  const numRe = /-?\d+(?:[.\s]\d{3})*,\d{2}/g;
  const starts = [];
  lines.forEach((l, i) => { if (dateStartRe.test(l)) starts.push(i); });
  const results = [];
  for (let s = 0; s < starts.length; s++) {
    const startIdx = starts[s];
    const endIdx = s + 1 < starts.length ? starts[s + 1] : lines.length;
    const block = lines.slice(startIdx, endIdx).join(" ");
    const dm = block.match(dateStartRe);
    if (!dm) continue;
    const rest = block.slice(dm[0].length).trim();
    const nums = [...rest.matchAll(numRe)];
    if (nums.length === 0) continue;
    // se ci sono 2+ numeri nel blocco, l'ultimo è quasi sempre il saldo progressivo
    const amountMatch = nums.length >= 2 ? nums[nums.length - 2] : nums[nums.length - 1];
    let desc = rest.slice(0, amountMatch.index).trim();
    const daMatch = rest.match(/\b(dare|avere)\b/i);
    const dareAvere = daMatch ? daMatch[0].toLowerCase() : "";
    desc = desc.replace(/\b(Si|No|dare|avere)\b/gi, "").replace(/€\s*$/, "").replace(/\s{2,}/g, " ").trim();
    results.push({ dateRaw: dm[0], desc, amountRaw: amountMatch[0], dareAvere });
  }
  return results;
}

// ---- Dati simulati di una settimana, per mostrare come funziona il report ----
const WEEK_DATA = [
  { day: "Lun", extra: 14.5, entries: { Colazione: 2.5, Pranzo: 9, Trasporti: 3 } },
  { day: "Mar", extra: 11.5, entries: { Colazione: 2.5, Pranzo: 9 } },
  { day: "Mer", extra: 16, entries: { Colazione: 2.5, Pranzo: 9, Aperitivo: 4.5 } },
  { day: "Gio", extra: 11.5, entries: { Colazione: 2.5, Pranzo: 9 } },
  { day: "Ven", extra: 32, entries: { Colazione: 2.5, Pranzo: 9, Aperitivo: 12, Spesa: 8.5 } },
  { day: "Sab", extra: 24, entries: { Spesa: 18, Aperitivo: 6 } },
  { day: "Dom", extra: 9, entries: { Spesa: 9 } },
];
const PREV_WEEK_TOTAL_EURO = 108; // per il confronto settimana precedente

function buildWeekInsights(hourly) {
  const totalEuro = WEEK_DATA.reduce((s, d) => s + d.extra, 0);
  const totalHours = totalEuro / hourly;
  const prevHours = PREV_WEEK_TOTAL_EURO / hourly;
  const deltaHours = totalHours - prevHours;

  const byCategory = {};
  WEEK_DATA.forEach((d) => {
    Object.entries(d.entries).forEach(([cat, val]) => {
      byCategory[cat] = (byCategory[cat] || 0) + val;
    });
  });
  const categoryList = Object.entries(byCategory)
    .map(([cat, euro]) => ({ cat, euro, hours: euro / hourly, pct: (euro / totalEuro) * 100 }))
    .sort((a, b) => b.euro - a.euro);

  const criticalDay = [...WEEK_DATA].sort((a, b) => b.extra - a.extra)[0];
  const avgOtherDays = (totalEuro - criticalDay.extra) / (WEEK_DATA.length - 1);
  const criticalMultiplier = criticalDay.extra / avgOtherDays;

  return { totalEuro, totalHours, prevHours, deltaHours, categoryList, criticalDay, criticalMultiplier };
}

function PunchTicket({ children, style = {}, id, ...rest }) {
  return (
    <div
      id={id}
      style={{
        backgroundColor: C.ticket,
        color: C.ink,
        backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 7px, rgba(23,23,23,0.05) 7px, rgba(23,23,23,0.05) 8px)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

function ScreenHeader({ eyebrow, title, right }) {
  return (
    <div style={{ padding: "8px 20px 16px 20px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
      <div>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.brass, fontFamily: MONO_FONT, marginBottom: 4 }}>{eyebrow}</div>
        <h1 style={{ fontSize: 26, lineHeight: 1.2, fontWeight: 800, color: C.paper, fontFamily: DISPLAY_FONT, margin: 0 }}>{title}</h1>
      </div>
      {right}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = "text", prefix, suffix, big }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "12px 12px" }}>
      {prefix && <span style={{ color: C.brass, fontFamily: MONO_FONT }}>{prefix}</span>}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={onChange}
        style={{
          backgroundColor: "transparent",
          color: C.paper,
          fontFamily: MONO_FONT,
          fontSize: big ? 18 : 14,
          width: "100%",
          outline: "none",
          border: "none",
        }}
      />
      {suffix && <span style={{ color: C.textDim, fontFamily: MONO_FONT, fontSize: 13 }}>{suffix}</span>}
    </div>
  );
}

function FieldLabel({ children }) {
  return <label style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: C.textDim, fontFamily: MONO_FONT }}>{children}</label>;
}

// Bottone "tieni premuto" — richiede una pressione continua di `holdMs` millisecondi
// prima di scattare. Usato ovunque vogliamo essere sicuri che la persona abbia letto
// qualcosa (tutorial, avvisi) prima di farla proseguire con un tocco distratto.
function HoldButton({ onConfirm, children, holdMs = 2000, style = {}, fillColor = "rgba(255,255,255,0.35)" }) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const rafRef = useRef(null);
  const startRef = useRef(null);

  const cancel = () => {
    setHolding(false);
    setProgress(0);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  };

  const start = () => {
    setHolding(true);
    startRef.current = performance.now();
    const tick = (now) => {
      const elapsed = now - startRef.current;
      const p = Math.min(elapsed / holdMs, 1);
      setProgress(p);
      if (p >= 1) {
        cancel();
        onConfirm();
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  return (
    <button
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      style={{ position: "relative", overflow: "hidden", cursor: "pointer", ...style }}
    >
      <div style={{ position: "absolute", inset: 0, backgroundColor: fillColor, width: `${progress * 100}%`, transition: holding ? "none" : "width 0.2s ease" }} />
      <span style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", height: "100%" }}>{children}</span>
    </button>
  );
}

// ===================== ONBOARDING =====================

// Box interattivo "Per te / Per un'altra persona": entra con una piccola animazione
// slide-up, e al tocco il bordo diventa solido e lo sfondo più pieno.
function TimeCompareBox({ label, hours, color, delay }) {
  const [pressed, setPressed] = useState(false);
  return (
    <>
      <style>{`
        @keyframes tcbSlideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      <div
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          backgroundColor: pressed ? `${color}22` : `${color}14`,
          border: `1px solid ${pressed ? color : `${color}55`}`,
          borderRadius: 8, padding: "10px 12px", cursor: "pointer",
          animation: `tcbSlideUp 0.5s ease ${delay}ms both`,
          transition: "background-color 0.15s ease, border-color 0.15s ease",
        }}
      >
        <span style={{ fontSize: 12, fontFamily: SANS_FONT, letterSpacing: "0.02em", color: C.ink }}>{label}</span>
        <span style={{ fontFamily: SERIF_FONT, fontSize: 17, fontWeight: 700, color: C.ink }}>{hours}</span>
      </div>
    </>
  );
}

function WelcomeScreen({ onStart }) {
  const P = { fontSize: 14, color: C.textDim, lineHeight: 1.6, margin: "0 0 16px 0", fontFamily: SANS_FONT };
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" }}>
      <style>{`
        @keyframes wsFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Banda "poster" scura, per non far sembrare la schermata un testo su un foglio */}
      <div style={{ backgroundColor: C.ink, padding: "36px 24px 30px 24px", borderRadius: "0 0 24px 24px" }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.25em", color: C.brass, fontFamily: SANS_FONT, fontWeight: 700, marginBottom: 16, animation: "wsFadeUp 0.6s ease 0ms both" }}>OreLibere</div>
        <h1 style={{ fontSize: 27, fontWeight: 800, color: "#FFFFFF", fontFamily: DISPLAY_FONT, margin: "0 0 8px 0", lineHeight: 1.2, animation: "wsFadeUp 0.6s ease 120ms both" }}>
          Non hai mai pagato il prezzo giusto.
        </h1>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", fontFamily: SERIF_FONT, fontStyle: "italic", fontWeight: 500, margin: 0, animation: "wsFadeUp 0.6s ease 280ms both" }}>
          Hai sempre guardato il numero sbagliato.
        </p>
      </div>

      <div style={{ padding: "28px 24px 28px 24px" }}>
        <p style={{ ...P, fontSize: 15, color: C.paper, fontWeight: 600, animation: "wsFadeUp 0.6s ease 440ms both" }}>
          100€. Due ore per te. Un giorno intero per un altro. Stessa spesa, vite diverse.
        </p>

        <PunchTicket style={{ borderRadius: 10, padding: 18, marginBottom: 20, border: `1px solid ${C.panelBorder}`, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div style={{ fontFamily: SERIF_FONT, fontSize: 34, fontWeight: 700, color: C.ink, marginBottom: 16, letterSpacing: "-0.01em" }}>100€</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <TimeCompareBox label="Per te" hours="2h" color={C.green} delay={80} />
            <TimeCompareBox label="Per un altro" hours="8h" color={C.rust} delay={220} />
          </div>
        </PunchTicket>

        <p style={P}>
          La banca ti ha mentito. Il denaro non è la tua unica risorsa. <strong style={{ color: C.paper }}>La più preziosa non la recuperi mai più.</strong>
        </p>

        <p style={P}>
          Per risparmiare davvero, smetti di contare gli euro. Conta le ore della tua vita.
        </p>

        <p style={{ ...P, marginBottom: 24 }}>
          Scegli quanto vale la tua ora. L'app ti dirà se puoi permettertela davvero.
        </p>

        <p style={{ fontSize: 13.5, color: C.brassDim, fontFamily: SANS_FONT, fontWeight: 700, marginBottom: 20 }}>
          Non pagare per sbaglio. Scegli il prezzo giusto.
        </p>
        <button
          onClick={onStart}
          style={{ width: "100%", padding: "14px 0", borderRadius: 4, border: "none", backgroundColor: C.brass, color: "#FFFFFF", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}
        >
          Inizia ora <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

function OnboardingIncome({ data, setData, onNext }) {
  const [phase, setPhase] = useState(data.redditoTipo ? "form" : "choose");
  const isVariabile = data.redditoTipo === "variabile";

  // Tariffa oraria: due percorsi diversi a seconda del tipo di reddito.
  // Fisso, o autonomo che stima dal reddito medio: stessa formula (reddito/4.33/ore).
  // Autonomo che fattura a ore: tariffa lorda × percentuale che gli resta netta.
  const hourlyFromMonthly = data.stipendio && data.oreSettimana ? (Number(data.stipendio) / 4.33) / Number(data.oreSettimana) : null;
  const tariffaOrariaGrezza = tariffaOrariaLordaDa(data);
  const hourlyFromRate = tariffaOrariaGrezza > 0 ? tariffaOrariaGrezza * ((Number(data.percentualeNetta) || 100) / 100) : null;
  const hourly = isVariabile && data.usaOraria ? hourlyFromRate : hourlyFromMonthly;

  if (phase === "choose") {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 20px 32px 20px" }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.brass, fontFamily: MONO_FONT, marginBottom: 4 }}>Passo 1 di 3</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: C.paper, fontFamily: DISPLAY_FONT, margin: "0 0 4px 0" }}>Come guadagni?</h1>
        <p style={{ fontSize: 13, color: C.textFainter, marginBottom: 24 }}>Serve per calcolare la tua tariffa oraria nel modo giusto per te — dipendenti e autonomi hanno entrate diverse.</p>

        <button
          onClick={() => { setData({ ...data, redditoTipo: "fisso", usaOraria: false }); setPhase("form"); }}
          style={{ width: "100%", textAlign: "left", cursor: "pointer", backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 8, padding: 16, marginBottom: 12, display: "flex", alignItems: "center", gap: 14 }}
        >
          <div style={{ width: 38, height: 38, borderRadius: "50%", backgroundColor: C.panelBorder, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Landmark size={18} color={C.brass} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: C.paper, fontWeight: 700, fontSize: 14.5 }}>Stipendio fisso</div>
            <div style={{ color: C.textFaint, fontSize: 12, marginTop: 2 }}>Dipendente, reddito mensile stabile</div>
          </div>
        </button>

        <button
          onClick={() => { setData({ ...data, redditoTipo: "variabile" }); setPhase("form"); }}
          style={{ width: "100%", textAlign: "left", cursor: "pointer", backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 8, padding: 16, display: "flex", alignItems: "center", gap: 14 }}
        >
          <div style={{ width: 38, height: 38, borderRadius: "50%", backgroundColor: C.panelBorder, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <TrendingDown size={18} color={C.brass} style={{ transform: "scaleY(-1)" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: C.paper, fontWeight: 700, fontSize: 14.5 }}>Reddito variabile</div>
            <div style={{ color: C.textFaint, fontSize: 12, marginTop: 2 }}>Autonomo, freelance, partita IVA...</div>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 20px 32px 20px", overflowY: "auto" }}>
      <button onClick={() => setPhase("choose")} style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, marginBottom: 12, alignSelf: "flex-start", cursor: "pointer" }}>← cambia tipo di reddito</button>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.brass, fontFamily: MONO_FONT, marginBottom: 4 }}>Passo 1 di 3</div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: C.paper, fontFamily: DISPLAY_FONT, margin: "0 0 4px 0" }}>Quanto vale il tuo tempo</h1>
      <p style={{ fontSize: 13, color: C.textFainter, marginBottom: 24 }}>Serve per convertire ogni spesa in ore di lavoro.</p>

      {isVariabile && (
        <div style={{ display: "flex", gap: 6, backgroundColor: C.bg, border: `1px solid ${C.panelBorder}`, borderRadius: 999, padding: 4, marginBottom: 20 }}>
          <button
            onClick={() => setData({ ...data, usaOraria: false })}
            style={{ flex: 1, padding: "8px 6px", borderRadius: 999, border: "none", cursor: "pointer", backgroundColor: !data.usaOraria ? C.brass : "transparent", color: !data.usaOraria ? "#FFFFFF" : C.textFaint, fontSize: 11.5, fontWeight: 700 }}
          >
            Stimo dal reddito medio
          </button>
          <button
            onClick={() => setData({ ...data, usaOraria: true })}
            style={{ flex: 1, padding: "8px 6px", borderRadius: 999, border: "none", cursor: "pointer", backgroundColor: data.usaOraria ? C.brass : "transparent", color: data.usaOraria ? "#FFFFFF" : C.textFaint, fontSize: 11.5, fontWeight: 700 }}
          >
            So la mia tariffa oraria
          </button>
        </div>
      )}

      {isVariabile && data.usaOraria ? (
        <>
          <div style={{ marginBottom: 6 }}><FieldLabel>Ore fatturabili a settimana, quando lavori</FieldLabel></div>
          <div style={{ marginBottom: 16 }}>
            <TextInput type="number" value={data.oreSettimana} placeholder="30" suffix="h/sett" big
              onChange={(e) => setData({ ...data, oreSettimana: e.target.value })} />
          </div>

          <div style={{ marginBottom: 6 }}><FieldLabel>Quanto ti vendi (lordo)</FieldLabel></div>
          <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            <div style={{ flex: 1 }}>
              <TextInput type="number" value={data.tariffaOrariaLorda} placeholder="35" prefix="€" big
                onChange={(e) => setData({ ...data, tariffaOrariaLorda: e.target.value })} />
            </div>
            <select
              value={data.tariffaUnita || "ora"}
              onChange={(e) => setData({ ...data, tariffaUnita: e.target.value })}
              style={{ backgroundColor: C.inputBg, color: C.paper, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "0 10px", fontSize: 14, fontFamily: SANS_FONT, outline: "none" }}
            >
              <option value="ora">/ora</option>
              <option value="giorno">/giorno</option>
              <option value="settimana">/settimana</option>
              <option value="mese">/mese</option>
            </select>
          </div>

          {data.tariffaUnita && data.tariffaUnita !== "ora" ? (
            !data.oreSettimana ? (
              <p style={{ fontSize: 11.5, color: C.rust, lineHeight: 1.4, marginBottom: 16 }}>
                Inserisci le ore/settimana qui sopra per convertirla in tariffa oraria.
              </p>
            ) : (
              <p style={{ fontSize: 12, color: C.brass, fontWeight: 700, marginBottom: 16 }}>
                ≈ {tariffaOrariaGrezza.toFixed(2)}€/ora lorde{data.tariffaUnita === "giorno" ? " (assumendo 5 giorni lavorativi a settimana)" : ""}
              </p>
            )
          ) : (
            <div style={{ marginBottom: 16 }} />
          )}

          <div style={{ marginBottom: 6 }}><FieldLabel>Quanto te ne resta netto (tasse, contributi, spese)</FieldLabel></div>
          <div style={{ marginBottom: 8 }}>
            <TextInput type="number" value={data.percentualeNetta} placeholder="65" suffix="%"
              onChange={(e) => setData({ ...data, percentualeNetta: e.target.value })} />
          </div>
          <p style={{ fontSize: 11.5, color: C.textFainter, lineHeight: 1.5, marginBottom: 16 }}>
            Di solito tra il 55% e il 75%, a seconda del regime fiscale e delle spese. Se non sei sicuro, 65% è una stima ragionevole di partenza — potrai correggerla in qualsiasi momento dalle Impostazioni.
          </p>
        </>
      ) : (
        <>
          <div style={{ marginBottom: 6 }}><FieldLabel>{isVariabile ? "Reddito netto mensile, quando lavori" : "Stipendio netto mensile"}</FieldLabel></div>
          <div style={{ marginBottom: 8 }}>
            <TextInput type="number" value={data.stipendio} placeholder="1500" prefix="€" big
              onChange={(e) => setData({ ...data, stipendio: e.target.value })} />
          </div>
          {isVariabile && (
            <p style={{ fontSize: 11.5, color: C.textFainter, lineHeight: 1.5, marginBottom: 16 }}>
              Il reddito che guadagni davvero nei mesi in cui lavori — non spalmato sulle pause. A quelle pensiamo nel campo qui sotto.
            </p>
          )}

          <div style={{ marginBottom: 6, marginTop: isVariabile ? 0 : 0 }}><FieldLabel>Ore lavorate a settimana{isVariabile ? ", quando lavori" : ""}</FieldLabel></div>
          <div style={{ marginBottom: 16 }}>
            <TextInput type="number" value={data.oreSettimana} placeholder="40" suffix="h/sett" big
              onChange={(e) => setData({ ...data, oreSettimana: e.target.value })} />
          </div>
        </>
      )}

      {isVariabile && (
        <>
          <div style={{ marginBottom: 6 }}><FieldLabel>In quanti mesi, in media, guadagni ogni anno?</FieldLabel></div>
          <div style={{ marginBottom: 8 }}>
            <TextInput type="number" value={data.mesiLavorati ?? 12} placeholder="12" suffix="mesi"
              onChange={(e) => setData({ ...data, mesiLavorati: e.target.value })} />
          </div>
          <p style={{ fontSize: 11.5, color: C.textFainter, lineHeight: 1.5, marginBottom: 8 }}>
            Lascialo a 12 se lavori tutto l'anno. Se hai contratti a termine o lavoro stagionale, mettici quanti mesi lavori davvero — <strong style={{ color: C.paper }}>non cambia la tua tariffa oraria</strong>, che resta quella vera di quando lavori, ma serve a capire quanto puoi permetterti in media al mese, buchi compresi.
          </p>
          {Number(data.mesiLavorati) > 0 && Number(data.mesiLavorati) < 12 && (data.stipendio || data.tariffaOrariaLorda) ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, backgroundColor: C.bg, border: `1px solid ${C.panelBorder}`, borderRadius: 6, padding: "8px 10px", marginBottom: 16 }}>
              <TrendingDown size={13} color={C.textFaint} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 11.5, color: C.textFaint, lineHeight: 1.4 }}>
                Per obiettivi e budget useremo circa <strong style={{ color: C.paper }}>{((data.usaOraria ? (hourlyFromRate || 0) * (Number(data.oreSettimana) || 0) * 4.33 : Number(data.stipendio) || 0) * (Number(data.mesiLavorati) / 12)).toFixed(0)}€/mese</strong> in media sull'anno, non {data.usaOraria ? "quello di quando lavori" : Number(data.stipendio || 0).toFixed(0) + "€"}.
              </span>
            </div>
          ) : null}
        </>
      )}

      {hourly ? (
        <PunchTicket style={{ borderRadius: 8, padding: 20, border: `1px solid ${C.brass}` }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.textDim, fontFamily: MONO_FONT, marginBottom: 6 }}>La tua ora di lavoro vale</div>
          <div style={{ fontFamily: SERIF_FONT, fontSize: 36, fontWeight: 700, marginBottom: 8, letterSpacing: "-0.01em" }}>{hourly.toFixed(2)}€/ora</div>
          <p style={{ fontSize: 11.5, color: C.textDim, lineHeight: 1.5, margin: 0 }}>
            {isVariabile
              ? "È una stima: il tuo reddito varia, ma questo numero ti dà un riferimento realistico da cui partire. Puoi aggiornarlo quando vuoi dalle Impostazioni."
              : "È il numero più importante di tutta l'app: da qui in poi ogni spesa la leggerai partendo da questo."}
          </p>
        </PunchTicket>
      ) : null}

      <div style={{ flex: 1 }} />
      <button
        onClick={onNext}
        disabled={!hourly}
        style={{
          width: "100%", padding: "14px 0", borderRadius: 4, border: "none",
          backgroundColor: hourly ? C.brass : "#DED7C4",
          color: hourly ? C.ink : C.textDim,
          fontWeight: 700, fontSize: 14,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          marginTop: 24,
        }}
      >
        Continua <ArrowRight size={16} />
      </button>
    </div>
  );
}

function OnboardingFixed({ data, setData, onNext, onBack }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ nome: "", tipo: "altro", importo: "", frequenza: "mensile" });
  const list = data.fixedList;
  const monthlyTotal = list.reduce((s, f) => s + toMonthly(f), 0);

  const addExpense = () => {
    if (!form.nome || !form.importo) return;
    setData({ ...data, fixedList: [...list, { id: Date.now(), ...form, importo: Number(form.importo) }] });
    setForm({ nome: "", tipo: "altro", importo: "", frequenza: "mensile" });
    setShowAdd(false);
  };
  const remove = (id) => setData({ ...data, fixedList: list.filter((f) => f.id !== id) });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 20px 32px 20px", position: "relative", overflowY: "auto" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, marginBottom: 12, alignSelf: "flex-start", cursor: "pointer" }}>← indietro</button>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.textDim, fontFamily: MONO_FONT }}>Passo 2 di 3</span>
        <span style={{ fontSize: 9, fontFamily: MONO_FONT, color: C.textFainter, border: `1px solid ${C.panelBorder}`, borderRadius: 999, padding: "2px 8px" }}>opzionale</span>
      </div>
      <h1 style={{ fontSize: 21, fontWeight: 700, color: C.paper, fontFamily: DISPLAY_FONT, margin: "0 0 4px 0" }}>Spese fisse</h1>
      <p style={{ fontSize: 13, color: C.textFainter, marginBottom: 20 }}>Facoltativo, ma aiuta a capire quante ore "partono da sole" ogni mese. Puoi anche saltare e tornarci dopo dalle Impostazioni.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {list.map((f) => {
          const Icon = FIXED_ICONS[f.tipo] || Receipt;
          return (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", backgroundColor: C.panelBorder, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={15} color={C.brass} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.paper, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.nome}</div>
                <div style={{ color: C.textDim, fontSize: 11, fontFamily: MONO_FONT }}>{f.importo.toFixed(2)}€ / {f.frequenza === "mensile" ? "mese" : f.frequenza === "settimanale" ? "sett" : f.frequenza === "annuale" ? "anno" : "giorno"}</div>
              </div>
              <button onClick={() => remove(f.id)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={15} color={C.textDim} /></button>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => setShowAdd(true)}
        style={{
          width: "100%", padding: "12px 0", borderRadius: 4, border: `1px dashed ${C.panelBorder}`,
          background: "none", color: C.textFainter, fontSize: 13, fontWeight: 400,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 16, cursor: "pointer",
        }}
      >
        <Plus size={15} /> Aggiungi spesa fissa
      </button>

      <PunchTicket style={{ borderRadius: 4, padding: 16 }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.textDim, fontFamily: MONO_FONT, marginBottom: 4 }}>Totale mensile impegnato</div>
        <div style={{ fontFamily: MONO_FONT, fontSize: 24, fontWeight: 800 }}>{monthlyTotal.toFixed(0)}€</div>
      </PunchTicket>

      <div style={{ flex: 1 }} />
      <button
        onClick={onNext}
        style={{ width: "100%", padding: "14px 0", borderRadius: 4, border: "none", backgroundColor: C.brass, color: C.ink, fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 24, cursor: "pointer" }}
      >
        Continua <ArrowRight size={16} />
      </button>

      {showAdd && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.8)" }} onClick={() => setShowAdd(false)} />
          <div style={{ position: "relative", backgroundColor: C.panel, borderTop: `1px solid #DED7C4`, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "16px 20px 32px 20px", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ width: 40, height: 4, backgroundColor: "#DED7C4", borderRadius: 4, margin: "0 auto 16px auto" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ color: C.paper, fontWeight: 700, fontSize: 15 }}>Nuova spesa fissa</span>
              <button onClick={() => setShowAdd(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} color={C.textDim} /></button>
            </div>

            <div style={{ marginBottom: 4 }}><FieldLabel>Nome</FieldLabel></div>
            <input
              type="text" value={form.nome} placeholder="es. Abbonamento palestra"
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px", color: C.paper, fontSize: 14, marginTop: 4, marginBottom: 12, outline: "none" }}
            />

            <div style={{ marginBottom: 6 }}><FieldLabel>Categoria</FieldLabel></div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {Object.entries(FIXED_ICONS).map(([key, Icon]) => (
                <button
                  key={key}
                  onClick={() => setForm({ ...form, tipo: key })}
                  style={{
                    width: 40, height: 40, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
                    border: `1px solid ${form.tipo === key ? C.brass : C.panelBorder}`,
                    backgroundColor: form.tipo === key ? C.panelBorder : C.inputBg,
                    cursor: "pointer",
                  }}
                >
                  <Icon size={16} color={form.tipo === key ? C.brass : C.textDim} />
                </button>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <FieldLabel>Importo €</FieldLabel>
                <input
                  type="number" value={form.importo} placeholder="0.00"
                  onChange={(e) => setForm({ ...form, importo: e.target.value })}
                  style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px", color: C.paper, fontSize: 14, marginTop: 4, outline: "none" }}
                />
              </div>
              <div>
                <FieldLabel>Frequenza</FieldLabel>
                <select
                  value={form.frequenza}
                  onChange={(e) => setForm({ ...form, frequenza: e.target.value })}
                  style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 8px", color: C.paper, fontSize: 13, marginTop: 4, outline: "none", colorScheme: "dark" }}
                >
                  <option value="mensile" style={{ backgroundColor: C.panel, color: C.paper }}>Mensile</option>
                  <option value="settimanale" style={{ backgroundColor: C.panel, color: C.paper }}>Settimanale</option>
                  <option value="giornaliera" style={{ backgroundColor: C.panel, color: C.paper }}>Giornaliera</option>
                  <option value="annuale" style={{ backgroundColor: C.panel, color: C.paper }}>Annuale</option>
                </select>
              </div>
            </div>

            <button onClick={addExpense} style={{ width: "100%", padding: "12px 0", borderRadius: 4, border: "none", backgroundColor: C.brass, color: C.ink, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              Aggiungi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function OnboardingGoal({ data, setData, onNext, onBack }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ tipo: "obiettivo", nome: "", importo: "", hasDeadline: true, mesi: "12", saved: "" });
  const goals = data.goals;

  const fixedMonthly = data.fixedList.reduce((s, f) => s + toMonthly(f), 0);
  const hourlyForIncome = data.redditoTipo === "variabile" && data.usaOraria
    ? tariffaOrariaLordaDa(data) * ((Number(data.percentualeNetta) || 100) / 100)
    : null;
  const monthlyIncomeQuandoLavora = hourlyForIncome
    ? hourlyForIncome * (Number(data.oreSettimana) || 0) * 4.33
    : Number(data.stipendio) || 0;
  const mesiFrazione = data.redditoTipo === "variabile" ? Math.min(Math.max(Number(data.mesiLavorati) || 12, 1), 12) / 12 : 1;
  const monthlyIncome = monthlyIncomeQuandoLavora * mesiFrazione;
  const freeMonthly = monthlyIncome - fixedMonthly;
  const existingMonthlyCommitted = goals.filter((g) => g.mesi).reduce((s, g) => s + Math.max(g.importo - (g.saved || 0), 0) / g.mesi, 0);
  const remainingToSave = Math.max((Number(form.importo) || 0) - (Number(form.saved) || 0), 0);
  const newMonthlyTarget = form.hasDeadline && form.importo && form.mesi ? remainingToSave / Number(form.mesi) : 0;
  const totalMonthlyIfAdded = existingMonthlyCommitted + newMonthlyTarget;
  const overBudget = form.hasDeadline && newMonthlyTarget > 0 && totalMonthlyIfAdded > freeMonthly;
  const tight = form.hasDeadline && newMonthlyTarget > 0 && !overBudget && totalMonthlyIfAdded > freeMonthly * 0.6;
  const isRiserva = form.tipo === "riserva";

  const addGoal = () => {
    if (!form.nome || !form.importo) return;
    setData({ ...data, goals: [...goals, { id: Date.now(), tipo: form.tipo, nome: form.nome, importo: Number(form.importo), mesi: form.hasDeadline ? (Number(form.mesi) || 12) : null, saved: Number(form.saved) || 0 }] });
    setForm({ tipo: "obiettivo", nome: "", importo: "", hasDeadline: true, mesi: "12", saved: "" });
    setShowAdd(false);
  };
  const remove = (id) => setData({ ...data, goals: goals.filter((g) => g.id !== id) });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 20px 32px 20px", position: "relative", overflowY: "auto" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, marginBottom: 12, alignSelf: "flex-start", cursor: "pointer" }}>← indietro</button>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.textDim, fontFamily: MONO_FONT }}>Passo 3 di 3</span>
        <span style={{ fontSize: 9, fontFamily: MONO_FONT, color: C.textFainter, border: `1px solid ${C.panelBorder}`, borderRadius: 999, padding: "2px 8px" }}>opzionale</span>
      </div>
      <h1 style={{ fontSize: 21, fontWeight: 700, color: C.paper, fontFamily: DISPLAY_FONT, margin: "0 0 4px 0" }}>I tuoi obiettivi</h1>
      <p style={{ fontSize: 13, color: C.textFainter, marginBottom: 20 }}>Facoltativo. Puoi avere più budget in parallelo — viaggio, fondo emergenza, o anche una riserva minima da ricostituire — e aggiungerne quando vuoi, anche più avanti.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {goals.map((g) => (
          <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 12, backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", backgroundColor: C.panelBorder, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {g.tipo === "riserva" ? <Landmark size={15} color={C.brass} /> : <PiggyBank size={15} color={C.brass} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: C.paper, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.nome}</span>
                {g.tipo === "riserva" && <span style={{ fontSize: 9, fontFamily: MONO_FONT, color: C.textFaint, border: `1px solid ${C.panelBorder}`, borderRadius: 999, padding: "1px 6px", flexShrink: 0 }}>riserva</span>}
              </div>
              <div style={{ color: C.textDim, fontSize: 11, fontFamily: MONO_FONT }}>
                {g.tipo === "riserva"
                  ? `minimo ${g.importo.toFixed(0)}€ · hai ${g.saved.toFixed(0)}€${g.mesi ? ` · recupero in ${g.mesi} mesi` : ""}`
                  : `${g.importo.toFixed(0)}€${g.saved > 0 ? ` (${g.saved.toFixed(0)}€ già da parte)` : ""}${g.mesi ? ` in ${g.mesi} mesi` : " · senza scadenza"}`}
              </div>
            </div>
            <button onClick={() => remove(g.id)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={15} color={C.textDim} /></button>
          </div>
        ))}
      </div>

      <button
        onClick={() => setShowAdd(true)}
        style={{ width: "100%", padding: "12px 0", borderRadius: 4, border: `1px dashed #DED7C4`, background: "none", color: C.textFainter, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 16, cursor: "pointer" }}
      >
        <Plus size={15} /> Aggiungi obiettivo
      </button>

      <div style={{ flex: 1 }} />
      <button onClick={onNext} style={{ width: "100%", padding: "14px 0", borderRadius: 4, border: "none", backgroundColor: C.brass, color: C.ink, fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 24, cursor: "pointer" }}>
        Inizia a usare l'app <ArrowRight size={16} />
      </button>
      <button onClick={onNext} style={{ background: "none", border: "none", textAlign: "center", color: C.textDim, fontSize: 12, marginTop: 12, cursor: "pointer" }}>Salta per ora</button>

      {showAdd && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.8)" }} onClick={() => setShowAdd(false)} />
          <div style={{ position: "relative", backgroundColor: C.panel, borderTop: `1px solid #DED7C4`, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "16px 20px 32px 20px", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ width: 40, height: 4, backgroundColor: "#DED7C4", borderRadius: 4, margin: "0 auto 16px auto" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ color: C.paper, fontWeight: 700, fontSize: 15 }}>Nuovo obiettivo</span>
              <button onClick={() => setShowAdd(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} color={C.textDim} /></button>
            </div>

            <div style={{ display: "flex", gap: 6, backgroundColor: C.bg, border: `1px solid ${C.panelBorder}`, borderRadius: 999, padding: 4, marginBottom: 16 }}>
              <button
                onClick={() => setForm({ ...form, tipo: "obiettivo" })}
                style={{ flex: 1, padding: "8px 0", borderRadius: 999, border: "none", cursor: "pointer", backgroundColor: !isRiserva ? C.brass : "transparent", color: !isRiserva ? "#FFFFFF" : C.textFaint, fontSize: 12, fontWeight: 700 }}
              >
                Obiettivo
              </button>
              <button
                onClick={() => setForm({ ...form, tipo: "riserva" })}
                style={{ flex: 1, padding: "8px 0", borderRadius: 999, border: "none", cursor: "pointer", backgroundColor: isRiserva ? C.brass : "transparent", color: isRiserva ? "#FFFFFF" : C.textFaint, fontSize: 12, fontWeight: 700 }}
              >
                Riserva minima
              </button>
            </div>
            {isRiserva && (
              <p style={{ fontSize: 11.5, color: C.textFaint, lineHeight: 1.5, margin: "-8px 0 14px 0" }}>
                Per una cifra da non scendere mai sotto (es. fondo emergenza): imposti la soglia minima, quanto hai adesso dopo un eventuale prelievo, ed entro quando vuoi tornare a quella soglia.
              </p>
            )}

            <div style={{ marginBottom: 4 }}><FieldLabel>Nome</FieldLabel></div>
            <input
              type="text" value={form.nome} placeholder={isRiserva ? "es. Fondo emergenza" : "es. Viaggio in Giappone"}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px", color: C.paper, fontSize: 14, marginTop: 4, marginBottom: 12, outline: "none" }}
            />
            <div style={{ marginBottom: 4 }}><FieldLabel>{isRiserva ? "Cifra minima da mantenere €" : "Importo €"}</FieldLabel></div>
            <input
              type="number" value={form.importo} placeholder={isRiserva ? "10000" : "2000"}
              onChange={(e) => setForm({ ...form, importo: e.target.value })}
              style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px", color: C.paper, fontSize: 14, marginTop: 4, marginBottom: 12, outline: "none" }}
            />
            <div style={{ marginBottom: 4 }}><FieldLabel>{isRiserva ? "Quanto hai adesso, dopo il prelievo (opzionale)" : "Quanto hai già messo da parte (opzionale)"}</FieldLabel></div>
            <input
              type="number" value={form.saved} placeholder="0"
              onChange={(e) => setForm({ ...form, saved: e.target.value })}
              style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px", color: C.paper, fontSize: 14, marginTop: 4, marginBottom: 16, outline: "none" }}
            />

            <button
              onClick={() => setForm({ ...form, hasDeadline: !form.hasDeadline })}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", padding: 0, marginBottom: form.hasDeadline ? 12 : 16, cursor: "pointer" }}
            >
              <span style={{ color: C.paper, fontSize: 13, fontWeight: 600 }}>{isRiserva ? "Imposta una scadenza per il recupero" : "Imposta una scadenza"}</span>
              <div style={{ width: 38, height: 20, borderRadius: 999, backgroundColor: form.hasDeadline ? C.brass : "#DED7C4", position: "relative", transition: "background-color 0.15s" }}>
                <div style={{ position: "absolute", top: 2, left: form.hasDeadline ? 20 : 2, width: 16, height: 16, borderRadius: "50%", backgroundColor: C.ink, transition: "left 0.15s" }} />
              </div>
            </button>

            {form.hasDeadline ? (
              <div style={{ marginBottom: 16 }}>
                <FieldLabel>Mesi</FieldLabel>
                <input
                  type="number" value={form.mesi} placeholder="12"
                  onChange={(e) => setForm({ ...form, mesi: e.target.value })}
                  style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px", color: C.paper, fontSize: 14, marginTop: 4, outline: "none" }}
                />
                {newMonthlyTarget > 0 ? (
                  <div style={{
                    display: "flex", alignItems: "flex-start", gap: 8, marginTop: 10, padding: "10px 12px", borderRadius: 4,
                    backgroundColor: overBudget ? "rgba(225,74,46,0.1)" : tight ? "rgba(255,107,74,0.1)" : "rgba(124,179,66,0.1)",
                    border: `1px solid ${overBudget ? C.rust : tight ? C.brass : C.green}`,
                  }}>
                    <span style={{ fontSize: 13, marginTop: -1 }}>{overBudget ? "⚠" : tight ? "!" : "✓"}</span>
                    <p style={{ fontSize: 12, color: C.paper, margin: 0, lineHeight: 1.5 }}>
                      {isRiserva ? "Per tornare alla soglia minima ti servono" : "Richiede"} <strong>{newMonthlyTarget.toFixed(0)}€/mese</strong>.{" "}
                      {overBudget ? (
                        <>Col reddito e le spese fisse che hai inserito ti restano solo <strong>{Math.max(freeMonthly, 0).toFixed(0)}€/mese</strong> liberi{existingMonthlyCommitted > 0 ? `, già impegnati per ${existingMonthlyCommitted.toFixed(0)}€/mese da altri obiettivi` : ""} — non è realistico così com'è. Allunga la scadenza o riduci l'importo.</>
                      ) : tight ? (
                        <>Ti restano {Math.max(freeMonthly, 0).toFixed(0)}€/mese liberi: fattibile, ma assorbe la maggior parte del margine.</>
                      ) : (
                        <>Sostenibile rispetto ai {Math.max(freeMonthly, 0).toFixed(0)}€/mese che ti restano liberi.</>
                      )}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: C.textFaint, lineHeight: 1.5, margin: "0 0 16px 0" }}>
                {isRiserva ? "Senza scadenza niente ritmo di recupero fisso: deciderai tu quanto rimettere, dalla schermata Report." : "Senza scadenza niente target periodici: a fine settimana deciderai tu quanto destinarci, dalla schermata Report."}
              </p>
            )}

            <button onClick={addGoal} style={{ width: "100%", padding: "12px 0", borderRadius: 4, border: "none", backgroundColor: C.brass, color: C.ink, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              Aggiungi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===================== APP =====================

function SpendingBar({ fixedHours, extraHours, capHours, hourly }) {
  const spentHours = fixedHours + extraHours;
  const over = spentHours > capHours;
  const fixedPct = Math.min(fixedHours / capHours, 1) * 100;
  const extraPct = Math.min(extraHours / capHours, 1 - fixedPct / 100) * 100;
  const extraColor = over ? C.rust : C.brass;

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", color: C.textFaint, marginBottom: 4 }}>Ore spese oggi</span>
        <span style={{ fontFamily: SERIF_FONT, fontSize: 38, fontWeight: 700, letterSpacing: "-0.01em", color: over ? C.rust : C.ink }}>{spentHours.toFixed(1)}h</span>
        {hourly ? <span style={{ fontSize: 12, color: C.textDim, fontFamily: MONO_FONT, marginTop: 2 }}>≈ {(spentHours * hourly).toFixed(0)}€</span> : null}
      </div>
      <div style={{ position: "relative", width: "100%", height: 18, borderRadius: 999, backgroundColor: "rgba(23,23,23,0.08)", overflow: "hidden", display: "flex" }}>
        <div style={{ width: `${fixedPct}%`, backgroundColor: C.fixedBar, transition: "width 0.6s ease", borderRadius: 999 }} />
        <div style={{ width: `${extraPct}%`, backgroundColor: extraColor, transition: "width 0.6s ease, background-color 0.3s ease", borderRadius: 999, marginLeft: fixedPct > 0 && extraPct > 0 ? 3 : 0 }} />
      </div>
      <div style={{ textAlign: "right", marginTop: 6 }}>
        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: C.textFainter, fontFamily: MONO_FONT }}>su {capHours}h oggi</span>
      </div>
    </div>
  );
}

function BankNotificationBanner({ tx, onTap, onDismiss }) {
  return (
    <div
      style={{
        position: "absolute", top: 8, left: 8, right: 8, zIndex: 60,
        backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 12,
        padding: "10px 12px", boxShadow: "0 8px 24px rgba(23,23,23,0.18)",
        display: "flex", alignItems: "center", gap: 10,
        animation: "none",
      }}
    >
      <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: C.panelBorder, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Landmark size={16} color={C.brass} />
      </div>
      <button onClick={onTap} style={{ flex: 1, textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 1 }}>
          <span style={{ fontSize: 11, fontFamily: MONO_FONT, color: C.textFaint }}>Banca · ora</span>
        </div>
        <div style={{ color: C.paper, fontSize: 13, fontWeight: 600 }}>
          Nuova transazione: {tx.euro.toFixed(2)}€
        </div>
        <div style={{ color: C.textFainter, fontSize: 11.5 }}>{tx.merchant} · tocca per etichettare</div>
      </button>
      <button onClick={onDismiss} style={{ background: "none", border: "none", cursor: "pointer", flexShrink: 0, padding: 4 }}>
        <X size={14} color={C.textFaint} />
      </button>
    </div>
  );
}

function OneTapCategorizeSheet({ tx, hourly, onClose, onConfirm }) {
  const [done, setDone] = useState(false);
  const suggested = CATEGORIES.find((c) => c.id === tx.suggestedCat);

  const pick = (cat) => {
    setDone(true);
    playExpenseSound();
    onConfirm({ cat: cat.label, iconId: cat.id, euro: tx.euro, time: "adesso" });
    setTimeout(onClose, 1300);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 55, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.8)" }} onClick={done ? undefined : onClose} />
      <div style={{ position: "relative", backgroundColor: C.panel, borderTop: `1px solid #DED7C4`, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "16px 20px 32px 20px" }}>
        <div style={{ width: 40, height: 4, backgroundColor: "#DED7C4", borderRadius: 4, margin: "0 auto 16px auto" }} />

        {!done ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <Landmark size={16} color={C.brass} />
              <span style={{ fontSize: 11, fontFamily: MONO_FONT, color: C.textFaint }}>rilevata dal conto</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 2 }}>
              <span style={{ fontFamily: MONO_FONT, fontSize: 28, fontWeight: 800, color: C.paper }}>{tx.euro.toFixed(2)}€</span>
              <span style={{ fontFamily: MONO_FONT, fontSize: 13, color: C.brass }}>{euroToTime(tx.euro, hourly)}</span>
            </div>
            <div style={{ fontSize: 13, color: C.textFainter, marginBottom: 18 }}>{tx.merchant}</div>

            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", color: C.textDim, fontFamily: MONO_FONT, marginBottom: 10 }}>
              Un tap per etichettare{suggested ? " — suggerito evidenziato" : ""}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {CATEGORIES.map((c) => {
                const isSuggested = c.id === tx.suggestedCat;
                return (
                  <button
                    key={c.id}
                    onClick={() => pick(c)}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                      backgroundColor: isSuggested ? "rgba(255,107,74,0.12)" : C.inputBg,
                      border: `1px solid ${isSuggested ? C.brass : C.panelBorder}`,
                      borderRadius: 4, padding: "16px 0", cursor: "pointer",
                    }}
                  >
                    <c.icon size={22} color={isSuggested ? C.brass : C.textDim} />
                    <span style={{ fontSize: 11, color: isSuggested ? C.brass : C.paper, fontWeight: isSuggested ? 700 : 400 }}>{c.label}</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div style={{ padding: "24px 0", textAlign: "center" }}>
            <div style={{ fontSize: 30, marginBottom: 8, color: C.green }}>✓</div>
            <div style={{ fontFamily: MONO_FONT, color: C.paper, fontSize: 18 }}>{tx.euro.toFixed(2)}€ etichettati</div>
            <div style={{ fontFamily: MONO_FONT, color: C.brass, fontSize: 14, marginTop: 4 }}>→ {euroToTime(tx.euro, hourly)} del tuo tempo</div>
          </div>
        )}
      </div>
    </div>
  );
}

function TransactionsScreen({ hourly, connectedAccounts, feed, setFeed, onBack, onOpenSettings, onCategorize }) {
  const hasAnyAccount = Object.values(connectedAccounts).some(Boolean);
  const [selectedTx, setSelectedTx] = useState(null);

  const activeSources = Object.keys(ACCOUNT_SOURCES).filter((id) => connectedAccounts[id]);
  const bySource = {};
  activeSources.forEach((id) => { bySource[id] = feed.filter((t) => t.source === id); });

  const totalEuro = feed.reduce((s, t) => s + t.euro, 0);
  const totalHours = totalEuro / hourly;

  const handleConfirm = (entry, txId) => {
    onCategorize(entry);
    setFeed((f) => f.filter((t) => t.id !== txId));
    setSelectedTx(null);
  };

  const refreshFeed = () => {
    setFeed(generateTransactionFeed(connectedAccounts));
  };

  if (!hasAnyAccount) {
    return (
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 32 }}>
        <ScreenHeader eyebrow="Da conti collegati" title="Rendiconto" />
        <div style={{ padding: "0 20px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 16, borderRadius: 4, backgroundColor: C.panel, border: `1px solid ${C.panelBorder}` }}>
            <Landmark size={16} color={C.brass} style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 13, color: C.paper, margin: "0 0 10px 0", lineHeight: 1.5 }}>
                Nessun conto collegato ancora. Collega banca, Revolut o PayPal dalle Impostazioni per vedere qui le transazioni in automatico.
              </p>
              <button onClick={onOpenSettings} style={{ padding: "8px 14px", borderRadius: 4, border: "none", backgroundColor: C.brass, color: C.ink, fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
                Vai a Impostazioni
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 96, position: "relative" }}>
      <ScreenHeader
        eyebrow="Da conti collegati"
        title="Rendiconto"
        right={
          <button onClick={refreshFeed} title="Aggiorna transazioni" style={{ background: "none", border: `1px solid ${C.panelBorder}`, borderRadius: 999, padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
            <BarChart3 size={13} color={C.brass} />
            <span style={{ fontSize: 10, fontFamily: MONO_FONT, color: C.textFaint }}>aggiorna</span>
          </button>
        }
      />

      <div style={{ padding: "0 20px" }}>
        <PunchTicket style={{ borderRadius: 4, padding: 16, border: "1px solid #E2DAC5", marginBottom: 16 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.textDim, fontFamily: MONO_FONT, marginBottom: 6 }}>
            Totale da {activeSources.length} cont{activeSources.length === 1 ? "o" : "i"} collegat{activeSources.length === 1 ? "o" : "i"}
          </div>
          {feed.length > 0 ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <div style={{ fontFamily: MONO_FONT, fontSize: 28, fontWeight: 800 }}>{totalEuro.toFixed(0)}€</div>
              <div style={{ fontFamily: MONO_FONT, fontSize: 13, color: C.textFaint }}>{totalHours.toFixed(1)}h</div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: C.green, fontWeight: 600 }}>✓ Nessuna transazione in sospeso</div>
          )}
          <div style={{ fontSize: 11.5, color: C.textFaint, marginTop: 4 }}>{feed.length} transazion{feed.length === 1 ? "e" : "i"} da categorizzare</div>
        </PunchTicket>

        {activeSources.length > 0 && (
          <>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.textDim, fontFamily: MONO_FONT, marginBottom: 10 }}>Spaccato per conto</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
              {activeSources.map((sourceId) => {
                const src = ACCOUNT_SOURCES[sourceId];
                const txs = bySource[sourceId] || [];
                const subtotal = txs.reduce((s, t) => s + t.euro, 0);
                const pct = totalEuro > 0 ? (subtotal / totalEuro) * 100 : 0;
                return (
                  <div key={sourceId} style={{ backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <src.icon size={15} color={C.brass} />
                      <span style={{ color: C.paper, fontSize: 13, fontWeight: 600, flex: 1 }}>{src.label}</span>
                      <span style={{ fontFamily: MONO_FONT, fontSize: 11, color: C.textFainter }}>{txs.length} tx</span>
                      <span style={{ fontFamily: MONO_FONT, fontSize: 13, color: C.paper, minWidth: 50, textAlign: "right" }}>{subtotal.toFixed(0)}€</span>
                    </div>
                    <div style={{ height: 4, backgroundColor: C.panelBorder, borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, backgroundColor: C.brass }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {feed.length > 0 && activeSources.map((sourceId) => {
          const src = ACCOUNT_SOURCES[sourceId];
          const txs = bySource[sourceId] || [];
          if (txs.length === 0) return null;
          return (
            <div key={sourceId} style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <src.icon size={13} color={C.textDim} />
                <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", color: C.textDim, fontFamily: MONO_FONT }}>{src.label}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {txs.map((tx) => {
                  const cat = CATEGORIES.find((c) => c.id === tx.suggestedCat);
                  return (
                    <button
                      key={tx.id}
                      onClick={() => setSelectedTx(tx)}
                      style={{ width: "100%", textAlign: "left", cursor: "pointer", backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}
                    >
                      <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: C.panelBorder, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <src.icon size={15} color={C.brass} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: C.paper, fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tx.merchant}</div>
                        {cat ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                            <cat.icon size={11} color={C.textFaint} />
                            <span style={{ fontSize: 10.5, color: C.textFaint }}>{cat.label}?</span>
                          </div>
                        ) : null}
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontFamily: MONO_FONT, fontSize: 14, color: C.paper }}>{tx.euro.toFixed(2)}€</div>
                        <div style={{ fontFamily: MONO_FONT, fontSize: 10.5, color: C.brass }}>{euroToTime(tx.euro, hourly)}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {selectedTx && (
        <OneTapCategorizeSheet
          tx={selectedTx}
          hourly={hourly}
          onClose={() => setSelectedTx(null)}
          onConfirm={(entry) => handleConfirm(entry, selectedTx.id)}
        />
      )}
    </div>
  );
}

// Tutorial guidato, mostrato una sola volta subito dopo il primo onboarding.
// Porta davvero la persona dentro le schermate di cui parla (cambiando tab),
// e per i passi sul Diario disegna una freccetta che punta all'elemento esatto,
// così non resta il dubbio di "a cosa si riferisce questo testo?".
// Per saltarlo del tutto bisogna tenere premuto 2 secondi.
// Costruisce la sequenza del tutorial. Per chi ha reddito variabile aggiunge i
// passi su Calendario, Progetti e Regime fiscale, che chi ha stipendio fisso non ha.
function buildTutorialSteps(isVariabile) {
  const steps = [
    { tab: "diario", targetId: "tut-gauge", radius: 12, text: "Qui in alto vedi subito quante ore hai già \"speso\" oggi: viola per le spese fisse, arancio/rosso per quelle extra." },
    { tab: "diario", targetId: "tut-add", radius: 999, text: "Tocca qui per registrare una spesa: scegli la categoria, conferma l'importo, fatto in pochi secondi." },
    {
      tab: "diario", targetId: "tut-tabbar", radius: 12,
      text: hasTier("premium")
        ? "Da questa barra passi tra le sezioni dell'app. Diario, Calendario, Simulatore e Budget ci sono sempre; le altre due compaiono quando servono."
        : "Da questa barra passi tra le sezioni dell'app: Diario, Simulatore e Budget. Con Premium si aggiungono anche Calendario e Chiusura.",
    },
  ];

  if (hasTier("premium")) {
    steps.push({
      tab: "calendario", targetId: "tut-tab-calendario", radius: 16,
      text: isVariabile
        ? "Il Calendario è pensato per te: segna turni, entrate e uscite, pianificati o già confermati. Da qui trovi anche \"Progetti\", per capire quanto rendono davvero i lavori che accetti."
        : "Il Calendario serve a pianificare le spese extra che sai già che arriveranno — una multa, la gita scolastica dei figli, il bollo auto — così le vedi arrivare prima che ti colgano di sorpresa.",
    });
  }

  steps.push({
    tab: "sim", targetId: "tut-tab-sim", radius: 16,
    text: hasTier("premium")
      ? "Il Simulatore ti mostra il costo reale di un acquisto prima di farlo: cash, a rate senza interessi, o a rate finanziate — confronta le ore che ti costa ciascuna opzione."
      : "Il Simulatore ti mostra il costo reale di un acquisto prima di farlo: cash o a rate senza interessi, sempre confrontato in ore. Con Premium si aggiunge anche il confronto con i finanziamenti a rate.",
  });
  steps.push({
    tab: "goal", targetId: "tut-tab-goal", radius: 16,
    text: hasTier("premium")
      ? "Questo è Budget: qui vedi tutti i tuoi obiettivi di risparmio con l'avanzamento. Tocca \"+\" in alto per aggiungerne uno nuovo in qualsiasi momento."
      : "Questo è Budget: qui tieni il tuo obiettivo di risparmio con l'avanzamento. Il piano Free ne include uno; con Premium puoi averne quanti vuoi in parallelo.",
  });

  if (!KICKSTARTER_BUILD && hasTier("premium")) {
    steps.push({ tab: "settings", targetId: "tut-bank-connect", radius: 10, text: "Tocca qui per collegare banca, Revolut o PayPal. Una volta collegati, l'app ti avvisa ogni volta che spendi qualcosa, pronta da categorizzare in un tocco: è la card \"Rendiconto\" che compare in basso." });
    steps.push({ tab: "settings", targetId: "tut-import-csv", radius: 8, text: "Se hai già una lista di spese salvata, puoi importarla qui in un colpo solo: l'app legge i movimenti e te li mostra in ore, non solo in euro, divisi giorno per giorno nel Calendario." });
  }

  if (isVariabile && hasTier("elite")) {
    steps.push({ tab: "settings", targetId: null, text: "Sempre dalle Impostazioni trovi \"Regime fiscale\": inserendo il tuo reddito presunto, il regime (forfettario/ordinario) e i contributi, ti dà una stima del netto — utile, ma non sostituisce il tuo commercialista." });
  }

  if (hasTier("premium")) {
    steps.push({ tab: "diario", targetId: "tut-tab-closure", radius: 16, text: "Ultima cosa: quando hai messo via qualcosa alla fine della settimana o del mese, comparirà qui in basso anche \"Chiusura\" — da lì decidi tu su quale obiettivo farlo atterrare." });
  }

  steps.push({ tab: "settings", targetId: "tut-guida", radius: 8, text: "E se in futuro ti dimentichi come funziona qualcosa, torna qui: nella Guida trovi un esempio semplice per ogni parte dell'app, sempre a portata di mano." });

  return steps;
}

// Tutorial con "spotlight" vero: misura la posizione reale del pulsante/elemento
// sullo schermo (via getBoundingClientRect) e ritaglia un buco esattamente lì,
// invece di indovinare coordinate fisse — così il riquadro punta sempre giusto.
function TutorialOverlay({ step, steps, frameRef, onNext, onFinish }) {
  const [spot, setSpot] = useState(null); // { top, left, width, height } relative al frame
  const current = steps[step];
  const isLast = step === steps.length - 1;
  const FRAME_H = 780;

  useEffect(() => {
    if (!current.targetId || !frameRef.current) {
      setSpot(null);
      return;
    }
    // piccolo ritardo per essere sicuri che la schermata di destinazione sia già montata
    const t = setTimeout(() => {
      const target = document.getElementById(current.targetId);
      if (!target || !frameRef.current) { setSpot(null); return; }
      const tRect = target.getBoundingClientRect();
      const fRect = frameRef.current.getBoundingClientRect();
      setSpot({ top: tRect.top - fRect.top, left: tRect.left - fRect.left, width: tRect.width, height: tRect.height });
    }, 60);
    return () => clearTimeout(t);
  }, [step, current.targetId, frameRef]);

  const pad = 8;
  const cardStyle = { position: "absolute", left: 20, right: 20, backgroundColor: C.panel, border: `1px solid ${C.brass}`, borderRadius: 10, padding: 16, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" };
  if (spot) {
    const spotBottom = spot.top + spot.height;
    if (spot.top < FRAME_H / 2) {
      cardStyle.top = spotBottom + pad + 10;
    } else {
      cardStyle.bottom = Math.max(FRAME_H - spot.top + pad + 10, 74);
    }
  } else {
    cardStyle.top = 100;
  }

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 100 }}>
      {spot ? (
        <div style={{
          position: "absolute",
          top: spot.top - pad, left: spot.left - pad, width: spot.width + pad * 2, height: spot.height + pad * 2,
          borderRadius: current.radius, border: `2px solid ${C.brass}`,
          boxShadow: "0 0 0 9999px rgba(20,15,10,0.82)",
          pointerEvents: "none", transition: "top 0.25s ease, left 0.25s ease, width 0.25s ease, height 0.25s ease",
        }} />
      ) : (
        <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(20,15,10,0.82)" }} />
      )}

      <div style={cardStyle}>
        <div style={{ fontSize: 10, fontFamily: MONO_FONT, color: C.brass, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          {step + 1} / {steps.length}
        </div>
        <p style={{ fontSize: 13, color: C.paper, lineHeight: 1.5, margin: "0 0 14px 0" }}>{current.text}</p>
        <button onClick={onNext} style={{ width: "100%", padding: "10px 0", borderRadius: 6, border: "none", backgroundColor: C.brass, color: C.ink, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          {isLast ? "Ho capito, si parte" : "Avanti"}
        </button>
      </div>

      <HoldButton
        onConfirm={onFinish}
        holdMs={2000}
        style={{ position: "absolute", top: 10, right: 10, padding: "5px 10px", borderRadius: 999, border: `1px solid rgba(255,255,255,0.25)`, backgroundColor: "rgba(0,0,0,0.55)", color: "rgba(255,255,255,0.75)", fontSize: 9.5 }}
      >
        Salta (tieni 2s)
      </HoldButton>
    </div>
  );
}

function DiarioScreen({ profile, todayEntries, onOpenAdd, onOpenSettings, onOpenReport, onOpenGoal, onSimulateBankTx, rateSource }) {
  const [showConcept, setShowConcept] = useState(false);
  const hourly = profile.hourlyRate;
  const dailyHours = 8;
  const fixedMonthly = profile.fixedList.reduce((s, f) => s + toMonthly(f), 0);
  const fixedHours = (fixedMonthly / 30) / hourly;
  const extraSpent = todayEntries.reduce((s, e) => s + e.euro, 0);
  const extraHours = extraSpent / hourly;
  const spentHours = fixedHours + extraHours;
  const remaining = Math.max(dailyHours - spentHours, 0);
  const over = spentHours > dailyHours;
  const primaryGoal = profile.goals[0] || null;
  const goalPct = primaryGoal ? Math.min((primaryGoal.saved / primaryGoal.importo) * 100, 100) : null;
  const otherGoalsCount = Math.max(profile.goals.length - 1, 0);

  return (
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 96 }}>
      <ScreenHeader
        eyebrow="Oggi · Martedì 18 Agosto"
        title="Diario"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {!KICKSTARTER_BUILD && (
              <button
                onClick={onSimulateBankTx}
                title="Demo: simula una notifica bancaria"
                style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: `1px solid ${C.panelBorder}`, borderRadius: 999, padding: "5px 10px", cursor: "pointer" }}
              >
                <Landmark size={13} color={C.brass} />
                <span style={{ fontSize: 10, fontFamily: MONO_FONT, color: C.textFaint }}>simula</span>
              </button>
            )}
            <button onClick={onOpenSettings} style={{ background: "none", border: "none", cursor: "pointer" }}><Settings2 size={18} color={C.textDim} /></button>
          </div>
        }
      />

      <div style={{ padding: "0 20px", marginBottom: 14, display: "flex", justifyContent: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 999, padding: "6px 8px 6px 14px" }}>
          <span style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.1em" }}>La tua ora di lavoro vale</span>
          <span style={{ fontFamily: MONO_FONT, fontSize: 13, fontWeight: 800, color: C.brass }}>{hourly.toFixed(2)}€/h</span>
          {rateSource && (
            <span style={{ fontSize: 9, fontFamily: MONO_FONT, color: rateSource === "reale" ? C.green : C.textFainter, border: `1px solid ${rateSource === "reale" ? C.green : C.panelBorder}`, borderRadius: 999, padding: "1px 6px" }}>
              {rateSource}
            </span>
          )}
          <button onClick={() => setShowConcept(true)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 2 }} title="Perché ore e non euro?">
            <Info size={14} color={C.textFaint} />
          </button>
        </div>
      </div>

      <div style={{ padding: "0 20px" }}>
        <PunchTicket id="tut-gauge" style={{ borderRadius: 4, padding: "24px 16px", border: `1px solid #E2DAC5` }}>
          <SpendingBar fixedHours={fixedHours} extraHours={extraHours} capHours={dailyHours} hourly={hourly} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 12, marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: C.fixedBar, display: "inline-block" }} />
              <span style={{ fontSize: 11, color: C.textFaint }}>Fisse {fixedHours.toFixed(1)}h</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: C.brass, display: "inline-block" }} />
              <span style={{ fontSize: 11, color: C.textFaint }}>Extra {extraHours.toFixed(1)}h</span>
            </div>
          </div>
          <div style={{ textAlign: "center", marginTop: 8 }}>
            {over ? (
              <p style={{ fontSize: 13, color: C.rust, fontWeight: 600, margin: 0 }}>
                Oltre di {(spentHours - dailyHours).toFixed(1)}h ({((spentHours - dailyHours) * hourly).toFixed(0)}€)
              </p>
            ) : (
              <p style={{ fontSize: 13, color: C.green, fontWeight: 600, margin: 0 }}>
                Ore libere: {remaining.toFixed(1)}h ({(remaining * hourly).toFixed(0)}€)
              </p>
            )}
          </div>
        </PunchTicket>
      </div>

      {primaryGoal ? (
        <div style={{ padding: "0 20px", marginTop: 16 }}>
          <div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.15em", color: C.textFainter, fontFamily: MONO_FONT, marginBottom: 6 }}>
            Obiettivo principale{otherGoalsCount > 0 ? ` · +${otherGoalsCount} altri` : ""}
          </div>
          <button
            onClick={onOpenGoal}
            style={{ width: "100%", textAlign: "left", cursor: "pointer", backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: 12 }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ color: C.paper, fontWeight: 600, fontSize: 13.5 }}>{primaryGoal.nome}</span>
              <TrendingDown size={14} color={C.rust} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontFamily: MONO_FONT, fontSize: 10.5, color: C.textFainter }}>{primaryGoal.saved.toFixed(0)}€ / {primaryGoal.importo.toFixed(0)}€</span>
              <span style={{ fontFamily: MONO_FONT, fontSize: 10.5, color: C.textFainter }}>{(goalPct || 0).toFixed(0)}%</span>
            </div>
            <div style={{ height: 5, backgroundColor: C.panelBorder, borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
              <div style={{ height: "100%", backgroundColor: C.brass, width: `${goalPct || 0}%` }} />
            </div>
            <div style={{ fontSize: 10.5, color: C.textFainter }}>vai a tutti i budget →</div>
          </button>
        </div>
      ) : null}

      <div style={{ padding: "0 20px", marginTop: 20 }}>
        <button
          onClick={onOpenReport}
          style={{
            width: "100%", textAlign: "left", cursor: "pointer", border: `1px solid ${C.brass}`,
            backgroundColor: "rgba(255,107,74,0.08)", borderRadius: 4, padding: 16,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          }}
        >
          <div>
            <div style={{ color: C.paper, fontWeight: 700, fontSize: 14, marginBottom: 2 }}>Guarda un esempio di resoconto</div>
            <div style={{ color: C.textFaint, fontSize: 12 }}>Così sarà quando avrai le tue spese →</div>
          </div>
          <BarChart3 size={22} color={C.brass} />
        </button>
      </div>

      <div style={{ padding: "0 20px", marginTop: 20 }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.textDim, fontFamily: MONO_FONT, marginBottom: 8 }}>Timbrature di oggi</div>
        {todayEntries.length === 0 ? (
          <div style={{ color: C.textFaint, fontSize: 13, fontStyle: "italic", padding: "16px 0", textAlign: "center", border: `1px dashed ${C.panelBorder}`, borderRadius: 4 }}>Nessuna spesa registrata oggi</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {todayEntries.map((e, i) => {
              const EntryIcon = (typeof e.icon === "function" ? e.icon : null) || (CATEGORIES.find((c) => c.id === e.iconId)?.icon) || MoreHorizontal;
              return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", backgroundColor: C.panelBorder, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <EntryIcon size={15} color={C.brass} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: C.paper, fontSize: 13, fontWeight: 600 }}>{e.cat}</div>
                  <div style={{ color: C.textDim, fontSize: 11, fontFamily: MONO_FONT }}>{e.time}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: MONO_FONT, fontSize: 13, color: C.paper }}>{e.euro.toFixed(2)}€</div>
                  <div style={{ fontFamily: MONO_FONT, fontSize: 11, color: C.brass }}>{euroToTime(e.euro, hourly)}</div>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      <button
        id="tut-add"
        onClick={onOpenAdd}
        style={{
          position: "fixed", bottom: 96, right: "calc(50% - 190px + 24px)",
          width: 56, height: 56, borderRadius: "50%", backgroundColor: C.brass, border: "none",
          display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 20px rgba(255,107,74,0.45)", cursor: "pointer",
        }}
      >
        <Plus size={26} color={C.ink} strokeWidth={2.5} />
      </button>

      {showConcept && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.75)" }} onClick={() => setShowConcept(false)} />
          <div style={{ position: "relative", backgroundColor: C.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "20px 22px 32px 22px" }}>
            <div style={{ width: 40, height: 4, backgroundColor: C.panelBorder, borderRadius: 4, margin: "0 auto 18px auto" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ color: C.paper, fontWeight: 700, fontSize: 15, fontFamily: DISPLAY_FONT }}>Perché in ore, non in euro?</span>
              <button onClick={() => setShowConcept(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} color={C.textDim} /></button>
            </div>
            <p style={{ fontSize: 13.5, color: C.textDim, fontFamily: SANS_FONT, lineHeight: 1.6, margin: "0 0 12px 0" }}>
              100€ sono 100€ per tutti. Ma per te, con la tua tariffa oraria, potrebbero essere <strong style={{ color: C.paper }}>{(100 / hourly).toFixed(1)}h</strong> di lavoro — per un'altra persona potrebbero essere molte di meno o molte di più.
            </p>
            <p style={{ fontSize: 13.5, color: C.textDim, fontFamily: SANS_FONT, lineHeight: 1.6, margin: "0 0 18px 0" }}>
              Gli euro sono uguali per tutti. Le ore no: sono la misura vera di quanto ti costa qualcosa, perché sono la tua vita che se ne va. Per questo ogni spesa qui la vedi prima in ore.
            </p>
            <button
              onClick={() => setShowConcept(false)}
              style={{ width: "100%", padding: "12px 0", borderRadius: 6, border: "none", backgroundColor: C.brass, color: "#FFFFFF", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}
            >
              Ho capito
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddSheet({ hourly, onClose, onAdd }) {
  const [step, setStep] = useState("category");
  const [category, setCategory] = useState(null);
  const [amount, setAmount] = useState(null);

  const handleAmount = (val) => {
    setAmount(val);
    setStep("done");
    playExpenseSound();
    onAdd({ cat: category.label, iconId: category.id, euro: val, time: "adesso" });
    setTimeout(onClose, 1400);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.8)" }} onClick={onClose} />
      <div style={{ position: "relative", backgroundColor: C.panel, borderTop: "1px solid #DED7C4", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "16px 20px 32px 20px", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ width: 40, height: 4, backgroundColor: "#DED7C4", borderRadius: 4, margin: "0 auto 16px auto" }} />
        {step === "category" && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ color: C.paper, fontWeight: 700, fontSize: 15 }}>Nuova spesa</span>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} color={C.textDim} /></button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setCategory(c); setStep("amount"); }}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "16px 0", cursor: "pointer" }}
                >
                  <c.icon size={22} color={C.brass} />
                  <span style={{ fontSize: 11, color: C.paper }}>{c.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {step === "amount" && category && (
          <>
            <button onClick={() => setStep("category")} style={{ background: "none", border: "none", color: C.textDim, fontSize: 13, marginBottom: 20, cursor: "pointer" }}>← indietro</button>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
              <category.icon size={20} color={C.brass} />
              <span style={{ color: C.paper, fontWeight: 700 }}>{category.label}</span>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {[category.suggested, category.suggested ? category.suggested * 1.5 : null, category.suggested ? category.suggested * 0.6 : null]
                .filter(Boolean)
                .map((v, i) => (
                  <button key={i} onClick={() => handleAmount(v)} style={{ padding: "8px 16px", borderRadius: 999, backgroundColor: C.panelBorder, color: C.paper, fontSize: 13, fontFamily: MONO_FONT, border: "1px solid #DED7C4", cursor: "pointer" }}>
                    {v.toFixed(2)}€
                  </button>
                ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", ""].map((k, i) =>
                k ? (
                  <button key={i} onClick={() => handleAmount(Number(k))} style={{ padding: "12px 0", borderRadius: 4, backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, color: C.paper, fontFamily: MONO_FONT, fontSize: 18, cursor: "pointer" }}>
                    {k}
                  </button>
                ) : <div key={i} />
              )}
            </div>
          </>
        )}
        {step === "done" && amount && (
          <div style={{ padding: "24px 0", textAlign: "center" }}>
            <div style={{ fontSize: 30, marginBottom: 8, color: C.green }}>✓</div>
            <div style={{ fontFamily: MONO_FONT, color: C.paper, fontSize: 18 }}>{amount.toFixed(2)}€</div>
            <div style={{ fontFamily: MONO_FONT, color: C.brass, fontSize: 14, marginTop: 4 }}>→ {euroToTime(amount, hourly)} del tuo tempo</div>
            <div style={{ color: C.rust, fontSize: 12, marginTop: 12 }}>Il tuo obiettivo slitta di 3 ore</div>
          </div>
        )}
      </div>
    </div>
  );
}

const PERIOD_DIVISORS = { giorno: 30.44, settimana: 4.33, mese: 1 };
const PERIOD_LABELS = { giorno: "al giorno", settimana: "a settimana", mese: "al mese" };

function periodExtraSpent(totalEuro, period) {
  // Stima della spesa extra nel periodo scelto, a partire dal dato settimanale simulato
  if (period === "giorno") return totalEuro / 7;
  if (period === "mese") return totalEuro * 4.33;
  return totalEuro; // settimana
}

function periodRecommended(g, period) {
  const monthlyTarget = g.importo / Number(g.mesi || 12);
  return monthlyTarget / PERIOD_DIVISORS[period];
}

// Calcola il pool disponibile da distribuire: risparmio del periodo + eventuale rimanenza non allocata dal periodo precedente
function computeClosurePool(profile, hourly) {
  const { totalEuro } = buildWeekInsights(hourly);
  const period = profile.closurePeriod;
  const monthlyFree = freeMonthlyMargin(profile);
  const periodFree = monthlyFree / PERIOD_DIVISORS[period];
  const periodSpent = periodExtraSpent(totalEuro, period);
  const periodSaved = Math.round(periodFree - periodSpent);
  const carryOver = Math.max(profile.carryOver || 0, 0);
  const pool = Math.max(periodSaved, 0) + carryOver;
  return { pool, periodSaved, carryOver };
}

const PERIOD_EYEBROW = { giorno: "Oggi", settimana: "Ultimi 7 giorni", mese: "Ultimo mese" };
const PERIOD_TITLE = { giorno: "Il tuo giorno", settimana: "La tua settimana", mese: "Il tuo mese" };
const PERIOD_CTA = { giorno: "Chiudi la giornata", settimana: "Chiudi la settimana", mese: "Chiudi il mese" };

function ReportScreen({ hourly, profile, onBack, onOpenClosure }) {
  const period = profile.closurePeriod;
  const { totalHours, totalEuro, deltaHours, categoryList, criticalDay, criticalMultiplier } = buildWeekInsights(hourly);
  const maxDayExtra = Math.max(...WEEK_DATA.map((d) => d.extra));
  const worse = deltaHours > 0;

  const topCat = categoryList[0];
  const CAT_ICON_MAP = { Colazione: Coffee, Pranzo: UtensilsCrossed, Aperitivo: Beer, Trasporti: Car, Spesa: ShoppingBag, Bollette: Zap, Finanziamento: CreditCard, Salute: HeartPulse, Regalo: Gift, Sigarette: Cigarette, Altro: MoreHorizontal };

  // suggerimento concreto legato alla categoria che pesa di più
  const potentialSavingHours = topCat.hours * 0.5;
  const potentialSavingEuro = potentialSavingHours * hourly;
  const firstDeadlineGoal = profile.goals.find((g) => g.mesi) || null;
  const goalDaysGained = firstDeadlineGoal ? Math.round((potentialSavingEuro / firstDeadlineGoal.importo) * (Number(firstDeadlineGoal.mesi || 12) * 30)) : null;

  return (
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 32 }}>
      <div style={{ padding: "8px 20px 4px 20px", display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}>
          <ChevronLeft size={20} color={C.textDim} />
        </button>
        <span style={{ fontSize: 12, color: C.textDim, fontFamily: MONO_FONT }}>Diario</span>
      </div>
      <ScreenHeader eyebrow={PERIOD_EYEBROW[period]} title={PERIOD_TITLE[period]} />
      <div style={{ padding: "0 20px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, backgroundColor: "rgba(255,107,74,0.12)", border: `1px solid ${C.brass}`, borderRadius: 8, padding: "10px 12px" }}>
          <Info size={13} color={C.brass} style={{ marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, color: C.brass, fontWeight: 600, lineHeight: 1.4 }}>Dati di esempio — qui vedrai la tua settimana vera quando avrai registrato qualche spesa</span>
        </div>
      </div>

      <div style={{ padding: "0 20px" }}>
        <PunchTicket style={{ borderRadius: 4, padding: 16, border: "1px solid #E2DAC5" }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.textDim, fontFamily: MONO_FONT, marginBottom: 6 }}>Tempo extra totale</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <div style={{ fontFamily: MONO_FONT, fontSize: 32, fontWeight: 800 }}>{totalHours.toFixed(1)}h</div>
            <div style={{ fontFamily: MONO_FONT, fontSize: 14, color: C.textFaint }}>{totalEuro.toFixed(0)}€</div>
          </div>
          <div style={{ fontFamily: MONO_FONT, fontSize: 13, color: worse ? C.rust : C.green, fontWeight: 700, marginTop: 4 }}>
            {worse ? "▲" : "▼"} {Math.abs(deltaHours).toFixed(1)}h vs periodo scorso
          </div>
        </PunchTicket>
      </div>

      <div style={{ padding: "0 20px", marginTop: 20 }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.textDim, fontFamily: MONO_FONT, marginBottom: 10 }}>Spesa extra per giorno</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 128, backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "12px 12px 10px 12px" }}>
          {WEEK_DATA.map((d, i) => {
            const h = Math.max((d.extra / maxDayExtra) * 58, 4);
            const isCritical = d.day === criticalDay.day;
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                <div style={{ width: "100%", maxWidth: 22, height: h, borderRadius: 2, backgroundColor: isCritical ? C.rust : C.brass, opacity: isCritical ? 1 : 0.75 }} />
                <span style={{ fontSize: 10, color: isCritical ? C.rust : C.textFaint, fontFamily: MONO_FONT, fontWeight: isCritical ? 700 : 400 }}>{d.day}</span>
                <span style={{ fontSize: 9, color: C.textFaint, fontFamily: MONO_FONT, opacity: 0.8 }}>{d.extra.toFixed(0)}€</span>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 10, padding: "10px 12px", backgroundColor: "rgba(225,74,46,0.08)", border: `1px solid ${C.rust}`, borderRadius: 4 }}>
          <TrendingDown size={14} color={C.rust} style={{ marginTop: 2, flexShrink: 0, transform: "rotate(180deg)" }} />
          <div style={{ fontSize: 12, color: C.paper }}>
            Il <strong>{criticalDay.day}</strong> spendi in media <strong>{criticalMultiplier.toFixed(1)}×</strong> di più rispetto agli altri giorni.
          </div>
        </div>
      </div>

      <div style={{ padding: "0 20px", marginTop: 20 }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.textDim, fontFamily: MONO_FONT, marginBottom: 10 }}>Dove va il tuo tempo</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {categoryList.map((c, i) => {
            const Icon = CAT_ICON_MAP[c.cat] || MoreHorizontal;
            return (
              <div key={c.cat} style={{ backgroundColor: C.panel, border: `1px solid ${i === 0 ? C.brass : C.panelBorder}`, borderRadius: 4, padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <Icon size={15} color={i === 0 ? C.brass : C.textDim} />
                  <span style={{ color: C.paper, fontSize: 13, fontWeight: 600, flex: 1 }}>{c.cat}</span>
                  <span style={{ fontFamily: MONO_FONT, fontSize: 12, color: C.textFainter }}>{c.pct.toFixed(0)}%</span>
                  <span style={{ fontFamily: MONO_FONT, fontSize: 13, color: i === 0 ? C.brass : C.paper, minWidth: 44, textAlign: "right" }}>{c.hours.toFixed(1)}h</span>
                  <span style={{ fontFamily: MONO_FONT, fontSize: 11, color: C.textFaint, minWidth: 38, textAlign: "right" }}>{c.euro.toFixed(0)}€</span>
                </div>
                <div style={{ height: 4, backgroundColor: C.panelBorder, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${c.pct}%`, backgroundColor: i === 0 ? C.brass : C.fixedBar }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ padding: "0 20px", marginTop: 20 }}>
        <div style={{ backgroundColor: "rgba(255,107,74,0.08)", border: `1px solid ${C.brass}`, borderRadius: 4, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Lightbulb size={16} color={C.brass} />
            <span style={{ color: C.brass, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Suggerimento</span>
          </div>
          <p style={{ fontSize: 13, color: C.paper, margin: 0, lineHeight: 1.5 }}>
            Dimezzando "<strong>{topCat.cat}</strong>" risparmi circa <strong>{potentialSavingHours.toFixed(1)}h</strong> a settimana
            {goalDaysGained ? (
              <> — il tuo obiettivo arriverebbe <strong>{goalDaysGained} giorni prima</strong>.</>
            ) : (
              <>.</>
            )}
          </p>
        </div>
      </div>

      <div style={{ padding: "0 20px", marginTop: 20 }}>
        <button
          onClick={onOpenClosure}
          style={{ width: "100%", padding: "14px 0", borderRadius: 4, border: "none", backgroundColor: C.brass, color: C.ink, fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}
        >
          {PERIOD_CTA[period]} <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

function ClosureScreen({ hourly, profile, onBack, onAllocate, onCarryOver }) {
  const period = profile.closurePeriod;
  const { pool, periodSaved, carryOver } = computeClosurePool(profile, hourly);

  const GOAL_ICON_INFO = "Per rispettare la tabella di marcia di questo obiettivo, questo è quanto dovresti versare in questo periodo.";

  const [allocations, setAllocations] = useState(() => {
    const initial = {};
    profile.goals.forEach((g) => {
      if (g.mesi) initial[g.id] = Math.max(Math.round(periodRecommended(g, period)), 0);
    });
    return initial;
  });
  const [confirmed, setConfirmed] = useState(false);
  const [infoOpenId, setInfoOpenId] = useState(null);

  const allocatedTotal = Object.values(allocations).reduce((s, v) => s + (Number(v) || 0), 0);
  const remaining = pool - allocatedTotal;

  const confirmAllocations = () => {
    if (allocatedTotal <= 0 || remaining < 0) return;
    playJackpotSound();
    profile.goals.forEach((g) => {
      const amt = Number(allocations[g.id]) || 0;
      if (amt > 0) onAllocate(g.id, amt);
    });
    onCarryOver(Math.max(remaining, 0)); // ciò che non allochi resta disponibile per il periodo successivo
    setConfirmed(true);
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 96 }}>
      <ScreenHeader eyebrow={`Chiusura ${period}`} title={PERIOD_CTA[period]} />

      <div style={{ padding: "0 20px" }}>
        {!confirmed ? (
          <>
            <PunchTicket style={{ borderRadius: 4, padding: 16, border: "1px solid #E2DAC5", marginBottom: 14 }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.textDim, fontFamily: MONO_FONT, marginBottom: 6 }}>Disponibile da distribuire</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <div style={{ fontFamily: MONO_FONT, fontSize: 32, fontWeight: 800 }}>{pool}€</div>
                <div style={{ fontFamily: MONO_FONT, fontSize: 13, color: C.textFaint }}>{euroToTime(pool, hourly)}</div>
              </div>
              <div style={{ fontSize: 11.5, color: C.textFaint, marginTop: 6, lineHeight: 1.4 }}>
                {periodSaved < 0 && carryOver === 0
                  ? "Gli extra hanno superato il margine libero di questo periodo: niente da distribuire, va bene così."
                  : `${Math.max(periodSaved, 0)}€ risparmiati in questo periodo${carryOver > 0 ? ` + ${carryOver}€ rimasti dal periodo precedente` : ""}. Decidi tu dove metterli — anche solo in parte.`}
              </div>
            </PunchTicket>

            {pool > 0 ? (
              <>
                <div style={{ fontSize: 11, color: C.textFainter, marginBottom: 10 }}>Distribuiscilo tra i tuoi obiettivi:</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                  {profile.goals.map((g) => (
                    <div key={g.id} style={{ backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px", position: "relative" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <PiggyBank size={16} color={C.brass} style={{ flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ color: C.paper, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.nome}</span>
                            {g.mesi ? (
                              <button
                                onClick={() => setInfoOpenId(infoOpenId === g.id ? null : g.id)}
                                style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 0, flexShrink: 0 }}
                              >
                                <Info size={13} color={C.textFaint} />
                              </button>
                            ) : (
                              <span style={{ fontSize: 9, fontFamily: MONO_FONT, color: C.textFaint, border: `1px solid ${C.panelBorder}`, borderRadius: 999, padding: "1px 7px", flexShrink: 0 }}>libero</span>
                            )}
                          </div>
                          {g.mesi ? (
                            <div style={{ fontSize: 10.5, color: C.textFaint, fontFamily: MONO_FONT }}>consigliato {Math.round(periodRecommended(g, period))}€ {PERIOD_LABELS[period]}</div>
                          ) : null}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                          <input
                            type="number"
                            value={allocations[g.id] ?? ""}
                            placeholder="0"
                            onChange={(e) => setAllocations({ ...allocations, [g.id]: e.target.value })}
                            style={{ width: 60, backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "6px 8px", color: C.paper, fontFamily: MONO_FONT, fontSize: 13, textAlign: "right", outline: "none" }}
                          />
                          <span style={{ color: C.textFaint, fontSize: 13, fontFamily: MONO_FONT }}>€</span>
                        </div>
                      </div>

                      {infoOpenId === g.id && g.mesi ? (
                        <div style={{ marginTop: 10, padding: "10px 12px", backgroundColor: C.inputBg, border: `1px solid ${C.brass}`, borderRadius: 4 }}>
                          <p style={{ fontSize: 12, color: C.paper, margin: 0, lineHeight: 1.5 }}>
                            {GOAL_ICON_INFO} Per "{g.nome}" ({g.importo.toFixed(0)}€ in {g.mesi} mesi) servono circa <strong>{Math.round(periodRecommended(g, period))}€ {PERIOD_LABELS[period]}</strong> per restare in linea con la scadenza.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, fontSize: 12, fontFamily: MONO_FONT }}>
                  <span style={{ color: C.textFainter }}>Previsti per gli obiettivi {allocatedTotal}€ di {pool}€</span>
                  <span style={{ color: remaining < 0 ? C.rust : C.textFainter }}>{remaining < 0 ? `${Math.abs(remaining)}€ oltre il disponibile` : `${remaining}€ ancora liberi`}</span>
                </div>

                {allocatedTotal > 0 ? (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10.5, color: C.textFaint, marginBottom: 6 }}>Sposta {allocatedTotal}€ sul tuo conto deposito, poi torna qui e conferma:</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <a
                        href={`https://paypal.me/tuonomeutente/${allocatedTotal}EUR`}
                        target="_blank" rel="noopener noreferrer"
                        style={{
                          flex: 1, padding: "10px 0", borderRadius: 4, border: `1px solid ${C.panelBorder}`, backgroundColor: C.inputBg,
                          color: C.paper, fontSize: 12.5, fontWeight: 600, textAlign: "center", textDecoration: "none",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        }}
                      >
                        <ExternalLink size={13} color={C.textDim} /> PayPal
                      </a>
                      <a
                        href={`https://www.satispay.com/app/pay?amount=${allocatedTotal}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{
                          flex: 1, padding: "10px 0", borderRadius: 4, border: `1px solid ${C.panelBorder}`, backgroundColor: C.inputBg,
                          color: C.paper, fontSize: 12.5, fontWeight: 600, textAlign: "center", textDecoration: "none",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        }}
                      >
                        <ExternalLink size={13} color={C.textDim} /> Satispay
                      </a>
                    </div>
                    <div style={{ fontSize: 10, color: C.textFaint, marginTop: 6, fontStyle: "italic" }}>
                      Demo: link segnaposto con importo precompilato — nella versione reale andrebbe collegato al tuo account.
                    </div>
                  </div>
                ) : null}

                <button
                  onClick={confirmAllocations}
                  disabled={allocatedTotal === 0 || remaining < 0}
                  style={{
                    width: "100%", padding: "12px 0", borderRadius: 4, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer",
                    backgroundColor: allocatedTotal > 0 && remaining >= 0 ? C.brass : "#DED7C4",
                    color: allocatedTotal > 0 && remaining >= 0 ? C.ink : C.textFaint,
                  }}
                >
                  Congela allocazione
                </button>
              </>
            ) : null}
          </>
        ) : (
          <div style={{ backgroundColor: "rgba(124,179,66,0.1)", border: `1px solid ${C.green}`, borderRadius: 4, padding: 16, display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ fontSize: 18, color: C.green, lineHeight: 1 }}>✓</span>
            <div style={{ fontSize: 13, color: C.paper, lineHeight: 1.6 }}>
              <strong>{allocatedTotal}€ congelati</strong> così:
              {profile.goals.filter((g) => Number(allocations[g.id]) > 0).map((g) => (
                <div key={g.id} style={{ fontFamily: MONO_FONT, fontSize: 12, color: C.textFainter, marginTop: 2 }}>• {g.nome}: {allocations[g.id]}€</div>
              ))}
              {pool - allocatedTotal > 0 ? (
                <div style={{ marginTop: 6, fontSize: 12, color: C.textFainter }}>
                  + <strong>{pool - allocatedTotal}€</strong> ancora liberi: si aggiungono al prossimo periodo
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProgettiScreen({ progetti, setProgetti, hourlyBaseline, onBack }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ nome: "", prezzoVendita: "", ore: "" });

  const addProgetto = () => {
    if (!form.nome || !form.prezzoVendita || !form.ore) return;
    setProgetti([...progetti, { id: Date.now(), nome: form.nome, prezzoVendita: Number(form.prezzoVendita), ore: Number(form.ore) }]);
    setForm({ nome: "", prezzoVendita: "", ore: "" });
    setShowAdd(false);
  };
  const remove = (id) => setProgetti(progetti.filter((p) => p.id !== id));

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, backgroundColor: C.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 20px 4px 20px", display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}><ChevronLeft size={20} color={C.textDim} /></button>
        <span style={{ fontWeight: 700, fontSize: 16, color: C.paper, fontFamily: DISPLAY_FONT }}>I miei progetti</span>
      </div>
      <p style={{ padding: "8px 20px 16px 20px", fontSize: 12, color: C.textFaint, lineHeight: 1.5, margin: 0 }}>
        Per ogni progetto, prezzo di vendita diviso le ore che ci impieghi ti dice la tua tariffa oraria reale su quel lavoro — utile per capire se un preventivo regge o se stai lavorando sotto costo.
      </p>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 20px" }}>
        {progetti.length === 0 && !showAdd && (
          <div style={{ color: C.textFaint, fontSize: 13, fontStyle: "italic", padding: "24px 0", textAlign: "center", border: `1px dashed ${C.panelBorder}`, borderRadius: 4 }}>
            Nessun progetto ancora — tocca "+" per aggiungerne uno
          </div>
        )}
        {progetti.map((p) => {
          const rate = p.ore > 0 ? p.prezzoVendita / p.ore : 0;
          const belowBaseline = hourlyBaseline && rate < hourlyBaseline;
          return (
            <div key={p.id} style={{ backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 6, padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: C.paper }}>{p.nome}</span>
                <button onClick={() => remove(p.id)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={14} color={C.textDim} /></button>
              </div>
              <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 8, fontFamily: MONO_FONT }}>{p.prezzoVendita.toFixed(0)}€ · {p.ore}h</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, backgroundColor: belowBaseline ? "rgba(225,74,46,0.1)" : "rgba(124,179,66,0.1)", border: `1px solid ${belowBaseline ? C.rust : C.green}`, borderRadius: 6, padding: "8px 10px" }}>
                {belowBaseline ? <TriangleAlert size={13} color={C.rust} /> : <TrendingUp size={13} color={C.green} />}
                <span style={{ fontSize: 12, fontWeight: 700, color: belowBaseline ? C.rust : C.green }}>{rate.toFixed(2)}€/h</span>
                {hourlyBaseline ? <span style={{ fontSize: 10.5, color: C.textFaint }}>{belowBaseline ? "sotto la tua tariffa base" : "sopra la tua tariffa base"}</span> : null}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ padding: 20 }}>
        {showAdd ? (
          <div style={{ backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 8, padding: 16 }}>
            <FieldLabel>Nome progetto</FieldLabel>
            <input type="text" value={form.nome} placeholder="es. Sito web cliente X" onChange={(e) => setForm({ ...form, nome: e.target.value })}
              style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px", color: C.paper, fontSize: 14, marginTop: 4, marginBottom: 12, outline: "none" }} />
            <FieldLabel>Prezzo di vendita €</FieldLabel>
            <input type="number" value={form.prezzoVendita} placeholder="800" onChange={(e) => setForm({ ...form, prezzoVendita: e.target.value })}
              style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px", color: C.paper, fontSize: 14, marginTop: 4, marginBottom: 12, outline: "none" }} />
            <FieldLabel>Ore impiegate (stimate o effettive)</FieldLabel>
            <input type="number" value={form.ore} placeholder="20" onChange={(e) => setForm({ ...form, ore: e.target.value })}
              style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px", color: C.paper, fontSize: 14, marginTop: 4, marginBottom: 16, outline: "none" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: "10px 0", borderRadius: 6, border: `1px solid ${C.panelBorder}`, background: "none", color: C.textDim, fontSize: 13, cursor: "pointer" }}>Annulla</button>
              <button onClick={addProgetto} style={{ flex: 1, padding: "10px 0", borderRadius: 6, border: "none", backgroundColor: C.brass, color: "#FFFFFF", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Aggiungi</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAdd(true)} style={{ width: "100%", padding: "13px 0", borderRadius: 6, border: "none", backgroundColor: C.brass, color: "#FFFFFF", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}>
            <Plus size={16} /> Nuovo progetto
          </button>
        )}
      </div>
    </div>
  );
}

function ImportPDFScreen({ calendario, setCalendario, onBack }) {
  const [status, setStatus] = useState("idle"); // idle | loading | parsed | error
  const [parsedTx, setParsedTx] = useState([]);
  const [showChecklist, setShowChecklist] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [result, setResult] = useState(null);

  const handleFile = async (file) => {
    setStatus("loading");
    setErrorMsg(null);
    try {
      const text = await extractTextFromPDF(file);
      const found = parseTransactionLines(text);
      if (found.length === 0) {
        setErrorMsg("Non sono riuscito a riconoscere movimenti in questo file. Probabilmente il tuo estratto conto ha ogni transazione spezzata su più righe, un formato che questo strumento non riesce a leggere. Se la tua banca offre l'export CSV, è molto più affidabile — te lo consiglio.");
        setStatus("error");
        return;
      }
      setParsedTx(
        found.map((f, i) => {
          let amt = parseItalianNumber(f.amountRaw);
          if (f.dareAvere === "dare") amt = -Math.abs(amt);
          if (f.dareAvere === "avere") amt = Math.abs(amt);
          return { id: i, date: parseFlexibleDate(f.dateRaw), desc: f.desc, amount: amt, include: true };
        }).filter((t) => t.date)
      );
      setStatus("parsed");
    } catch (err) {
      setErrorMsg("Non sono riuscito a leggere questo PDF. Se è una scansione o una foto (non testo vero), questo strumento non può recuperarlo. Prova con il CSV, se la tua banca lo offre.");
      setStatus("error");
    }
  };

  const toggleInclude = (id) => setParsedTx(parsedTx.map((t) => (t.id === id ? { ...t, include: !t.include } : t)));

  const doImport = () => {
    const newCal = { ...calendario };
    let entrate = 0, uscite = 0, count = 0;
    parsedTx.filter((t) => t.include).forEach((t) => {
      const k = dateKey(t.date);
      const tipo = t.amount < 0 ? "uscita" : "entrata";
      const entry = { id: Date.now() + Math.random(), tipo, stato: "consuntivo", importo: Math.abs(t.amount), descrizione: t.desc };
      newCal[k] = [...(newCal[k] || []), entry];
      if (tipo === "entrata") entrate += entry.importo; else uscite += entry.importo;
      count++;
    });
    setCalendario(newCal);
    setResult({ entrate, uscite, count });
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, backgroundColor: C.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 20px 4px 20px", display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}><ChevronLeft size={20} color={C.textDim} /></button>
        <span style={{ fontWeight: 700, fontSize: 16, color: C.paper, fontFamily: DISPLAY_FONT }}>Importa da PDF</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 32px 20px" }}>
        {status !== "parsed" && !result && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, backgroundColor: "rgba(255,107,74,0.1)", border: `1px solid ${C.brass}`, borderRadius: 8, padding: "10px 12px", marginBottom: 16 }}>
            <Info size={13} color={C.brassDim} style={{ marginTop: 1, flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, color: C.paper, lineHeight: 1.5 }}>
              Funziona con PDF che contengono testo vero, anche con le transazioni spezzate su più righe. L'unico caso che non può leggere è una scansione o una foto (senza testo selezionabile).
            </span>
          </div>
        )}

        {status === "idle" && (
          <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, border: `1px dashed ${C.panelBorder}`, borderRadius: 8, padding: "32px 16px", cursor: "pointer", backgroundColor: C.panel }}>
            <Receipt size={22} color={C.brass} />
            <span style={{ fontSize: 13, color: C.paper, fontWeight: 600 }}>Scegli il file PDF</span>
            <span style={{ fontSize: 11, color: C.textFaint, textAlign: "center" }}>L'estratto conto scaricato dalla tua banca</span>
            <input type="file" accept=".pdf,application/pdf" style={{ display: "none" }} onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])} />
          </label>
        )}

        {status === "loading" && (
          <div style={{ textAlign: "center", padding: "40px 0", color: C.textFaint, fontSize: 13 }}>Leggo il PDF...</div>
        )}

        {status === "error" && (
          <>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, backgroundColor: "rgba(225,74,46,0.1)", border: `1px solid ${C.rust}`, borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
              <TriangleAlert size={14} color={C.rust} style={{ marginTop: 1, flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, color: C.paper, lineHeight: 1.5 }}>{errorMsg}</span>
            </div>
            <button onClick={() => setStatus("idle")} style={{ width: "100%", padding: "12px 0", borderRadius: 6, border: `1px solid ${C.panelBorder}`, background: "none", color: C.textDim, fontSize: 13, cursor: "pointer" }}>
              Riprova con un altro file
            </button>
          </>
        )}

        {status === "parsed" && !result && !showChecklist && (
          <>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, backgroundColor: "rgba(255,107,74,0.14)", border: `1px solid ${C.brass}`, borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
              <TriangleAlert size={15} color={C.brassDim} style={{ marginTop: 1, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13, color: C.paper, fontWeight: 700, marginBottom: 3 }}>Trovati {parsedTx.length} movimenti — controlla prima di fidarti</div>
                <div style={{ fontSize: 11.5, color: C.textFaint, lineHeight: 1.45 }}>Il PDF può comunque avere sorprese rispetto a un CSV — descrizioni o simboli letti male sono possibili. Dai un'occhiata all'anteprima sotto prima di importare.</div>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ overflowX: "auto", border: `1px solid ${C.panelBorder}`, borderRadius: 6 }}>
                <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${C.panelBorder}`, color: C.brass }}>Data</th>
                      <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${C.panelBorder}`, color: C.brass }}>Descrizione</th>
                      <th style={{ textAlign: "right", padding: "6px 8px", borderBottom: `1px solid ${C.panelBorder}`, color: C.brass }}>Importo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedTx.slice(0, 4).map((t) => (
                      <tr key={t.id}>
                        <td style={{ padding: "6px 8px", color: C.textDim, whiteSpace: "nowrap" }}>{t.date.toLocaleDateString("it-IT")}</td>
                        <td style={{ padding: "6px 8px", color: C.textDim, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.desc || "—"}</td>
                        <td style={{ padding: "6px 8px", color: t.amount < 0 ? C.rust : C.green, whiteSpace: "nowrap", textAlign: "right", fontWeight: 700 }}>{t.amount < 0 ? "-" : "+"}{Math.abs(t.amount).toFixed(2)}€</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <button onClick={doImport} style={{ width: "100%", padding: "13px 0", borderRadius: 6, border: "none", backgroundColor: C.brass, color: "#FFFFFF", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              Importa {parsedTx.length} movimenti
            </button>
            <button onClick={() => setShowChecklist(true)} style={{ width: "100%", padding: "10px 0", background: "none", border: "none", color: C.textDim, fontSize: 12, marginTop: 10, cursor: "pointer" }}>
              Controlla e correggi uno per uno
            </button>
            <button onClick={() => { setStatus("idle"); setParsedTx([]); }} style={{ width: "100%", padding: "6px 0", background: "none", border: "none", color: C.textFainter, fontSize: 11.5, cursor: "pointer" }}>Scegli un altro file</button>
          </>
        )}

        {status === "parsed" && !result && showChecklist && (
          <>
            <p style={{ fontSize: 12.5, color: C.textFaint, marginBottom: 12 }}>
              Togli la spunta a quelli sbagliati o duplicati, poi importa.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
              {parsedTx.map((t) => (
                <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 6, padding: "8px 10px", cursor: "pointer", opacity: t.include ? 1 : 0.4 }}>
                  <input type="checkbox" checked={t.include} onChange={() => toggleInclude(t.id)} style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, color: C.paper, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.desc || "(senza descrizione)"}</div>
                    <div style={{ fontSize: 10, color: C.textFaint, fontFamily: MONO_FONT }}>{t.date.toLocaleDateString("it-IT")}</div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, fontFamily: MONO_FONT, color: t.amount < 0 ? C.rust : C.green, flexShrink: 0 }}>
                    {t.amount < 0 ? "-" : "+"}{Math.abs(t.amount).toFixed(2)}€
                  </span>
                </label>
              ))}
            </div>
            <button onClick={doImport} style={{ width: "100%", padding: "13px 0", borderRadius: 6, border: "none", backgroundColor: C.brass, color: "#FFFFFF", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              Importa {parsedTx.filter((t) => t.include).length} movimenti
            </button>
            <button onClick={() => { setStatus("idle"); setParsedTx([]); setShowChecklist(false); }} style={{ width: "100%", padding: "10px 0", background: "none", border: "none", color: C.textDim, fontSize: 12, marginTop: 10, cursor: "pointer" }}>Scegli un altro file</button>
          </>
        )}

        {result && (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", backgroundColor: "rgba(124,179,66,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px auto" }}>
              <TrendingUp size={26} color={C.green} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.paper, marginBottom: 6 }}>{result.count} movimenti importati</div>
            <div style={{ fontSize: 12, color: C.textFaint, marginBottom: 20 }}>Entrate {result.entrate.toFixed(0)}€ · Uscite {result.uscite.toFixed(0)}€</div>
            <button onClick={onBack} style={{ padding: "12px 24px", borderRadius: 6, border: "none", backgroundColor: C.brass, color: "#FFFFFF", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              Vai al calendario
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ImportEstrattoContoScreen({ calendario, setCalendario, onBack }) {
  const [parsed, setParsed] = useState(null); // { header, rows }
  const [colData, setColData] = useState(-1);
  const [colDesc, setColDesc] = useState(-1);
  const [colImporto, setColImporto] = useState(-1);
  const [autoDetected, setAutoDetected] = useState(false); // true = non serve chiedere nulla, si può importare subito
  const [showManual, setShowManual] = useState(false); // l'utente vuole comunque controllare/correggere
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFile = async (file) => {
    setError(null);
    const isExcel = /\.xlsx?$/i.test(file.name);
    try {
      let header, dataRows;
      if (isExcel) {
        const XLSX = await import("xlsx");
        const buf = await file.arrayBuffer();
        // cellDates:true fa restituire vere date JS invece di numeri seriali o testo
        // formattato in modo ambiguo — evita alla radice l'incertezza sull'ordine giorno/mese.
        const wb = XLSX.read(buf, { type: "array", cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
        if (allRows.length < 2) { setError("Il foglio sembra vuoto."); return; }
        // molti estratti conto hanno righe di riepilogo prima della vera intestazione
        const dataStart = findDataStartRow(allRows, (v) => v instanceof Date);
        if (dataStart < 0) { setError("Non trovo colonne con date in questo file."); return; }
        const looksLikeHeader = dataStart > 0 && allRows[dataStart - 1].some((c) => typeof c === "string" && c.trim());
        header = looksLikeHeader ? allRows[dataStart - 1].map((c) => String(c)) : allRows[dataStart].map((_, i) => `Colonna ${i + 1}`);
        dataRows = allRows.slice(dataStart).filter((r) => r.some((c) => c !== "" && c !== null));
      } else {
        const text = await file.text();
        const { rows } = parseCSV(text);
        if (rows.length < 2) { setError("Il file sembra vuoto o non è un CSV valido."); return; }
        const dataStart = findDataStartRow(rows, isDateLike);
        if (dataStart < 0) { setError("Non trovo colonne con date in questo file."); return; }
        const looksLikeHeader = dataStart > 0 && rows[dataStart - 1].some((c) => c && c.trim() && !isDateLike(c));
        header = looksLikeHeader ? rows[dataStart - 1] : rows[dataStart].map((_, i) => `Colonna ${i + 1}`);
        dataRows = rows.slice(dataStart).filter((r) => r.length > 1 || (r[0] && r[0].trim()));
      }
      setParsed({ header, rows: dataRows });

      // Primo tentativo: nome della colonna (se l'intestazione è vera). Altrimenti guarda i dati.
      const findCol = (patterns) => header.findIndex((h) => patterns.some((p) => (h || "").toLowerCase().includes(p)));
      let cData = findCol(["data", "date"]);
      let cDesc = findCol(["descrizione", "causale", "description", "dettagli", "operazione", "beneficiario"]);
      let cImporto = findCol(["importo", "amount", "valore", "dare", "avere"]);
      if (isExcel) {
        // su Excel i tipi sono affidabili: usiamoli invece delle regex su stringhe
        if (cData < 0) cData = detectColumnByContent(dataRows, (v) => v instanceof Date);
        if (cImporto < 0) cImporto = detectColumnByContent(dataRows, (v) => typeof v === "number" && (v < 0 || !Number.isInteger(v)), cData);
        if (cDesc < 0) {
          // tra le colonne testuali rimaste, prendo quella con il testo mediamente più lungo
          let bestLen = 0;
          header.forEach((_, i) => {
            if (i === cData || i === cImporto) return;
            const avgLen = dataRows.slice(0, 8).reduce((s, r) => s + String(r[i] || "").length, 0) / Math.max(dataRows.length, 1);
            if (avgLen > bestLen) { bestLen = avgLen; cDesc = i; }
          });
        }
      } else {
        if (cData < 0) cData = detectColumnByContent(dataRows, isDateLike);
        if (cImporto < 0) cImporto = detectColumnByContent(dataRows, isAmountLike, cData);
      }

      setColData(cData);
      setColDesc(cDesc);
      setColImporto(cImporto);
      setResult(null);
      setShowManual(false);
      // "automatico" solo se abbiamo trovato con certezza sia la data che l'importo
      setAutoDetected(cData >= 0 && cImporto >= 0);
    } catch (err) {
      setError(isExcel ? "Non sono riuscito a leggere il file Excel. Assicurati che sia un .xlsx o .xls valido." : "Non sono riuscito a leggere il file. Assicurati che sia un CSV.");
    }
  };

  const doImport = () => {
    if (!parsed || colData < 0 || colImporto < 0) return;
    const newCal = { ...calendario };
    let entrate = 0, uscite = 0, count = 0;
    parsed.rows.forEach((row) => {
      const rawData = row[colData];
      const rawImporto = row[colImporto];
      const d = rawData instanceof Date ? rawData : parseFlexibleDate(rawData);
      const importoRaw = typeof rawImporto === "number" ? rawImporto : parseItalianNumber(rawImporto);
      if (!d || !importoRaw) return;
      const k = dateKey(d);
      const tipo = importoRaw < 0 ? "uscita" : "entrata";
      const entry = { id: Date.now() + Math.random(), tipo, stato: "consuntivo", importo: Math.abs(importoRaw), descrizione: colDesc >= 0 ? String(row[colDesc] || "") : "" };
      newCal[k] = [...(newCal[k] || []), entry];
      if (tipo === "entrata") entrate += entry.importo; else uscite += entry.importo;
      count++;
    });
    setCalendario(newCal);
    setResult({ entrate, uscite, count });
  };
  const fmtCell = (v) => {
    if (v instanceof Date) return v.toLocaleDateString("it-IT");
    if (typeof v === "number") return v.toFixed(2);
    return String(v ?? "");
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, backgroundColor: C.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 20px 4px 20px", display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}><ChevronLeft size={20} color={C.textDim} /></button>
        <span style={{ fontWeight: 700, fontSize: 16, color: C.paper, fontFamily: DISPLAY_FONT }}>Importa estratto conto</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 32px 20px" }}>
        <p style={{ fontSize: 12, color: C.textFaint, lineHeight: 1.5, marginBottom: 16 }}>
          Carica il file CSV o Excel dei movimenti (lo trovi di solito nella sezione "estratto conto" o "movimenti" della tua app bancaria, come esportazione). Ogni banca lo formatta un po' diversamente: prima di importare potrai controllare che le colonne siano lette bene.
        </p>

        {error && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, backgroundColor: "rgba(225,74,46,0.1)", border: `1px solid ${C.rust}`, borderRadius: 6, padding: "10px 12px", marginBottom: 16 }}>
            <TriangleAlert size={14} color={C.rust} />
            <span style={{ fontSize: 12, color: C.paper }}>{error}</span>
          </div>
        )}

        {!parsed && (
          <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, border: `1px dashed ${C.panelBorder}`, borderRadius: 8, padding: "32px 16px", cursor: "pointer", backgroundColor: C.panel }}>
            <Receipt size={22} color={C.brass} />
            <span style={{ fontSize: 13, color: C.paper, fontWeight: 600 }}>Scegli il file CSV o Excel</span>
            <span style={{ fontSize: 11, color: C.textFaint, textAlign: "center" }}>Formato .csv, .xlsx o .xls esportato dalla tua banca</span>
            <input type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style={{ display: "none" }} onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])} />
          </label>
        )}

        {parsed && !result && autoDetected && !showManual && (
          <>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, backgroundColor: "rgba(124,179,66,0.1)", border: `1px solid ${C.green}`, borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
              <TrendingUp size={15} color={C.green} style={{ marginTop: 1, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13, color: C.paper, fontWeight: 700, marginBottom: 2 }}>Riconosciuto automaticamente</div>
                <div style={{ fontSize: 11.5, color: C.textFaint, lineHeight: 1.4 }}>Trovati {parsed.rows.length} movimenti, pronti da importare.</div>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ overflowX: "auto", border: `1px solid ${C.panelBorder}`, borderRadius: 6 }}>
                <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${C.panelBorder}`, color: C.brass }}>Data</th>
                      <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${C.panelBorder}`, color: colDesc >= 0 ? C.brass : C.textFainter }}>Descrizione</th>
                      <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${C.panelBorder}`, color: C.brass }}>Importo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 4).map((row, ri) => (
                      <tr key={ri}>
                        <td style={{ padding: "6px 8px", color: C.textDim, whiteSpace: "nowrap" }}>{fmtCell(row[colData])}</td>
                        <td style={{ padding: "6px 8px", color: C.textDim, whiteSpace: "nowrap", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{colDesc >= 0 ? fmtCell(row[colDesc]) : "—"}</td>
                        <td style={{ padding: "6px 8px", color: C.textDim, whiteSpace: "nowrap" }}>{fmtCell(row[colImporto])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <button
              onClick={doImport}
              style={{ width: "100%", padding: "13px 0", borderRadius: 6, border: "none", backgroundColor: C.brass, color: "#FFFFFF", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
            >
              Importa {parsed.rows.length} movimenti
            </button>
            <button onClick={() => setShowManual(true)} style={{ width: "100%", padding: "10px 0", background: "none", border: "none", color: C.textDim, fontSize: 12, marginTop: 10, cursor: "pointer" }}>
              Qualcosa non torna? Controlla le colonne a mano
            </button>
            <button onClick={() => { setParsed(null); setError(null); }} style={{ width: "100%", padding: "6px 0", background: "none", border: "none", color: C.textFainter, fontSize: 11.5, cursor: "pointer" }}>Scegli un altro file</button>
          </>
        )}

        {parsed && !result && (!autoDetected || showManual) && (
          <>
            {!autoDetected && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, backgroundColor: "rgba(255,107,74,0.1)", border: `1px solid ${C.brass}`, borderRadius: 8, padding: "10px 12px", marginBottom: 16 }}>
                <Info size={13} color={C.brassDim} style={{ marginTop: 1, flexShrink: 0 }} />
                <span style={{ fontSize: 11.5, color: C.paper, lineHeight: 1.5 }}>Non sono riuscito a capire da solo quali colonne usare — scegli tu qui sotto.</span>
              </div>
            )}
            <div style={{ marginBottom: 16 }}>
              <FieldLabel>Colonna data</FieldLabel>
              <select value={colData} onChange={(e) => setColData(Number(e.target.value))}
                style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px", color: C.paper, fontSize: 14, marginTop: 4, outline: "none" }}>
                <option value={-1}>— seleziona —</option>
                {parsed.header.map((h, i) => <option key={i} value={i}>{h || `Colonna ${i + 1}`}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <FieldLabel>Colonna importo</FieldLabel>
              <select value={colImporto} onChange={(e) => setColImporto(Number(e.target.value))}
                style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px", color: C.paper, fontSize: 14, marginTop: 4, outline: "none" }}>
                <option value={-1}>— seleziona —</option>
                {parsed.header.map((h, i) => <option key={i} value={i}>{h || `Colonna ${i + 1}`}</option>)}
              </select>
              <p style={{ fontSize: 11, color: C.textFainter, marginTop: 4, lineHeight: 1.4 }}>Se il tuo estratto conto usa numeri negativi per le uscite, l'app li smista da sola in entrate/uscite.</p>
            </div>
            <div style={{ marginBottom: 20 }}>
              <FieldLabel>Colonna descrizione (opzionale)</FieldLabel>
              <select value={colDesc} onChange={(e) => setColDesc(Number(e.target.value))}
                style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px", color: C.paper, fontSize: 14, marginTop: 4, outline: "none" }}>
                <option value={-1}>— nessuna —</option>
                {parsed.header.map((h, i) => <option key={i} value={i}>{h || `Colonna ${i + 1}`}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 20 }}>
              <FieldLabel>Anteprima (prime righe)</FieldLabel>
              <div style={{ overflowX: "auto", marginTop: 6, border: `1px solid ${C.panelBorder}`, borderRadius: 6 }}>
                <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
                  <thead>
                    <tr>
                      {parsed.header.map((h, i) => (
                        <th key={i} style={{ textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${C.panelBorder}`, color: i === colData || i === colImporto || i === colDesc ? C.brass : C.textFaint, whiteSpace: "nowrap" }}>{h || `Col.${i + 1}`}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 4).map((row, ri) => (
                      <tr key={ri}>
                        {row.map((c, ci) => <td key={ci} style={{ padding: "6px 8px", color: C.textDim, whiteSpace: "nowrap" }}>{fmtCell(c)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <button
              onClick={doImport}
              disabled={colData < 0 || colImporto < 0}
              style={{ width: "100%", padding: "13px 0", borderRadius: 6, border: "none", backgroundColor: colData >= 0 && colImporto >= 0 ? C.brass : C.panelBorder, color: colData >= 0 && colImporto >= 0 ? "#FFFFFF" : C.textFaint, fontWeight: 700, fontSize: 14, cursor: colData >= 0 && colImporto >= 0 ? "pointer" : "default" }}
            >
              Importa {parsed.rows.length} movimenti
            </button>
            <button onClick={() => { setParsed(null); setError(null); setShowManual(false); }} style={{ width: "100%", padding: "10px 0", background: "none", border: "none", color: C.textDim, fontSize: 12, marginTop: 10, cursor: "pointer" }}>Scegli un altro file</button>
          </>
        )}

        {result && (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", backgroundColor: "rgba(124,179,66,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px auto" }}>
              <TrendingUp size={26} color={C.green} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.paper, marginBottom: 6 }}>{result.count} movimenti importati</div>
            <div style={{ fontSize: 12, color: C.textFaint, marginBottom: 4 }}>Entrate {result.entrate.toFixed(0)}€ · Uscite {result.uscite.toFixed(0)}€</div>
            <p style={{ fontSize: 11.5, color: C.textFainter, lineHeight: 1.5, margin: "10px 0 20px 0" }}>Sono stati aggiunti al Calendario come voci già confermate — contribuiscono da subito alla tua tariffa oraria reale, se hai anche dei turni registrati.</p>
            <button onClick={onBack} style={{ padding: "12px 24px", borderRadius: 6, border: "none", backgroundColor: C.brass, color: "#FFFFFF", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              Vai al calendario
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CalendarioScreen({ calendario, setCalendario, hourlyEstimate, progetti, setProgetti, redditoTipo, fatture, setFatture, regimeFiscale }) {
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showProgetti, setShowProgetti] = useState(false);
  const [showLockedProgetti, setShowLockedProgetti] = useState(false);
  const [showAddRange, setShowAddRange] = useState(false);
  const [rangeForm, setRangeForm] = useState({ da: "", a: "", skipWeekend: true, oreAlGiorno: "8", tariffaImporto: "", tariffaUnita: "ora", lordoNetto: "netto", percentualeNettaManuale: "65", scadenzaPagamento: "", descrizione: "" });
  const [rangeResult, setRangeResult] = useState(null);
  const [showInfoLordoNetto, setShowInfoLordoNetto] = useState(false);
  const [form, setForm] = useState({ tipo: redditoTipo === "variabile" ? "turno" : "uscita", ore: "", importo: "", descrizione: "" });

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const cells = getMonthGrid(year, month);
  const today = todayKey();

  const monthEntries = [];
  cells.forEach((d) => {
    if (!d) return;
    (calendario[dateKey(d)] || []).forEach((e) => monthEntries.push(e));
  });
  const monthOre = monthEntries.filter((e) => e.tipo === "turno" && e.stato === "consuntivo").reduce((s, e) => s + (Number(e.ore) || 0), 0);
  const monthEntrate = monthEntries.filter((e) => e.tipo === "entrata" && e.stato === "consuntivo").reduce((s, e) => s + (Number(e.importo) || 0), 0);
  const monthUscite = monthEntries.filter((e) => e.tipo === "uscita" && e.stato === "consuntivo").reduce((s, e) => s + (Number(e.importo) || 0), 0);

  const real = computeRealRate(calendario);
  const selectedKey = selectedDay ? dateKey(selectedDay) : null;
  const selectedEntries = selectedKey ? (calendario[selectedKey] || []) : [];

  // Prossime uscite pianificate, su tutto lo storico (non solo il mese che si sta guardando)
  const prossimeUscite = Object.entries(calendario)
    .flatMap(([k, entries]) => (entries || []).filter((e) => e.tipo === "uscita" && e.stato === "pianificato").map((e) => ({ ...e, dateStr: k, date: new Date(k) })))
    .filter((e) => e.dateStr >= today)
    .sort((a, b) => a.dateStr.localeCompare(b.dateStr))
    .slice(0, 8);

  const scaricaPromemoria = (voce) => {
    const ics = generateICS([{ date: voce.date, title: `${voce.descrizione || "Spesa pianificata"} · ${voce.importo.toFixed(0)}€`, notes: "Promemoria da OreLibere" }]);
    downloadBlob(ics, `promemoria-${voce.dateStr}.ics`, "text/calendar;charset=utf-8;");
  };
  const scaricaTuttiPromemoria = () => {
    const events = prossimeUscite.map((e) => ({ date: e.date, title: `${e.descrizione || "Spesa pianificata"} · ${e.importo.toFixed(0)}€`, notes: "Promemoria da OreLibere" }));
    downloadBlob(generateICS(events), `promemoria-uscite-${todayKey()}.ics`, "text/calendar;charset=utf-8;");
  };

  // Costruisce l'elenco dei giorni lavorativi (esclude sab/dom se richiesto) tra due date
  const giorniLavorativiRange = (daStr, aStr, skipWeekend) => {
    if (!daStr || !aStr) return [];
    const start = new Date(daStr + "T00:00:00");
    const end = new Date(aStr + "T00:00:00");
    if (start > end) return [];
    const giorni = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const dow = cursor.getDay(); // 0 = domenica, 6 = sabato
      if (!(skipWeekend && (dow === 0 || dow === 6))) giorni.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return giorni;
  };
  const giorniAnteprima = giorniLavorativiRange(rangeForm.da, rangeForm.a, rangeForm.skipWeekend);
  // Se l'utente ha già configurato il Regime Fiscale, usiamo le sue aliquote vere per
  // convertire lordo→netto; altrimenti si affida a una percentuale di trattenute manuale.
  const percentualeNettaAuto = percentualeNettaDaRegimeFiscale(regimeFiscale);
  const percentualeNettaEffettiva = rangeForm.lordoNetto === "lordo"
    ? (percentualeNettaAuto !== null ? percentualeNettaAuto : Math.max(Math.min((Number(rangeForm.percentualeNettaManuale) || 0) / 100, 1), 0))
    : 1; // "netto": l'importo inserito è già quello che conta, nessuna conversione
  // Converte la tariffa (in qualunque unità scelta) nell'importo NETTO che spetta per UN giorno lavorativo
  const importoGiornaliero = (() => {
    const tariffa = Number(rangeForm.tariffaImporto) || 0;
    const oreGiorno = Number(rangeForm.oreAlGiorno) || 0;
    let lordo = 0;
    if (rangeForm.tariffaUnita === "ora") lordo = tariffa * oreGiorno;
    else if (rangeForm.tariffaUnita === "giorno") lordo = tariffa;
    else if (rangeForm.tariffaUnita === "settimana") lordo = tariffa / 5; // 5 giorni lavorativi a settimana
    else if (rangeForm.tariffaUnita === "mese") lordo = tariffa / 21.7; // media giorni lavorativi al mese
    else return 0; // "progetto": importo unico, non giornaliero — gestito a parte
    return lordo * percentualeNettaEffettiva;
  })();

  const submitRange = () => {
    const giorni = giorniLavorativiRange(rangeForm.da, rangeForm.a, rangeForm.skipWeekend);
    if (giorni.length === 0) return;
    const oreGiorno = Number(rangeForm.oreAlGiorno) || 0;
    const tariffa = Number(rangeForm.tariffaImporto) || 0;
    const isProgetto = rangeForm.tariffaUnita === "progetto";
    const giorniKey = giorni.map((d) => dateKey(d));

    // I turni (le ore lavorate) si registrano subito, giorno per giorno — indipendenti dal pagamento
    const newCal = { ...calendario };
    giorni.forEach((d, i) => {
      const k = dateKey(d);
      const stato = k <= today ? "consuntivo" : "pianificato";
      const entries = [...(newCal[k] || [])];
      if (oreGiorno > 0) {
        entries.push({ id: Date.now() + Math.random() + i, tipo: "turno", stato, ore: oreGiorno, descrizione: rangeForm.descrizione });
      }
      newCal[k] = entries;
    });
    setCalendario(newCal);

    // Il pagamento invece NON si registra subito come entrata: diventa una Fattura "in attesa"
    // (stima, arancione) finché non la segni come pagata (verde) — con giorni collegati per
    // colorare la griglia, e una scadenza per il promemoria.
    const importoTotale = isProgetto ? tariffa * percentualeNettaEffettiva : importoGiornaliero * giorni.length;
    if (importoTotale > 0) {
      const nuovaFattura = {
        id: Date.now() + Math.random(),
        descrizione: rangeForm.descrizione || "Compenso periodo",
        importo: importoTotale,
        scadenza: rangeForm.scadenzaPagamento || dateKey(giorni[giorni.length - 1]),
        stato: "attesa",
        giorni: giorniKey,
        dataPagamento: null,
      };
      setFatture([...fatture, nuovaFattura]);
    }

    setRangeResult({ count: giorni.length, daStr: rangeForm.da, aStr: rangeForm.a, fatturaCreata: importoTotale > 0 });
    setRangeForm({ da: "", a: "", skipWeekend: true, oreAlGiorno: "8", tariffaImporto: "", tariffaUnita: "ora", scadenzaPagamento: "", descrizione: "" });
  };

  const segnaFatturaPagata = (fatturaId) => {
    const fatt = fatture.find((f) => f.id === fatturaId);
    if (!fatt) return;
    const oggi = todayKey();
    // La fattura pagata genera una vera entrata (consuntivo), che da qui in poi
    // contribuisce ai totali del mese e alla tariffa oraria reale.
    const newCal = { ...calendario };
    newCal[oggi] = [...(newCal[oggi] || []), { id: Date.now() + Math.random(), tipo: "entrata", stato: "consuntivo", importo: fatt.importo, descrizione: fatt.descrizione }];
    setCalendario(newCal);
    setFatture(fatture.map((f) => (f.id === fatturaId ? { ...f, stato: "pagata", dataPagamento: oggi } : f)));
  };

  const scaricaPromemoriaFattura = (fatt) => {
    const ics = generateICS([{ date: new Date(fatt.scadenza + "T00:00:00"), title: `Fattura: ${fatt.descrizione} · ${fatt.importo.toFixed(0)}€`, notes: "Promemoria pagamento da OreLibere" }]);
    downloadBlob(ics, `fattura-${fatt.scadenza}.ics`, "text/calendar;charset=utf-8;");
  };

  const addEntry = () => {
    if (!selectedDay) return;
    const k = dateKey(selectedDay);
    const isPastOrToday = k <= today;
    const entry = {
      id: Date.now(),
      tipo: form.tipo,
      stato: isPastOrToday ? "consuntivo" : "pianificato",
      ore: form.tipo === "turno" ? Number(form.ore) || 0 : undefined,
      importo: form.tipo !== "turno" ? Number(form.importo) || 0 : undefined,
      descrizione: form.descrizione,
    };
    setCalendario({ ...calendario, [k]: [...(calendario[k] || []), entry] });
    setForm({ tipo: redditoTipo === "variabile" ? "turno" : "uscita", ore: "", importo: "", descrizione: "" });
    setShowAdd(false);
  };
  const removeEntry = (k, id) => setCalendario({ ...calendario, [k]: (calendario[k] || []).filter((e) => e.id !== id) });
  const toggleStato = (k, id) =>
    setCalendario({ ...calendario, [k]: (calendario[k] || []).map((e) => (e.id === id ? { ...e, stato: e.stato === "consuntivo" ? "pianificato" : "consuntivo" } : e)) });

  return (
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 96 }}>
      <ScreenHeader
        eyebrow={redditoTipo === "variabile" ? "Entrate, uscite e turni" : "Spese extra pianificate"}
        title="Calendario"
        right={
          redditoTipo === "variabile" ? (
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => setShowAddRange(true)}
                style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${C.panelBorder}`, borderRadius: 999, padding: "6px 10px", cursor: "pointer" }}
              >
                <Calendar size={13} color={C.brass} />
                <span style={{ fontSize: 11, color: C.textDim, fontFamily: MONO_FONT }}>Periodo</span>
              </button>
              {hasTier("elite") ? (
                <button
                  onClick={() => setShowProgetti(true)}
                  style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${C.panelBorder}`, borderRadius: 999, padding: "6px 10px", cursor: "pointer" }}
                >
                  <Receipt size={13} color={C.brass} />
                  <span style={{ fontSize: 11, color: C.textDim, fontFamily: MONO_FONT }}>Progetti</span>
                </button>
              ) : (
                <button
                  onClick={() => setShowLockedProgetti(true)}
                  style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${C.panelBorder}`, borderRadius: 999, padding: "6px 10px", cursor: "pointer", opacity: 0.7 }}
                >
                  <Receipt size={13} color={C.textFainter} />
                  <span style={{ fontSize: 11, color: C.textFainter, fontFamily: MONO_FONT }}>Progetti · Elite</span>
                </button>
              )}
            </div>
          ) : null
        }
      />
      {hasTier("elite") && showProgetti && (
        <ProgettiScreen progetti={progetti} setProgetti={setProgetti} hourlyBaseline={hourlyEstimate} onBack={() => setShowProgetti(false)} />
      )}
      {!hasTier("elite") && showLockedProgetti && (
        <div style={{ position: "fixed", inset: 0, zIndex: 70, backgroundColor: C.bg, display: "flex", flexDirection: "column" }}>
          <LockedFeatureScreen
            tier="elite"
            titolo="Progetti"
            descrizione="Per ogni lavoro che accetti, inserisci prezzo di vendita e ore che ci impieghi: l'app ti dice la tua tariffa oraria reale su quel progetto, e ti avvisa se stai lavorando sotto la tua tariffa base."
            onBack={() => setShowLockedProgetti(false)}
          />
        </div>
      )}

      <div style={{ padding: "0 20px", marginBottom: 14 }}>
        <PunchTicket style={{ borderRadius: 8, padding: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: redditoTipo === "variabile" ? "1fr 1fr" : "1fr", gap: 12, marginBottom: 10 }}>
            {redditoTipo === "variabile" && (
              <div>
                <div style={{ fontSize: 10, textTransform: "uppercase", color: C.textDim, letterSpacing: "0.1em", marginBottom: 2 }}>Ore lavorate</div>
                <div style={{ fontFamily: SERIF_FONT, fontSize: 22, fontWeight: 700, color: C.ink }}>{monthOre.toFixed(1)}h</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: 10, textTransform: "uppercase", color: C.textDim, letterSpacing: "0.1em", marginBottom: 2 }}>Saldo</div>
              <div style={{ fontFamily: SERIF_FONT, fontSize: 22, fontWeight: 700, color: monthEntrate - monthUscite >= 0 ? C.green : C.rust }}>{(monthEntrate - monthUscite).toFixed(0)}€</div>
              <div style={{ fontSize: 10.5, color: C.textFaint, marginTop: 1 }}>{euroToTime(Math.abs(monthEntrate - monthUscite), hourlyEstimate)}</div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: C.textFaint }}>
            <span>Entrate {monthEntrate.toFixed(0)}€</span>
            <span>Uscite {monthUscite.toFixed(0)}€</span>
          </div>
        </PunchTicket>
      </div>

      {prossimeUscite.length > 0 && (
        <div style={{ padding: "0 20px", marginBottom: 16 }}>
          <div style={{ backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 8, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Bell size={13} color={C.brass} />
                <span style={{ fontSize: 11.5, fontWeight: 700, color: C.paper }}>Prossime uscite pianificate</span>
              </div>
              <button onClick={scaricaTuttiPromemoria} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10.5, color: C.brass, fontFamily: MONO_FONT }}>
                promemoria tutte
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {prossimeUscite.map((e) => {
                const giorni = Math.round((e.date - new Date(today)) / 86400000);
                return (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <span style={{ color: C.textFaint, fontFamily: MONO_FONT, fontSize: 10.5, width: 56, flexShrink: 0 }}>
                      {giorni === 0 ? "oggi" : giorni === 1 ? "domani" : `tra ${giorni}g`}
                    </span>
                    <span style={{ color: C.paper, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.descrizione || "Spesa pianificata"}</span>
                    <span style={{ color: C.rust, fontWeight: 700, fontFamily: MONO_FONT, flexShrink: 0 }}>-{e.importo.toFixed(0)}€</span>
                    <button onClick={() => scaricaPromemoria(e)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0 }} title="Aggiungi promemoria al telefono">
                      <Bell size={12} color={C.textFaint} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {fatture.filter((f) => f.stato === "attesa").length > 0 && (
        <div style={{ padding: "0 20px", marginBottom: 16 }}>
          <div style={{ backgroundColor: "rgba(255,107,74,0.08)", border: `1px solid ${C.brass}`, borderRadius: 8, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <Receipt size={13} color={C.brass} />
              <span style={{ fontSize: 11.5, fontWeight: 700, color: C.paper }}>Fatture in attesa di pagamento</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {fatture.filter((f) => f.stato === "attesa").sort((a, b) => a.scadenza.localeCompare(b.scadenza)).map((f) => {
                const giorniAllaScadenza = Math.round((new Date(f.scadenza + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000);
                return (
                  <div key={f.id} style={{ backgroundColor: C.panel, borderRadius: 6, padding: "10px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ color: C.paper, fontSize: 12.5, fontWeight: 600, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.descrizione}</span>
                      <span style={{ color: C.brass, fontWeight: 800, fontFamily: MONO_FONT, fontSize: 13, flexShrink: 0, marginLeft: 8 }}>{f.importo.toFixed(0)}€</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 10.5, color: C.textFaint, fontFamily: MONO_FONT }}>
                        ≈ {euroToTime(f.importo, hourlyEstimate)} · scade {giorniAllaScadenza === 0 ? "oggi" : giorniAllaScadenza === 1 ? "domani" : giorniAllaScadenza > 0 ? `tra ${giorniAllaScadenza}g` : `${-giorniAllaScadenza}g fa`}
                      </span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => scaricaPromemoriaFattura(f)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }} title="Promemoria al telefono">
                          <Bell size={13} color={C.textFaint} />
                        </button>
                        <button onClick={() => segnaFatturaPagata(f.id)} style={{ background: "none", border: `1px solid ${C.green}`, borderRadius: 999, padding: "3px 9px", fontSize: 10, color: C.green, fontWeight: 700, cursor: "pointer" }}>
                          Segna pagata
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {redditoTipo === "variabile" && hasTier("elite") && (
      <div style={{ padding: "0 20px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, backgroundColor: real.ready ? "rgba(124,179,66,0.1)" : C.panel, border: `1px solid ${real.ready ? C.green : C.panelBorder}`, borderRadius: 8, padding: "12px 14px" }}>
          <TrendingUp size={16} color={real.ready ? C.green : C.textFaint} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            {real.ready ? (
              <>
                <div style={{ fontSize: 12.5, color: C.paper, fontWeight: 600 }}>Tariffa oraria reale: {real.rate.toFixed(2)}€/h</div>
                <div style={{ fontSize: 11, color: C.textFaint, marginTop: 1 }}>Calcolata su {real.ore.toFixed(0)}h registrate — ora è questa a guidare l'app, non più la stima.</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12.5, color: C.paper, fontWeight: 600 }}>Ancora in stima: {hourlyEstimate.toFixed(2)}€/h</div>
                <div style={{ fontSize: 11, color: C.textFaint, marginTop: 1 }}>
                  {real.ore < REAL_RATE_MIN_HOURS
                    ? `Registra almeno ${REAL_RATE_MIN_HOURS}h di turni a consuntivo (ne hai ${real.ore.toFixed(1)}h) per passare a un numero calcolato sui tuoi dati veri.`
                    : "Hai abbastanza ore registrate, ma nessuna entrata confermata: finché i tuoi compensi restano \"in attesa\" nelle fatture, l'app resta sulla stima invece di calcolare un numero da un incasso che non è ancora arrivato davvero."}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      )}

      <div style={{ padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button onClick={() => setViewDate(new Date(year, month - 1, 1))} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><ChevronLeft size={18} color={C.textDim} /></button>
        <span style={{ fontWeight: 700, color: C.paper, fontSize: 14 }}>{MESI_IT[month]} {year}</span>
        <button onClick={() => setViewDate(new Date(year, month + 1, 1))} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><ChevronRight size={18} color={C.textDim} /></button>
      </div>

      <div style={{ padding: "0 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 6 }}>
          {GIORNI_IT.map((g, i) => (
            <div key={i} style={{ textAlign: "center", fontSize: 10, color: C.textFainter, fontFamily: MONO_FONT }}>{g}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
          {(() => {
            // Mappa giorno → stato fattura collegata, per colorare la griglia: "pagata" vince su "attesa"
            const fatturaByDay = {};
            fatture.forEach((f) => {
              (f.giorni || []).forEach((gk) => {
                if (!fatturaByDay[gk] || f.stato === "pagata") fatturaByDay[gk] = f.stato;
              });
            });
            return cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const k = dateKey(d);
              const dayEntries = calendario[k] || [];
              const isToday = k === today;
              const hasTurno = dayEntries.some((e) => e.tipo === "turno");
              const hasEntrata = dayEntries.some((e) => e.tipo === "entrata");
              const hasUscita = dayEntries.some((e) => e.tipo === "uscita");
              const fatturaStato = fatturaByDay[k];
              const borderColor = fatturaStato === "pagata" ? C.green : fatturaStato === "attesa" ? C.brass : isToday ? C.brass : C.panelBorder;
              const borderW = fatturaStato || isToday ? "1.5px" : "1px";
              return (
                <button
                  key={i}
                  onClick={() => { setSelectedDay(d); setShowAdd(false); }}
                  style={{
                    aspectRatio: "1", borderRadius: 6, border: `${borderW} solid ${borderColor}`,
                    backgroundColor: fatturaStato === "pagata" ? "rgba(124,179,66,0.08)" : fatturaStato === "attesa" ? "rgba(255,107,74,0.08)" : dayEntries.length ? C.panel : "transparent",
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 2,
                  }}
                >
                  <span style={{ fontSize: 11, color: isToday ? C.brass : C.paper, fontWeight: isToday ? 700 : 400 }}>{d.getDate()}</span>
                  <div style={{ display: "flex", gap: 2, marginTop: 2, height: 4 }}>
                    {hasTurno && <span style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: C.fixedBar }} />}
                    {hasEntrata && <span style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: C.green }} />}
                    {hasUscita && <span style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: C.rust }} />}
                  </div>
                </button>
              );
            });
          })()}
        </div>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: C.fixedBar, display: "inline-block" }} /><span style={{ fontSize: 10.5, color: C.textFaint }}>Turno</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: C.green, display: "inline-block" }} /><span style={{ fontSize: 10.5, color: C.textFaint }}>Entrata</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: C.rust, display: "inline-block" }} /><span style={{ fontSize: 10.5, color: C.textFaint }}>Uscita</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, border: `1.5px solid ${C.brass}`, display: "inline-block" }} /><span style={{ fontSize: 10.5, color: C.textFaint }}>Fattura in attesa</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, border: `1.5px solid ${C.green}`, display: "inline-block" }} /><span style={{ fontSize: 10.5, color: C.textFaint }}>Fattura pagata</span></div>
        </div>
      </div>

      {selectedDay && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.8)" }} onClick={() => setSelectedDay(null)} />
          <div style={{ position: "relative", backgroundColor: C.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "16px 20px 32px 20px", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ width: 40, height: 4, backgroundColor: "#DED7C4", borderRadius: 4, margin: "0 auto 16px auto" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ color: C.paper, fontWeight: 700, fontSize: 15 }}>{selectedDay.getDate()} {MESI_IT[selectedDay.getMonth()]}</span>
              <button onClick={() => setSelectedDay(null)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} color={C.textDim} /></button>
            </div>

            {selectedEntries.length === 0 && !showAdd && (
              <p style={{ fontSize: 13, color: C.textFaint, marginBottom: 16 }}>Nessuna voce per questo giorno.</p>
            )}

            {selectedEntries.map((e) => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, backgroundColor: C.bg, border: `1px solid ${C.panelBorder}`, borderRadius: 6, padding: "10px 12px", marginBottom: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", backgroundColor: C.panelBorder, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {e.tipo === "turno" ? <Clock size={13} color={C.fixedBar} /> : e.tipo === "entrata" ? <TrendingUp size={13} color={C.green} /> : <TrendingDown size={13} color={C.rust} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: C.paper, fontWeight: 600 }}>
                    {e.tipo === "turno"
                      ? `Turno · ${e.ore}h`
                      : e.tipo === "entrata"
                        ? `Entrata · ${Number(e.importo).toFixed(0)}€ · ${euroToTime(Number(e.importo), hourlyEstimate)}`
                        : `Uscita · ${Number(e.importo).toFixed(0)}€ · ${euroToTime(Number(e.importo), hourlyEstimate)}`}
                    {e.descrizione ? ` — ${e.descrizione}` : ""}
                  </div>
                  <button
                    onClick={() => toggleStato(selectedKey, e.id)}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 10.5, fontFamily: MONO_FONT, color: e.stato === "consuntivo" ? C.green : C.textFaint, marginTop: 2 }}
                  >
                    {e.stato === "consuntivo" ? "✓ consuntivo" : "○ pianificato — tocca per confermare"}
                  </button>
                </div>
                <button onClick={() => removeEntry(selectedKey, e.id)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={14} color={C.textDim} /></button>
                {e.tipo === "uscita" && e.stato === "pianificato" && (
                  <button onClick={() => scaricaPromemoria({ ...e, date: selectedDay, dateStr: selectedKey })} style={{ background: "none", border: "none", cursor: "pointer" }} title="Aggiungi promemoria al telefono">
                    <Bell size={14} color={C.brass} />
                  </button>
                )}
              </div>
            ))}

            {showAdd ? (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: "flex", gap: 6, backgroundColor: C.bg, border: `1px solid ${C.panelBorder}`, borderRadius: 999, padding: 4, marginBottom: 14 }}>
                  {(redditoTipo === "variabile" ? [["turno", "Turno"], ["entrata", "Entrata"], ["uscita", "Uscita"]] : [["entrata", "Entrata"], ["uscita", "Uscita"]]).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setForm({ ...form, tipo: id })}
                      style={{ flex: 1, padding: "7px 4px", borderRadius: 999, border: "none", cursor: "pointer", backgroundColor: form.tipo === id ? C.brass : "transparent", color: form.tipo === id ? "#FFFFFF" : C.textFaint, fontSize: 11, fontWeight: 700 }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {form.tipo === "turno" ? (
                  <>
                    <FieldLabel>Ore lavorate</FieldLabel>
                    <input type="number" value={form.ore} placeholder="8" onChange={(e) => setForm({ ...form, ore: e.target.value })}
                      style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px", color: C.paper, fontSize: 14, marginTop: 4, marginBottom: 12, outline: "none" }} />
                  </>
                ) : (
                  <>
                    <FieldLabel>Importo €</FieldLabel>
                    <input type="number" value={form.importo} placeholder="150" onChange={(e) => setForm({ ...form, importo: e.target.value })}
                      style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px", color: C.paper, fontSize: 14, marginTop: 4, marginBottom: 12, outline: "none" }} />
                  </>
                )}
                <FieldLabel>Descrizione (opzionale)</FieldLabel>
                <input
                  type="text" value={form.descrizione}
                  placeholder={form.tipo === "turno" ? "es. Progetto cliente X" : form.tipo === "entrata" ? "es. Fattura cliente X" : "es. Materiale"}
                  onChange={(e) => setForm({ ...form, descrizione: e.target.value })}
                  style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px", color: C.paper, fontSize: 14, marginTop: 4, marginBottom: 16, outline: "none" }}
                />
                <button onClick={addEntry} style={{ width: "100%", padding: "12px 0", borderRadius: 6, border: "none", backgroundColor: C.brass, color: "#FFFFFF", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
                  Aggiungi
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAdd(true)}
                style={{ width: "100%", padding: "12px 0", borderRadius: 6, border: `1px dashed ${C.panelBorder}`, background: "none", color: C.textFaint, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}
              >
                <Plus size={15} /> Aggiungi voce
              </button>
            )}
          </div>
        </div>
      )}

      {showAddRange && (
        <div style={{ position: "fixed", inset: 0, zIndex: 55, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.8)" }} onClick={() => { setShowAddRange(false); setRangeResult(null); }} />
          <div style={{ position: "relative", backgroundColor: C.panel, borderTop: `1px solid #DED7C4`, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "16px 20px 32px 20px", maxHeight: "88vh", overflowY: "auto" }}>
            <div style={{ width: 40, height: 4, backgroundColor: "#DED7C4", borderRadius: 4, margin: "0 auto 16px auto" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: C.paper, fontWeight: 700, fontSize: 15 }}>Aggiungi un periodo di lavoro</span>
              <button onClick={() => { setShowAddRange(false); setRangeResult(null); }} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} color={C.textDim} /></button>
            </div>

            {rangeResult ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", backgroundColor: rangeResult.fatturaCreata ? "rgba(255,107,74,0.15)" : "rgba(124,179,66,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px auto" }}>
                  <TrendingUp size={24} color={rangeResult.fatturaCreata ? C.brass : C.green} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.paper, marginBottom: 6 }}>{rangeResult.count} giorni lavorativi aggiunti</div>
                <div style={{ fontSize: 12, color: C.textFaint, marginBottom: 20 }}>
                  Dal {new Date(rangeResult.daStr).toLocaleDateString("it-IT")} al {new Date(rangeResult.aStr).toLocaleDateString("it-IT")}, sabati e domeniche esclusi se avevi scelto così.
                  {rangeResult.fatturaCreata ? " È stata creata anche una fattura in attesa di pagamento, la trovi qui sotto nel Calendario." : ""}
                </div>
                <button onClick={() => { setShowAddRange(false); setRangeResult(null); }} style={{ padding: "12px 24px", borderRadius: 6, border: "none", backgroundColor: C.brass, color: "#FFFFFF", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                  Vai al calendario
                </button>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 11.5, color: C.textFainter, lineHeight: 1.5, margin: "0 0 16px 0" }}>
                  Utile per registrare in un colpo solo un mese di turni invece di un giorno alla volta. Crea un "turno" per ogni giorno lavorativo, e (se scegli una tariffa) anche l'entrata corrispondente.
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <FieldLabel>Da</FieldLabel>
                    <input type="date" value={rangeForm.da} onChange={(e) => setRangeForm({ ...rangeForm, da: e.target.value })}
                      style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "9px 10px", color: C.paper, fontSize: 13, marginTop: 4, outline: "none" }} />
                  </div>
                  <div>
                    <FieldLabel>A</FieldLabel>
                    <input type="date" value={rangeForm.a} onChange={(e) => setRangeForm({ ...rangeForm, a: e.target.value })}
                      style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "9px 10px", color: C.paper, fontSize: 13, marginTop: 4, outline: "none" }} />
                  </div>
                </div>

                <button
                  onClick={() => setRangeForm({ ...rangeForm, skipWeekend: !rangeForm.skipWeekend })}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", padding: 0, marginBottom: 16, cursor: "pointer" }}
                >
                  <span style={{ color: C.paper, fontSize: 13, fontWeight: 600 }}>Salta sabato e domenica</span>
                  <div style={{ width: 38, height: 20, borderRadius: 999, backgroundColor: rangeForm.skipWeekend ? C.brass : "#DED7C4", position: "relative", transition: "background-color 0.15s" }}>
                    <div style={{ position: "absolute", top: 2, left: rangeForm.skipWeekend ? 20 : 2, width: 16, height: 16, borderRadius: "50%", backgroundColor: C.ink, transition: "left 0.15s" }} />
                  </div>
                </button>

                <div style={{ marginBottom: 6 }}><FieldLabel>Ore lavorate al giorno</FieldLabel></div>
                <input type="number" value={rangeForm.oreAlGiorno} placeholder="8" onChange={(e) => setRangeForm({ ...rangeForm, oreAlGiorno: e.target.value })}
                  style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px", color: C.paper, fontSize: 14, marginTop: 4, marginBottom: 16, outline: "none" }} />

                <div style={{ marginBottom: 6 }}><FieldLabel>Quanto ti pagano (opzionale)</FieldLabel></div>
                <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                  <div style={{ flex: 1 }}>
                    <input type="number" value={rangeForm.tariffaImporto} placeholder="0" onChange={(e) => setRangeForm({ ...rangeForm, tariffaImporto: e.target.value })}
                      style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px", color: C.paper, fontSize: 14, outline: "none" }} />
                  </div>
                  <select
                    value={rangeForm.tariffaUnita}
                    onChange={(e) => setRangeForm({ ...rangeForm, tariffaUnita: e.target.value })}
                    style={{ backgroundColor: C.inputBg, color: C.paper, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "0 10px", fontSize: 13, fontFamily: SANS_FONT, outline: "none" }}
                  >
                    <option value="ora">/ora</option>
                    <option value="giorno">/giorno</option>
                    <option value="settimana">/settimana</option>
                    <option value="mese">/mese</option>
                    <option value="progetto">a progetto</option>
                  </select>
                </div>
                <p style={{ fontSize: 11, color: C.textFainter, lineHeight: 1.4, marginBottom: 16 }}>
                  {rangeForm.tariffaUnita === "progetto"
                    ? "Diventa un'unica fattura in attesa di pagamento."
                    : "Lascia vuoto se vuoi registrare solo le ore lavorate, senza aspettare nessun pagamento."}
                </p>

                {rangeForm.tariffaImporto && (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <FieldLabel>La cifra che hai scritto è lorda o netta?</FieldLabel>
                      <button onClick={() => setShowInfoLordoNetto(true)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 0 }} title="Cosa cambia tra lordo e netto?">
                        <Info size={13} color={C.textFaint} />
                      </button>
                    </div>
                    {showInfoLordoNetto && (
                      <div style={{ backgroundColor: C.bg, border: `1px solid ${C.panelBorder}`, borderRadius: 6, padding: "10px 12px", marginBottom: 10 }}>
                        <p style={{ fontSize: 11.5, color: C.textDim, lineHeight: 1.55, margin: 0 }}>
                          <strong style={{ color: C.paper }}>Lordo</strong> è la cifra scritta in fattura, prima di tasse e contributi. <strong style={{ color: C.paper }}>Netto</strong> è quello che ti resta davvero in tasca — ed è quello che conta per l'app, perché le ore le calcoliamo su cosa puoi spendere per davvero, non su un numero che in parte andrà comunque via.
                        </p>
                        <button onClick={() => setShowInfoLordoNetto(false)} style={{ background: "none", border: "none", color: C.brass, fontSize: 11, fontWeight: 700, padding: 0, marginTop: 8, cursor: "pointer" }}>
                          Ho capito
                        </button>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6, backgroundColor: C.bg, border: `1px solid ${C.panelBorder}`, borderRadius: 999, padding: 4, marginBottom: 10 }}>
                      <button
                        onClick={() => setRangeForm({ ...rangeForm, lordoNetto: "netto" })}
                        style={{ flex: 1, padding: "8px 6px", borderRadius: 999, border: "none", cursor: "pointer", backgroundColor: rangeForm.lordoNetto === "netto" ? C.brass : "transparent", color: rangeForm.lordoNetto === "netto" ? "#FFFFFF" : C.textFaint, fontSize: 12, fontWeight: 700 }}
                      >
                        Netto
                      </button>
                      <button
                        onClick={() => setRangeForm({ ...rangeForm, lordoNetto: "lordo" })}
                        style={{ flex: 1, padding: "8px 6px", borderRadius: 999, border: "none", cursor: "pointer", backgroundColor: rangeForm.lordoNetto === "lordo" ? C.brass : "transparent", color: rangeForm.lordoNetto === "lordo" ? "#FFFFFF" : C.textFaint, fontSize: 12, fontWeight: 700 }}
                      >
                        Lordo
                      </button>
                    </div>

                    {rangeForm.lordoNetto === "lordo" && (
                      percentualeNettaAuto !== null ? (
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, backgroundColor: "rgba(124,179,66,0.1)", border: `1px solid ${C.green}`, borderRadius: 6, padding: "10px 12px", marginBottom: 16 }}>
                          <TrendingUp size={13} color={C.green} style={{ marginTop: 1, flexShrink: 0 }} />
                          <p style={{ fontSize: 11.5, color: C.paper, lineHeight: 1.5, margin: 0 }}>
                            Uso le aliquote del tuo Regime fiscale: circa <strong>{(percentualeNettaAuto * 100).toFixed(0)}%</strong> ti resta netto. Le ore verranno calcolate su quello, non sul lordo.
                          </p>
                        </div>
                      ) : (
                        <>
                          <div style={{ marginBottom: 6 }}><FieldLabel>Quanto pensi ti resterà netto (%)</FieldLabel></div>
                          <input type="number" value={rangeForm.percentualeNettaManuale}
                            onChange={(e) => setRangeForm({ ...rangeForm, percentualeNettaManuale: e.target.value })}
                            placeholder="65"
                            style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px", color: C.paper, fontSize: 14, marginTop: 4, marginBottom: 8, outline: "none" }} />
                          <p style={{ fontSize: 11, color: C.textFainter, lineHeight: 1.4, marginBottom: 16 }}>
                            Di solito tra il 55% e il 75%, a seconda di tasse e contributi. Non hai ancora configurato il Regime fiscale nelle Impostazioni — fallo una volta sola e la prossima volta questo calcolo lo farà l'app da sola, con le tue aliquote vere.
                          </p>
                        </>
                      )
                    )}
                  </>
                )}

                {rangeForm.tariffaImporto && (
                  <>
                    <div style={{ marginBottom: 6 }}><FieldLabel>Quando ti aspetti il pagamento</FieldLabel></div>
                    <input type="date" value={rangeForm.scadenzaPagamento} onChange={(e) => setRangeForm({ ...rangeForm, scadenzaPagamento: e.target.value })}
                      style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px", color: C.paper, fontSize: 14, marginTop: 4, marginBottom: 8, outline: "none" }} />
                    <p style={{ fontSize: 11, color: C.textFainter, lineHeight: 1.4, marginBottom: 16 }}>
                      Finché non la segni come pagata, questo compenso resta "in attesa" (arancione, solo una stima) — non conta ancora nei tuoi totali reali. Puoi anche scaricare un promemoria per non dimenticartene.
                    </p>
                  </>
                )}

                <div style={{ marginBottom: 6 }}><FieldLabel>Descrizione (opzionale)</FieldLabel></div>
                <input type="text" value={rangeForm.descrizione} placeholder="es. Progetto cliente X" onChange={(e) => setRangeForm({ ...rangeForm, descrizione: e.target.value })}
                  style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px", color: C.paper, fontSize: 14, marginTop: 4, marginBottom: 16, outline: "none" }} />

                {giorniAnteprima.length > 0 && (
                  <div style={{ backgroundColor: C.bg, border: `1px solid ${C.panelBorder}`, borderRadius: 6, padding: "10px 12px", marginBottom: 16 }}>
                    <div style={{ fontSize: 12.5, color: C.paper, fontWeight: 600 }}>{giorniAnteprima.length} giorni lavorativi nel periodo</div>
                    {rangeForm.tariffaImporto && rangeForm.tariffaUnita !== "progetto" && (
                      <div style={{ fontSize: 11.5, color: C.brass, marginTop: 3, fontWeight: 700 }}>≈ {importoGiornaliero.toFixed(2)}€/giorno → {(importoGiornaliero * giorniAnteprima.length).toFixed(0)}€ netti in attesa (stima)</div>
                    )}
                    {rangeForm.tariffaImporto && rangeForm.tariffaUnita === "progetto" && (
                      <div style={{ fontSize: 11.5, color: C.brass, marginTop: 3, fontWeight: 700 }}>{(Number(rangeForm.tariffaImporto) * percentualeNettaEffettiva).toFixed(0)}€ netti in attesa (stima), fattura unica</div>
                    )}
                    {rangeForm.tariffaImporto && rangeForm.lordoNetto === "lordo" && (
                      <div style={{ fontSize: 10.5, color: C.textFainter, marginTop: 3 }}>
                        Da {Number(rangeForm.tariffaImporto).toFixed(0)}€ lordi/{rangeForm.tariffaUnita === "progetto" ? "progetto" : rangeForm.tariffaUnita}, al {(percentualeNettaEffettiva * 100).toFixed(0)}% netto
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={submitRange}
                  disabled={giorniAnteprima.length === 0}
                  style={{ width: "100%", padding: "13px 0", borderRadius: 6, border: "none", backgroundColor: giorniAnteprima.length > 0 ? C.brass : C.panelBorder, color: giorniAnteprima.length > 0 ? "#FFFFFF" : C.textFaint, fontWeight: 700, fontSize: 14, cursor: giorniAnteprima.length > 0 ? "pointer" : "default" }}
                >
                  {giorniAnteprima.length > 0 ? `Aggiungi ${giorniAnteprima.length} giorni` : "Scegli le date"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Schermata "teaser" per una funzione bloccata dalla fascia: invece di far sparire la
// voce di menu, resta visibile in grigio col lucchetto — tocchi e vedi cosa sblocchi,
// senza dover indovinare che esiste.
function LockedFeatureScreen({ titolo, descrizione, tier, onBack }) {
  const isElite = tier === "elite";
  return (
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 32 }}>
      <div style={{ padding: "8px 20px 4px 20px", display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}><ChevronLeft size={20} color={C.textDim} /></button>
      </div>
      <div style={{ padding: "36px 30px 30px 30px", textAlign: "center" }}>
        <div style={{ width: 60, height: 60, borderRadius: "50%", backgroundColor: isElite ? "#171717" : "rgba(255,107,74,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px auto" }}>
          <Lock size={24} color={isElite ? "#F7F3EA" : C.brass} />
        </div>
        <span style={{
          display: "inline-block", fontSize: 10, fontFamily: MONO_FONT, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase",
          padding: "4px 10px", borderRadius: 999, marginBottom: 12,
          backgroundColor: isElite ? "#171717" : "rgba(255,107,74,0.15)", color: isElite ? "#F7F3EA" : C.brass,
        }}>
          {isElite ? "Elite" : "Premium"}
        </span>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.paper, marginBottom: 10, fontFamily: DISPLAY_FONT }}>{titolo}</div>
        <p style={{ fontSize: 13.5, color: C.textFaint, lineHeight: 1.6, marginBottom: 28, maxWidth: 300, marginLeft: "auto", marginRight: "auto" }}>{descrizione}</p>
        <div style={{ backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 10, padding: "14px 16px" }}>
          <p style={{ fontSize: 12, color: C.textFainter, margin: 0, lineHeight: 1.5 }}>
            Il passaggio a un piano superiore non è ancora attivo in questa versione di prova — questa schermata ti mostra in anteprima cosa troverai.
          </p>
        </div>
      </div>
    </div>
  );
}

function GuidaScreen({ onBack, redditoTipo }) {
  const [open, setOpen] = useState("concetto");
  const toggle = (id) => setOpen(open === id ? null : id);

  const SEZIONI = [
    {
      id: "concetto",
      titolo: "L'idea di base",
      minTier: "free",
      esempio: "L'app converte ogni spesa in ore di lavoro invece che in euro. Se guadagni 12€ all'ora, un gelato da 4€ diventa \"20 minuti\": è il tempo che hai lavorato per pagartelo. Ogni numero che vedi nell'app parte da questo conto.",
    },
    {
      id: "diario",
      titolo: "Diario — registrare una spesa",
      minTier: "free",
      esempio: "Serve per segnare cosa spendi ogni giorno. Tocca il bottone rosso con il \"+\" in basso, scegli una categoria (Bar, Spesa, Bollette...), scrivi l'importo e conferma. L'app calcola subito quante ore ti è costata e la trovi nella lista \"Timbrature di oggi\".",
    },
    {
      id: "simulatore",
      titolo: "Simulatore — prima di un acquisto",
      minTier: "free",
      esempio: hasTier("premium")
        ? "Serve per capire quanto ti costa davvero, in ore, comprare qualcosa prima di farlo. Scrivi il prezzo, scegli come lo pagheresti (subito, a rate PayPal, o a rate con finanziamento), e l'app confronta le ore di lavoro che ti costa ogni opzione — utile soprattutto per capire quanto ti costano gli interessi."
        : "Serve per capire quanto ti costa davvero, in ore, comprare qualcosa prima di farlo. Scrivi il prezzo e confronta pagamento subito o a rate PayPal senza interessi. Con Premium si aggiunge anche il confronto con i finanziamenti a rate, per vedere quanto ti costano gli interessi in ore.",
    },
    {
      id: "budget",
      titolo: "Budget — i tuoi obiettivi",
      minTier: "free",
      esempio: hasTier("premium")
        ? "Serve per mettere via soldi per qualcosa di preciso — un viaggio, un acquisto, un fondo di sicurezza. Tocca \"+\", scrivi un nome, quanto ti serve ed entro quando (se vuoi una scadenza). L'app ti dice quanto mettere da parte ogni mese, e ti avvisa se non è realistico con quello che guadagni."
        : "Serve per mettere via soldi per qualcosa di preciso. Tocca \"+\", scrivi un nome, quanto ti serve ed entro quando. L'app ti dice quanto mettere da parte ogni mese. Il piano Free include un obiettivo alla volta; con Premium puoi averne quanti vuoi in parallelo.",
    },
    {
      id: "calendario",
      titolo: "Calendario",
      minTier: "premium",
      esempio: redditoTipo === "variabile"
        ? "Serve per registrare le tue giornate di lavoro. Tocca un giorno, scegli \"Turno\" se hai lavorato (scrivi le ore), oppure \"Entrata\"/\"Uscita\" per un pagamento ricevuto o fatto. Se lavori più giorni di fila, il bottone \"Periodo\" in alto ti evita di farlo uno per uno: scegli le date, quanto ti pagano (dicendo se è lordo o netto — se è lordo e hai configurato il Regime fiscale, l'app calcola da sola il netto vero), e quando ti aspetti il pagamento. Il compenso resta \"in attesa\" (arancione, solo una stima) finché non lo segni come pagato — a quel punto diventa verde e conta davvero nei tuoi totali."
        : "Serve per segnare in anticipo le spese che sai già che arriveranno — una multa, il bollo auto, una gita scolastica. Tocca il giorno in cui scade, scegli \"Uscita\", scrivi l'importo. Comparirà nella lista \"Prossime uscite\" in cima al Calendario, con un conto alla rovescia.",
    },
    {
      id: "chiusura",
      titolo: "Chiusura",
      minTier: "premium",
      esempio: "Compare da sola quando hai del risparmio non ancora assegnato a un obiettivo — ad esempio a fine mese, se ti sono avanzati dei soldi. Ti chiede: li metti in uno dei tuoi obiettivi (anche solo in parte), o li lasci liberi? Basta un tocco per decidere.",
    },
  ];

  if (redditoTipo === "variabile") {
    SEZIONI.push({
      id: "regime",
      titolo: "Regime fiscale",
      minTier: "elite",
      esempio: "Serve a chi ha partita IVA per stimare quanto resta in tasca dopo tasse e contributi. Vai su Impostazioni → \"Regime fiscale\", scrivi quanto pensi di fatturare in un anno, scegli il tuo regime (Forfettario o Ordinario). L'app calcola il netto stimato — ma è solo una stima: per le cifre vere serve sempre il tuo commercialista.",
    });
  }

  if (!KICKSTARTER_BUILD) {
    SEZIONI.push({
      id: "import",
      titolo: "Importa da file",
      minTier: "premium",
      esempio: "Serve per non dover scrivere a mano ogni spesa, se la tua banca te le dà già in un file. Scarica l'estratto conto in formato CSV o Excel dal sito o dall'app della tua banca, poi vai su Impostazioni → \"Importa spese da file\" e caricalo. L'app legge da sola le colonne (data, importo, descrizione), ti mostra un'anteprima, e una volta confermato tutti i movimenti li trovi nel Calendario, divisi giorno per giorno.",
    });
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 32 }}>
      <div style={{ padding: "8px 20px 4px 20px", display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}><ChevronLeft size={20} color={C.textDim} /></button>
      </div>
      <ScreenHeader eyebrow="Da consultare quando vuoi" title="Guida all'uso" />
      <p style={{ padding: "0 20px", fontSize: 12.5, color: C.textFaint, lineHeight: 1.5, marginBottom: 18 }}>
        Un esempio semplice per ogni parte dell'app. Tocca una voce per aprirla.
      </p>

      <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 8 }}>
        {SEZIONI.map((s) => {
          const locked = !hasTier(s.minTier);
          return (
            <div key={s.id} style={{ backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 8, overflow: "hidden", opacity: locked ? 0.75 : 1 }}>
              <button
                onClick={() => toggle(s.id)}
                style={{ width: "100%", padding: "13px 14px", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 700, color: C.paper, display: "flex", alignItems: "center", gap: 8 }}>
                  {s.titolo}
                  {locked && (
                    <span style={{ fontSize: 8.5, fontFamily: MONO_FONT, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", padding: "2px 7px", borderRadius: 999, backgroundColor: s.minTier === "elite" ? "#171717" : "rgba(255,107,74,0.15)", color: s.minTier === "elite" ? "#F7F3EA" : C.brass }}>
                      {s.minTier === "elite" ? "Elite" : "Premium"}
                    </span>
                  )}
                </span>
                <ChevronDown size={16} color={C.textFaint} style={{ transform: open === s.id ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
              </button>
              {open === s.id && (
                <div style={{ padding: "0 14px 16px 14px" }}>
                  <p style={{ fontSize: 12.5, color: C.textDim, lineHeight: 1.6, margin: 0 }}>{s.esempio}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RegimeFiscaleScreen({ data, setData, onBack }) {
  const rf = data.regimeFiscale || {};
  const tipo = rf.tipo || "forfettario";
  const set = (patch) => setData({ ...data, regimeFiscale: { ...rf, ...patch } });

  const redditoLordo = Number(rf.redditoLordoAnnuo) || 0;
  const coeff = rf.coefficienteRedditivita !== undefined && rf.coefficienteRedditivita !== "" ? Number(rf.coefficienteRedditivita) : 78;
  const aliquotaForf = rf.aliquotaImposta !== undefined && rf.aliquotaImposta !== "" ? Number(rf.aliquotaImposta) : 15;
  const inpsPct = rf.inpsPct !== undefined && rf.inpsPct !== "" ? Number(rf.inpsPct) : 26.07;
  const commercialista = Number(rf.costoCommercialista) || 0;
  const oreAnnue = Number(rf.oreLavorateAnnue) || 0;

  let contributiINPS, imposta;
  if (tipo === "forfettario") {
    const imponibile = redditoLordo * (coeff / 100);
    contributiINPS = imponibile * (inpsPct / 100);
    const imponibileNetto = Math.max(imponibile - contributiINPS, 0);
    imposta = imponibileNetto * (aliquotaForf / 100);
  } else {
    contributiINPS = redditoLordo * (inpsPct / 100);
    const imponibileIrpef = Math.max(redditoLordo - contributiINPS, 0);
    imposta = calcolaIrpefProgressiva(imponibileIrpef, SCAGLIONI_IRPEF_2026);
  }
  const nettoAnnuo = redditoLordo - contributiINPS - imposta - commercialista;
  const nettoMensile = nettoAnnuo / 12;
  const tariffaOrariaNetta = oreAnnue > 0 ? nettoAnnuo / oreAnnue : null;
  const stimaStorico = estimateAnnualIncomeFromCalendario(data.calendario);

  return (
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 32 }}>
      <div style={{ padding: "8px 20px 4px 20px", display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}><ChevronLeft size={20} color={C.textDim} /></button>
      </div>
      <ScreenHeader eyebrow="Solo una stima, non una dichiarazione" title="Regime fiscale" />

      <div style={{ padding: "0 20px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, backgroundColor: "rgba(255,107,74,0.1)", border: `1px solid ${C.brass}`, borderRadius: 8, padding: "10px 12px" }}>
          <Info size={13} color={C.brassDim} style={{ marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, color: C.paper, lineHeight: 1.5 }}>
            Calcolo indicativo per farti un'idea del tuo netto. Aliquote e regole cambiano ogni anno e dipendono dal tuo caso specifico — verifica sempre con il tuo commercialista prima di decisioni importanti.
          </span>
        </div>
      </div>

      <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 6, backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 999, padding: 4 }}>
          <button onClick={() => set({ tipo: "forfettario" })} style={{ flex: 1, padding: "8px 6px", borderRadius: 999, border: "none", cursor: "pointer", backgroundColor: tipo === "forfettario" ? C.brass : "transparent", color: tipo === "forfettario" ? "#FFFFFF" : C.textFaint, fontSize: 12, fontWeight: 700 }}>Forfettario</button>
          <button onClick={() => set({ tipo: "ordinario" })} style={{ flex: 1, padding: "8px 6px", borderRadius: 999, border: "none", cursor: "pointer", backgroundColor: tipo === "ordinario" ? C.brass : "transparent", color: tipo === "ordinario" ? "#FFFFFF" : C.textFaint, fontSize: 12, fontWeight: 700 }}>Ordinario</button>
        </div>

        <div>
          <FieldLabel>Reddito lordo presunto annuo (fatturato)</FieldLabel>
          <div style={{ marginTop: 4 }}>
            <TextInput type="number" value={rf.redditoLordoAnnuo || ""} placeholder="30000" prefix="€" onChange={(e) => set({ redditoLordoAnnuo: e.target.value })} />
          </div>
          {stimaStorico && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, padding: "8px 10px", backgroundColor: C.bg, border: `1px solid ${C.panelBorder}`, borderRadius: 6 }}>
              <TrendingUp size={13} color={C.green} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: C.textFaint, lineHeight: 1.4, flex: 1 }}>
                Dallo storico che hai importato ({stimaStorico.numMonths} mesi con dati): circa <strong style={{ color: C.paper }}>{stimaStorico.annualEstimate.toFixed(0)}€/anno</strong>.
              </span>
              <button onClick={() => set({ redditoLordoAnnuo: String(Math.round(stimaStorico.annualEstimate)) })} style={{ background: "none", border: `1px solid ${C.brass}`, borderRadius: 999, padding: "3px 9px", fontSize: 10.5, color: C.brass, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                usa
              </button>
            </div>
          )}
        </div>

        {tipo === "forfettario" ? (
          <>
            <div>
              <FieldLabel>Coefficiente di redditività (dipende dal codice ATECO)</FieldLabel>
              <div style={{ marginTop: 4 }}>
                <TextInput type="number" value={rf.coefficienteRedditivita ?? 78} suffix="%" onChange={(e) => set({ coefficienteRedditivita: e.target.value })} />
              </div>
              <p style={{ fontSize: 11, color: C.textFainter, marginTop: 4, lineHeight: 1.4 }}>78% è comune per molte attività professionali/intellettuali — il tuo codice ATECO potrebbe averne uno diverso.</p>
            </div>
            <div>
              <FieldLabel>Aliquota imposta sostitutiva</FieldLabel>
              <div style={{ marginTop: 4 }}>
                <TextInput type="number" value={rf.aliquotaImposta ?? 15} suffix="%" onChange={(e) => set({ aliquotaImposta: e.target.value })} />
              </div>
              <p style={{ fontSize: 11, color: C.textFainter, marginTop: 4, lineHeight: 1.4 }}>15% standard, 5% nei primi 5 anni se rispetti i requisiti da "nuova attività".</p>
            </div>
          </>
        ) : (
          <p style={{ fontSize: 11.5, color: C.textFainter, lineHeight: 1.5 }}>
            Scaglioni IRPEF 2026 usati per la stima: 23% fino a 28.000€, 33% da 28.001€ a 50.000€, 43% oltre. Non include addizionali regionali/comunali né detrazioni.
          </p>
        )}

        <div>
          <FieldLabel>Contributi INPS (gestione separata, se non hai una cassa dedicata)</FieldLabel>
          <div style={{ marginTop: 4 }}>
            <TextInput type="number" value={rf.inpsPct ?? 26.07} suffix="%" onChange={(e) => set({ inpsPct: e.target.value })} />
          </div>
        </div>

        <div>
          <FieldLabel>Costo commercialista annuo</FieldLabel>
          <div style={{ marginTop: 4 }}>
            <TextInput type="number" value={rf.costoCommercialista || ""} placeholder="1200" prefix="€" onChange={(e) => set({ costoCommercialista: e.target.value })} />
          </div>
        </div>

        <div>
          <FieldLabel>Ore lavorate stimate all'anno (opzionale, per la tariffa oraria netta)</FieldLabel>
          <div style={{ marginTop: 4 }}>
            <TextInput type="number" value={rf.oreLavorateAnnue || ""} placeholder="1500" suffix="h" onChange={(e) => set({ oreLavorateAnnue: e.target.value })} />
          </div>
        </div>

        {redditoLordo > 0 && (
          <PunchTicket style={{ borderRadius: 8, padding: 18, marginBottom: 20 }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", color: C.textDim, marginBottom: 10 }}>Il tuo netto stimato</div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12.5 }}>
              <span style={{ color: C.textDim }}>Contributi INPS</span>
              <span style={{ fontFamily: MONO_FONT, color: C.ink }}>-{contributiINPS.toFixed(0)}€</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12.5 }}>
              <span style={{ color: C.textDim }}>Imposte</span>
              <span style={{ fontFamily: MONO_FONT, color: C.ink }}>-{imposta.toFixed(0)}€</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, fontSize: 12.5 }}>
              <span style={{ color: C.textDim }}>Commercialista</span>
              <span style={{ fontFamily: MONO_FONT, color: C.ink }}>-{commercialista.toFixed(0)}€</span>
            </div>
            <div style={{ borderTop: "1px dashed #D9BE93", paddingTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Netto annuo</span>
                <span style={{ fontFamily: SERIF_FONT, fontSize: 26, fontWeight: 700, color: C.ink }}>{nettoAnnuo.toFixed(0)}€</span>
              </div>
              <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 2 }}>≈ {nettoMensile.toFixed(0)}€/mese</div>
              {tariffaOrariaNetta ? (
                <div style={{ fontSize: 12, color: C.green, fontWeight: 700, marginTop: 10 }}>
                  Tariffa oraria netta: {tariffaOrariaNetta.toFixed(2)}€/h
                </div>
              ) : null}
            </div>
          </PunchTicket>
        )}
      </div>
    </div>
  );
}

function SettingsScreen({ data, setData, onBack, onFullOnboarding, onOpenTransactions, onChangeUser, onOpenRegime, onOpenImport, onOpenImportPDF, onOpenGuida, onOpenLocked }) {
  const PERIOD_OPTIONS = [
    { id: "giorno", label: "Giorno", desc: "chiudi ogni giorno" },
    { id: "settimana", label: "Settimana", desc: "chiudi ogni settimana" },
    { id: "mese", label: "Mese", desc: "chiudi ogni mese" },
  ];

  const ACCOUNTS = [
    { id: "banca", label: "Conto bancario", desc: "Open Banking (PSD2)", icon: Landmark, connectable: true },
    { id: "revolut", label: "Revolut", desc: "stesso canale del conto bancario", icon: Landmark, connectable: true },
    { id: "paypal", label: "PayPal", desc: "login PayPal separato", icon: CreditCard, connectable: true },
    { id: "satispay", label: "Satispay", desc: "nessuna API pubblica disponibile", icon: HandCoins, connectable: false },
  ];

  const connectedAccounts = data.connectedAccounts || {};
  const toggleAccount = (id) => {
    setData({ ...data, connectedAccounts: { ...connectedAccounts, [id]: !connectedAccounts[id] } });
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 32 }}>
      <div style={{ padding: "8px 20px 4px 20px", display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}>
          <ChevronLeft size={20} color={C.textDim} />
        </button>
        <span style={{ fontSize: 12, color: C.textDim, fontFamily: MONO_FONT }}>Diario</span>
      </div>
      <ScreenHeader
        eyebrow="Preferenze"
        title="Impostazioni"
        right={
          <span style={{
            fontSize: 10, fontFamily: MONO_FONT, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase",
            padding: "4px 10px", borderRadius: 999,
            backgroundColor: ACTIVE_TIER === "elite" ? "#171717" : ACTIVE_TIER === "premium" ? "rgba(255,107,74,0.15)" : C.panelBorder,
            color: ACTIVE_TIER === "elite" ? "#F7F3EA" : ACTIVE_TIER === "premium" ? C.brass : C.textDim,
          }}>
            {ACTIVE_TIER === "elite" ? "Elite" : ACTIVE_TIER === "premium" ? "Premium" : "Free"}
          </span>
        }
      />

      <div style={{ padding: "0 20px" }}>
        <button
          id="tut-guida"
          onClick={onOpenGuida}
          style={{
            width: "100%", padding: "13px 14px", borderRadius: 8, border: `1px solid ${C.brass}`, backgroundColor: "rgba(255,107,74,0.08)",
            display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 22,
          }}
        >
          <HelpCircle size={18} color={C.brass} style={{ flexShrink: 0 }} />
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.paper }}>Guida all'uso</div>
            <div style={{ fontSize: 11, color: C.textFaint, marginTop: 1 }}>Un esempio semplice per ogni parte dell'app</div>
          </div>
        </button>

        {!hasTier("premium") && (
          <div style={{ backgroundColor: "#171717", borderRadius: 8, padding: "14px 16px", marginBottom: 22, textAlign: "center" }}>
            <div style={{ color: "#F7F3EA", fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>Sei sul piano Free</div>
            <p style={{ fontSize: 11.5, color: "#DED7C4", lineHeight: 1.5, margin: 0 }}>
              Con Premium sblocchi Calendario, Chiusura, il collegamento dei conti, l'import da file e il Simulatore completo.
            </p>
          </div>
        )}

        <div style={{ border: `1px dashed ${C.panelBorder}`, borderRadius: 8, padding: "12px 14px", marginBottom: 22 }}>
          <div style={{ fontSize: 10, fontFamily: MONO_FONT, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textFainter, marginBottom: 8 }}>
            Cambia fascia (solo per questo test)
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {["free", "premium", "elite"].map((t) => {
              const active = (data.tierOverride || TIER) === t;
              return (
                <button
                  key={t}
                  onClick={() => setData({ ...data, tierOverride: t })}
                  style={{
                    flex: 1, padding: "8px 0", borderRadius: 999, border: "none", cursor: "pointer",
                    backgroundColor: active ? C.brass : C.bg, color: active ? "#FFFFFF" : C.textDim,
                    fontSize: 11.5, fontWeight: 700, textTransform: "capitalize",
                  }}
                >
                  {t === "free" ? "Free" : t === "premium" ? "Premium" : "Elite"}
                </button>
              );
            })}
          </div>
          <p style={{ fontSize: 10.5, color: C.textFainter, lineHeight: 1.4, margin: "8px 0 0 0" }}>
            Non è un vero acquisto — serve solo per provare cosa vede ciascun piano. Resta impostata su questo telefono finché non la cambi di nuovo.
          </p>
        </div>

        {!KICKSTARTER_BUILD && (hasTier("premium") ? (
          <>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.textDim, fontFamily: MONO_FONT, marginBottom: 10 }}>Conti collegati</div>
            <p style={{ fontSize: 12, color: C.textFainter, lineHeight: 1.5, marginTop: 0, marginBottom: 12 }}>
              Collega i tuoi conti per ricevere le transazioni in automatico invece di inserirle a mano.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
              {ACCOUNTS.map((acc, i) => {
                const connected = !!connectedAccounts[acc.id];
                return (
                  <div key={acc.id} id={i === 0 ? "tut-bank-connect" : undefined} style={{ backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: C.panelBorder, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <acc.icon size={16} color={acc.connectable ? C.brass : C.textFaint} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: C.paper, fontSize: 13.5, fontWeight: 600 }}>{acc.label}</div>
                        <div style={{ color: C.textFaint, fontSize: 11, marginTop: 1 }}>{acc.desc}</div>
                      </div>
                      {acc.connectable ? (
                        <button
                          onClick={() => toggleAccount(acc.id)}
                          style={{
                            padding: "6px 12px", borderRadius: 999, fontSize: 11.5, fontFamily: MONO_FONT, fontWeight: 700, cursor: "pointer",
                            border: `1px solid ${connected ? C.green : C.brass}`,
                            backgroundColor: connected ? "rgba(124,179,66,0.12)" : "rgba(255,107,74,0.12)",
                            color: connected ? C.green : C.brass, flexShrink: 0,
                          }}
                        >
                          {connected ? "Collegato ✓" : "Collega"}
                        </button>
                      ) : (
                        <span style={{ fontSize: 10, fontFamily: MONO_FONT, color: C.textFaint, border: `1px solid ${C.panelBorder}`, borderRadius: 999, padding: "4px 10px", flexShrink: 0 }}>
                          manuale
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={onOpenTransactions}
              style={{
                width: "100%", padding: "12px 0", borderRadius: 4, border: `1px solid ${C.brass}`, backgroundColor: "rgba(255,107,74,0.08)",
                color: C.brass, fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12,
              }}
            >
              <BarChart3 size={15} /> Vedi rendiconto transazioni
            </button>
          </>
        ) : (
          <button
            onClick={() => onOpenLocked("conti")}
            style={{
              width: "100%", padding: "13px 14px", borderRadius: 8, border: `1px solid ${C.panelBorder}`, background: "none",
              display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 24, opacity: 0.65,
            }}
          >
            <div style={{ position: "relative", flexShrink: 0 }}>
              <Landmark size={18} color={C.textFaint} />
              <Lock size={9} color={C.textFainter} style={{ position: "absolute", bottom: -3, right: -4, backgroundColor: C.panel, borderRadius: "50%", padding: 1 }} />
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.textDim }}>Conti collegati e Rendiconto</div>
              <div style={{ fontSize: 11, color: C.textFainter, marginTop: 1 }}>Premium · tocca per saperne di più</div>
            </div>
          </button>
        ))}

        {KICKSTARTER_BUILD ? (
          <div style={{ width: "100%", padding: "12px 14px", borderRadius: 4, border: `1px dashed ${C.panelBorder}`, marginBottom: 24, display: "flex", alignItems: "center", gap: 10 }}>
            <Clock size={14} color={C.textFainter} style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, color: C.textDim, fontWeight: 600 }}>Anche i tuoi file, presto, diventeranno ore</div>
              <div style={{ fontSize: 11, color: C.textFainter, marginTop: 1, lineHeight: 1.4 }}>La stessa conversione da soldi a tempo, ma per tutto quello che hai già speso — in arrivo</div>
            </div>
          </div>
        ) : !hasTier("premium") ? (
          <button
            onClick={() => onOpenLocked("import")}
            style={{ width: "100%", padding: "13px 14px", borderRadius: 8, border: `1px solid ${C.panelBorder}`, background: "none", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 24, opacity: 0.65 }}
          >
            <div style={{ position: "relative", flexShrink: 0 }}>
              <ArrowRight size={16} color={C.textFaint} style={{ transform: "rotate(-90deg)" }} />
              <Lock size={9} color={C.textFainter} style={{ position: "absolute", bottom: -3, right: -4, backgroundColor: C.panel, borderRadius: "50%", padding: 1 }} />
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.textDim }}>Importa spese da file</div>
              <div style={{ fontSize: 11, color: C.textFainter, marginTop: 1 }}>Premium · tocca per saperne di più</div>
            </div>
          </button>
        ) : (
          <>
            <button
              id="tut-import-csv"
              onClick={onOpenImport}
              style={{
                width: "100%", padding: "12px 0", borderRadius: 4, border: `1px solid ${C.panelBorder}`, background: "none",
                color: C.textDim, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10,
              }}
            >
              <ArrowRight size={14} color={C.brass} style={{ transform: "rotate(-90deg)" }} /> Importa spese da file (CSV/Excel)
            </button>

            <button
              onClick={onOpenImportPDF}
              style={{
                width: "100%", padding: "12px 0", borderRadius: 4, border: `1px solid ${C.panelBorder}`, background: "none",
                color: C.textDim, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10,
              }}
            >
              <ArrowRight size={14} color={C.brass} style={{ transform: "rotate(-90deg)" }} /> Importa spese da file (PDF)
            </button>
          </>
        )}

        {hasTier("premium") && (
        <button
          onClick={() => exportCalendarioCSV(data.calendario || {})}
          disabled={!data.calendario || Object.keys(data.calendario).length === 0}
          style={{
            width: "100%", padding: "12px 0", borderRadius: 4, border: `1px solid ${C.panelBorder}`, background: "none",
            color: !data.calendario || Object.keys(data.calendario).length === 0 ? C.textFainter : C.textDim, fontSize: 13, fontWeight: 600,
            cursor: !data.calendario || Object.keys(data.calendario).length === 0 ? "default" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 24,
          }}
        >
          <ArrowRight size={14} color={C.brass} style={{ transform: "rotate(90deg)" }} /> Scarica il tuo storico (CSV)
        </button>
        )}

        {hasTier("premium") ? (
        <>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.textDim, fontFamily: MONO_FONT, marginBottom: 10 }}>Ogni quanto chiudere il periodo</div>
        <p style={{ fontSize: 12, color: C.textFainter, lineHeight: 1.5, marginTop: 0, marginBottom: 12 }}>
          Determina la cadenza di Resoconto e Chiusura: quanto spesso rivedi i dati e distribuisci il risparmio tra i tuoi obiettivi.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
          {PERIOD_OPTIONS.map((opt) => {
            const active = data.closurePeriod === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setData({ ...data, closurePeriod: opt.id })}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                  padding: "14px 16px", borderRadius: 4, cursor: "pointer",
                  backgroundColor: active ? "rgba(255,107,74,0.1)" : C.panel,
                  border: `1px solid ${active ? C.brass : C.panelBorder}`,
                }}
              >
                <div style={{ textAlign: "left" }}>
                  <div style={{ color: active ? C.brass : C.paper, fontSize: 14, fontWeight: 700 }}>{opt.label}</div>
                  <div style={{ color: C.textFaint, fontSize: 11.5, marginTop: 2 }}>{opt.desc}</div>
                </div>
                {active ? (
                  <div style={{ width: 20, height: 20, borderRadius: "50%", backgroundColor: C.brass, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 12, color: C.ink, fontWeight: 800 }}>✓</span>
                  </div>
                ) : (
                  <div style={{ width: 20, height: 20, borderRadius: "50%", border: `1px solid ${C.panelBorder}`, flexShrink: 0 }} />
                )}
              </button>
            );
          })}
        </div>
        </>
        ) : (
          <button
            onClick={() => onOpenLocked("chiusura")}
            style={{ width: "100%", padding: "13px 14px", borderRadius: 8, border: `1px solid ${C.panelBorder}`, background: "none", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 24, opacity: 0.65 }}
          >
            <div style={{ position: "relative", flexShrink: 0 }}>
              <HandCoins size={18} color={C.textFaint} />
              <Lock size={9} color={C.textFainter} style={{ position: "absolute", bottom: -3, right: -4, backgroundColor: C.panel, borderRadius: "50%", padding: 1 }} />
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.textDim }}>Periodo di chiusura</div>
              <div style={{ fontSize: 11, color: C.textFainter, marginTop: 1 }}>Premium · tocca per saperne di più</div>
            </div>
          </button>
        )}

        <button
          onClick={onFullOnboarding}
          style={{ width: "100%", padding: "12px 0", borderRadius: 4, border: `1px dashed #DED7C4`, background: "none", color: C.textFainter, fontSize: 13, cursor: "pointer" }}
        >
          Modifica reddito, spese fisse e obiettivi iniziali
        </button>

        {data.redditoTipo === "variabile" && hasTier("elite") && (
          <button
            onClick={onOpenRegime}
            style={{ width: "100%", padding: "12px 0", borderRadius: 4, border: `1px dashed #DED7C4`, background: "none", color: C.textFainter, fontSize: 13, cursor: "pointer", marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <Calculator size={14} /> Regime fiscale e calcolo del netto
          </button>
        )}
        {data.redditoTipo === "variabile" && !hasTier("elite") && (
          <button
            onClick={() => onOpenLocked("regime")}
            style={{ width: "100%", padding: "13px 14px", borderRadius: 8, border: `1px solid ${C.panelBorder}`, background: "none", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginTop: 10, opacity: 0.65 }}
          >
            <div style={{ position: "relative", flexShrink: 0 }}>
              <Calculator size={16} color={C.textFaint} />
              <Lock size={9} color={C.textFainter} style={{ position: "absolute", bottom: -3, right: -4, backgroundColor: C.panel, borderRadius: "50%", padding: 1 }} />
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.textDim }}>Regime fiscale e calcolo del netto</div>
              <div style={{ fontSize: 11, color: C.textFainter, marginTop: 1 }}>Elite · tocca per saperne di più</div>
            </div>
          </button>
        )}

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${C.panelBorder}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: supabaseConfigured ? C.green : C.textFainter, display: "inline-block" }} />
            <span style={{ fontSize: 11.5, color: C.textFaint }}>
              {supabaseConfigured ? "I dati si salvano automaticamente online" : "Salvataggio online non ancora collegato — dati solo su questo dispositivo"}
            </span>
          </div>
          <button
            onClick={onChangeUser}
            style={{ width: "100%", padding: "12px 0", borderRadius: 4, border: `1px solid ${C.panelBorder}`, background: "none", color: C.textDim, fontSize: 13, cursor: "pointer" }}
          >
            Cambia utente
          </button>
        </div>
      </div>
    </div>
  );
}

function GoalDetailScreen({ goal, profile, hourly, onBack }) {
  const { nome, importo, saved, mesi } = goal;
  const [period, setPeriod] = useState("mese");
  const pct = importo ? Math.min((saved / importo) * 100, 100) : 0;
  const remainingEuro = Math.max(importo - saved, 0);
  const remainingHours = remainingEuro / hourly;

  if (!mesi) {
    // Obiettivo senza scadenza: nessun target periodico, solo stato libero
    return (
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 96 }}>
        <div style={{ padding: "8px 20px 4px 20px", display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}>
            <ChevronLeft size={20} color={C.textDim} />
          </button>
          <span style={{ fontSize: 12, color: C.textDim, fontFamily: MONO_FONT }}>Tutti i budget</span>
        </div>
        <ScreenHeader eyebrow="Budget libero · senza scadenza" title={nome || "Obiettivo"} />

        <div style={{ padding: "0 20px" }}>
          <PunchTicket style={{ borderRadius: 4, padding: 16, border: "1px solid #E2DAC5" }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.textDim, fontFamily: MONO_FONT, marginBottom: 6 }}>Accumulato</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
              <div style={{ fontFamily: MONO_FONT, fontSize: 32, fontWeight: 800 }}>{saved.toFixed(0)}€</div>
              <div style={{ fontFamily: MONO_FONT, fontSize: 14, color: C.textFaint }}>/ {importo.toFixed(0)}€</div>
            </div>
            <div style={{ height: 8, backgroundColor: "#E2DAC5", borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
              <div style={{ height: "100%", backgroundColor: C.brass, width: `${pct}%` }} />
            </div>
            <div style={{ fontSize: 12, color: C.textFaint }}>{pct.toFixed(0)}% del percorso · {remainingHours.toFixed(0)}h ({remainingEuro.toFixed(0)}€) ancora da mettere via</div>
          </PunchTicket>
        </div>

        <div style={{ padding: "0 20px", marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 16, borderRadius: 4, backgroundColor: C.panel, border: `1px solid ${C.panelBorder}` }}>
            <PiggyBank size={16} color={C.brass} style={{ marginTop: 2, flexShrink: 0 }} />
            <p style={{ fontSize: 13, color: C.paper, margin: 0, lineHeight: 1.5 }}>
              Nessuna scadenza impostata: niente target da rispettare. A fine settimana, dal Report, decidi tu quanto e se destinare a questo obiettivo — anche zero, anche tutto il budget libero.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Obiettivo con scadenza: target periodico selezionabile
  const monthlyTarget = importo / Number(mesi || 12);
  const periodTarget = monthlyTarget / PERIOD_DIVISORS[period];
  const periodTargetHours = periodTarget / hourly;

  const freeMonthly = freeMonthlyMargin(profile);
  const otherGoalsMonthly = profile.goals.filter((g) => g.mesi && g.id !== goal.id).reduce((s, g) => s + g.importo / g.mesi, 0);
  const combinedMonthlyTarget = monthlyTarget + otherGoalsMonthly;
  const overBudget = combinedMonthlyTarget > freeMonthly;
  const tight = !overBudget && combinedMonthlyTarget > freeMonthly * 0.6;

  const monthlyPace = [
    { mese: "Mag", risparmiato: 172 },
    { mese: "Giu", risparmiato: 158 },
    { mese: "Lug", risparmiato: 140 },
    { mese: "Ago", risparmiato: 150 },
  ];
  const avgPace = monthlyPace.reduce((s, m) => s + m.risparmiato, 0) / monthlyPace.length;
  const paceDeltaEuro = avgPace - monthlyTarget;
  const onTrack = paceDeltaEuro >= 0;
  const maxPace = Math.max(...monthlyPace.map((m) => m.risparmiato), monthlyTarget);

  return (
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 96 }}>
      <div style={{ padding: "8px 20px 4px 20px", display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}>
          <ChevronLeft size={20} color={C.textDim} />
        </button>
        <span style={{ fontSize: 12, color: C.textDim, fontFamily: MONO_FONT }}>Tutti i budget</span>
      </div>
      <ScreenHeader eyebrow={`Scadenza: ${mesi} mesi`} title={nome || "Obiettivo"} />

      <div style={{ padding: "0 20px" }}>
        <PunchTicket style={{ borderRadius: 4, padding: 16, border: "1px solid #E2DAC5" }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.textDim, fontFamily: MONO_FONT, marginBottom: 6 }}>Accumulato</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
            <div style={{ fontFamily: MONO_FONT, fontSize: 32, fontWeight: 800 }}>{saved.toFixed(0)}€</div>
            <div style={{ fontFamily: MONO_FONT, fontSize: 14, color: C.textFaint }}>/ {importo.toFixed(0)}€</div>
          </div>
          <div style={{ height: 8, backgroundColor: "#E2DAC5", borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
            <div style={{ height: "100%", backgroundColor: C.brass, width: `${pct}%` }} />
          </div>
          <div style={{ fontSize: 12, color: C.textFaint }}>{pct.toFixed(0)}% del percorso completato</div>
        </PunchTicket>
      </div>

      <div style={{ padding: "0 20px", marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: 14 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", color: C.textDim, fontFamily: MONO_FONT, marginBottom: 6 }}>Ti mancano</div>
          <div style={{ fontFamily: MONO_FONT, fontSize: 20, fontWeight: 800, color: C.paper }}>{remainingHours.toFixed(0)}h</div>
          <div style={{ fontFamily: MONO_FONT, fontSize: 12, color: C.textFaint }}>{remainingEuro.toFixed(0)}€</div>
        </div>
        <div style={{ backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", color: C.textDim, fontFamily: MONO_FONT }}>Target</span>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              style={{ backgroundColor: "transparent", border: "none", color: C.brass, fontFamily: MONO_FONT, fontSize: 10, outline: "none", colorScheme: "dark" }}
            >
              <option value="giorno" style={{ backgroundColor: C.panel, color: C.paper }}>giorno</option>
              <option value="settimana" style={{ backgroundColor: C.panel, color: C.paper }}>settimana</option>
              <option value="mese" style={{ backgroundColor: C.panel, color: C.paper }}>mese</option>
            </select>
          </div>
          <div style={{ fontFamily: MONO_FONT, fontSize: 20, fontWeight: 800, color: C.paper }}>{periodTargetHours.toFixed(1)}h</div>
          <div style={{ fontFamily: MONO_FONT, fontSize: 12, color: C.textFaint }}>{periodTarget.toFixed(0)}€ {PERIOD_LABELS[period]}</div>
        </div>
      </div>

      {(overBudget || tight) ? (
        <div style={{ padding: "0 20px", marginTop: 16 }}>
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 10, padding: 16, borderRadius: 4,
            backgroundColor: overBudget ? "rgba(225,74,46,0.1)" : "rgba(255,107,74,0.1)",
            border: `1px solid ${overBudget ? C.rust : C.brass}`,
          }}>
            <span style={{ fontSize: 15, marginTop: -1 }}>{overBudget ? "⚠" : "!"}</span>
            <p style={{ fontSize: 13, color: C.paper, margin: 0, lineHeight: 1.5 }}>
              {overBudget ? (
                <>Non è realistico: servono <strong>{monthlyTarget.toFixed(0)}€/mese</strong>
                {otherGoalsMonthly > 0 ? <> ({combinedMonthlyTarget.toFixed(0)}€/mese contando anche gli altri obiettivi con scadenza)</> : null}, ma dopo stipendio e spese fisse ti restano solo <strong>{Math.max(freeMonthly, 0).toFixed(0)}€/mese</strong> liberi. Allunga la scadenza o riduci l'importo.</>
              ) : (
                <>Fattibile, ma stretto: questo obiettivo{otherGoalsMonthly > 0 ? " (insieme agli altri con scadenza)" : ""} assorbe la maggior parte dei {Math.max(freeMonthly, 0).toFixed(0)}€/mese che ti restano liberi.</>
              )}
            </p>
          </div>
        </div>
      ) : null}

      <div style={{ padding: "0 20px", marginTop: 20 }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.textDim, fontFamily: MONO_FONT, marginBottom: 10 }}>Ritmo di accumulo mensile</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 110, backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "12px 12px 10px 12px", position: "relative" }}>
          <div style={{ position: "absolute", left: 12, right: 12, bottom: `${18 + (monthlyTarget / maxPace) * 58}px`, borderTop: `1px dashed ${C.brass}`, opacity: 0.6 }} />
          {monthlyPace.map((m, i) => {
            const h = Math.max((m.risparmiato / maxPace) * 58, 4);
            const below = m.risparmiato < monthlyTarget;
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                <div style={{ width: "100%", maxWidth: 28, height: h, borderRadius: 2, backgroundColor: below ? C.rust : C.green, opacity: 0.85 }} />
                <span style={{ fontSize: 10, color: C.textFaint, fontFamily: MONO_FONT }}>{m.mese}</span>
                <span style={{ fontSize: 9, color: C.textFaint, fontFamily: MONO_FONT, opacity: 0.8 }}>{m.risparmiato}€</span>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
          <span style={{ width: 14, height: 1, borderTop: `1px dashed ${C.brass}`, display: "inline-block" }} />
          <span style={{ fontSize: 11, color: C.textFainter }}>target necessario: {monthlyTarget.toFixed(0)}€/mese</span>
        </div>
      </div>

      <div style={{ padding: "0 20px", marginTop: 16 }}>
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10, padding: 16, borderRadius: 4,
          backgroundColor: onTrack ? "rgba(124,179,66,0.1)" : "rgba(225,74,46,0.08)",
          border: `1px solid ${onTrack ? C.green : C.rust}`,
        }}>
          {onTrack ? <TrendingDown size={16} color={C.green} style={{ transform: "rotate(180deg)", marginTop: 2, flexShrink: 0 }} /> : <TrendingDown size={16} color={C.rust} style={{ marginTop: 2, flexShrink: 0 }} />}
          <p style={{ fontSize: 13, color: C.paper, margin: 0, lineHeight: 1.5 }}>
            {onTrack ? (
              <>Stai risparmiando <strong>{avgPace.toFixed(0)}€/mese</strong> in media, sopra il target di {monthlyTarget.toFixed(0)}€. A questo ritmo arrivi <strong>in anticipo</strong>.</>
            ) : (
              <>Stai risparmiando <strong>{avgPace.toFixed(0)}€/mese</strong> in media, sotto il target di {monthlyTarget.toFixed(0)}€. A questo ritmo l'obiettivo <strong>slitta di qualche settimana</strong>.</>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function GoalListScreen({ goals, profile, hourly, onSelect, onAddGoal }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ tipo: "obiettivo", nome: "", importo: "", hasDeadline: true, mesi: "12", saved: "" });
  const atFreeLimit = !hasTier("premium") && goals.length >= 1;

  const freeMonthly = freeMonthlyMargin(profile);
  const existingMonthlyCommitted = goals.filter((g) => g.mesi).reduce((s, g) => s + Math.max(g.importo - (g.saved || 0), 0) / g.mesi, 0);
  const remainingToSave = Math.max((Number(form.importo) || 0) - (Number(form.saved) || 0), 0);
  const newMonthlyTarget = form.hasDeadline && form.importo && form.mesi ? remainingToSave / Number(form.mesi) : 0;
  const totalMonthlyIfAdded = existingMonthlyCommitted + newMonthlyTarget;
  const overBudget = form.hasDeadline && newMonthlyTarget > 0 && totalMonthlyIfAdded > freeMonthly;
  const tight = form.hasDeadline && newMonthlyTarget > 0 && !overBudget && totalMonthlyIfAdded > freeMonthly * 0.6;
  const isRiserva = form.tipo === "riserva";

  const submit = () => {
    if (!form.nome || !form.importo) return;
    onAddGoal({ tipo: form.tipo, nome: form.nome, importo: Number(form.importo), mesi: form.hasDeadline ? (Number(form.mesi) || 12) : null, saved: Number(form.saved) || 0 });
    setForm({ tipo: "obiettivo", nome: "", importo: "", hasDeadline: true, mesi: "12", saved: "" });
    setShowAdd(false);
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 96, position: "relative" }}>
      <ScreenHeader
        eyebrow={hasTier("premium") ? `${goals.length} budget attivi` : `${goals.length} di 1 obiettivo (piano Free)`}
        title="Budget"
        right={
          <button
            onClick={() => setShowAdd(true)}
            style={{ width: 34, height: 34, borderRadius: "50%", backgroundColor: C.brass, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <Plus size={18} color={C.ink} strokeWidth={2.5} />
          </button>
        }
      />
      <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        {goals.length === 0 ? (
          <div style={{ color: C.textFaint, fontSize: 13, fontStyle: "italic", padding: "24px 0", textAlign: "center", border: `1px dashed ${C.panelBorder}`, borderRadius: 4 }}>
            Nessun obiettivo impostato ancora — tocca "+" per aggiungerne uno
          </div>
        ) : (
          goals.map((g) => {
            const pct = g.importo ? Math.min((g.saved / g.importo) * 100, 100) : 0;
            return (
              <button
                key={g.id}
                onClick={() => onSelect(g.id)}
                style={{ width: "100%", textAlign: "left", cursor: "pointer", backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: 16 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", backgroundColor: C.panelBorder, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {g.tipo === "riserva" ? <Landmark size={15} color={C.brass} /> : <PiggyBank size={15} color={C.brass} />}
                  </div>
                  <span style={{ color: C.paper, fontWeight: 700, fontSize: 15, flex: 1 }}>{g.nome}</span>
                  {g.tipo === "riserva" ? (
                    <span style={{ fontSize: 9, fontFamily: MONO_FONT, color: C.textFaint, border: `1px solid ${C.panelBorder}`, borderRadius: 999, padding: "2px 8px" }}>riserva</span>
                  ) : !g.mesi ? (
                    <span style={{ fontSize: 9, fontFamily: MONO_FONT, color: C.textFaint, border: `1px solid ${C.panelBorder}`, borderRadius: 999, padding: "2px 8px" }}>libero</span>
                  ) : null}
                  <ChevronLeft size={16} color={C.textDim} style={{ transform: "rotate(180deg)" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontFamily: MONO_FONT, fontSize: 11, color: C.textFainter }}>{g.saved.toFixed(0)}€ / {g.tipo === "riserva" ? "min " : ""}{g.importo.toFixed(0)}€</span>
                  <span style={{ fontFamily: MONO_FONT, fontSize: 11, color: C.textFainter }}>{pct.toFixed(0)}%</span>
                </div>
                <div style={{ height: 6, backgroundColor: C.panelBorder, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", backgroundColor: C.brass, width: `${pct}%` }} />
                </div>
              </button>
            );
          })
        )}
      </div>

      {showAdd && atFreeLimit && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.8)" }} onClick={() => setShowAdd(false)} />
          <div style={{ position: "relative", backgroundColor: C.panel, borderTop: `1px solid #DED7C4`, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "24px 20px 32px 20px", textAlign: "center" }}>
            <div style={{ width: 40, height: 4, backgroundColor: "#DED7C4", borderRadius: 4, margin: "0 auto 20px auto" }} />
            <PiggyBank size={28} color={C.brass} style={{ marginBottom: 10 }} />
            <div style={{ color: C.paper, fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Il piano Free include 1 obiettivo</div>
            <p style={{ fontSize: 13, color: C.textFaint, lineHeight: 1.5, marginBottom: 20 }}>
              Con Premium puoi tenerne quanti vuoi in parallelo — un viaggio, un fondo di sicurezza, un acquisto, tutti insieme.
            </p>
            <button onClick={() => setShowAdd(false)} style={{ width: "100%", padding: "12px 0", borderRadius: 6, border: `1px solid ${C.panelBorder}`, background: "none", color: C.textDim, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Ho capito
            </button>
          </div>
        </div>
      )}

      {showAdd && !atFreeLimit && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.8)" }} onClick={() => setShowAdd(false)} />
          <div style={{ position: "relative", backgroundColor: C.panel, borderTop: `1px solid #DED7C4`, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "16px 20px 32px 20px", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ width: 40, height: 4, backgroundColor: "#DED7C4", borderRadius: 4, margin: "0 auto 16px auto" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ color: C.paper, fontWeight: 700, fontSize: 15 }}>Nuovo obiettivo</span>
              <button onClick={() => setShowAdd(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} color={C.textDim} /></button>
            </div>

            <div style={{ display: "flex", gap: 6, backgroundColor: C.bg, border: `1px solid ${C.panelBorder}`, borderRadius: 999, padding: 4, marginBottom: 16 }}>
              <button
                onClick={() => setForm({ ...form, tipo: "obiettivo" })}
                style={{ flex: 1, padding: "8px 0", borderRadius: 999, border: "none", cursor: "pointer", backgroundColor: !isRiserva ? C.brass : "transparent", color: !isRiserva ? "#FFFFFF" : C.textFaint, fontSize: 12, fontWeight: 700 }}
              >
                Obiettivo
              </button>
              <button
                onClick={() => setForm({ ...form, tipo: "riserva" })}
                style={{ flex: 1, padding: "8px 0", borderRadius: 999, border: "none", cursor: "pointer", backgroundColor: isRiserva ? C.brass : "transparent", color: isRiserva ? "#FFFFFF" : C.textFaint, fontSize: 12, fontWeight: 700 }}
              >
                Riserva minima
              </button>
            </div>
            {isRiserva && (
              <p style={{ fontSize: 11.5, color: C.textFaint, lineHeight: 1.5, margin: "-8px 0 14px 0" }}>
                Per una cifra da non scendere mai sotto (es. fondo emergenza): imposti la soglia minima, quanto hai adesso dopo un eventuale prelievo, ed entro quando vuoi tornare a quella soglia.
              </p>
            )}

            <div style={{ marginBottom: 4 }}><FieldLabel>Nome</FieldLabel></div>
            <input
              type="text" value={form.nome} placeholder={isRiserva ? "es. Fondo emergenza" : "es. Nuovo scooter"}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px", color: C.paper, fontSize: 14, marginTop: 4, marginBottom: 12, outline: "none" }}
            />
            <div style={{ marginBottom: 4 }}><FieldLabel>{isRiserva ? "Cifra minima da mantenere €" : "Importo €"}</FieldLabel></div>
            <input
              type="number" value={form.importo} placeholder={isRiserva ? "10000" : "2000"}
              onChange={(e) => setForm({ ...form, importo: e.target.value })}
              style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px", color: C.paper, fontSize: 14, marginTop: 4, marginBottom: 12, outline: "none" }}
            />
            <div style={{ marginBottom: 4 }}><FieldLabel>{isRiserva ? "Quanto hai adesso, dopo il prelievo (opzionale)" : "Quanto hai già messo da parte (opzionale)"}</FieldLabel></div>
            <input
              type="number" value={form.saved} placeholder="0"
              onChange={(e) => setForm({ ...form, saved: e.target.value })}
              style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px", color: C.paper, fontSize: 14, marginTop: 4, marginBottom: 16, outline: "none" }}
            />

            <button
              onClick={() => setForm({ ...form, hasDeadline: !form.hasDeadline })}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", padding: 0, marginBottom: form.hasDeadline ? 12 : 16, cursor: "pointer" }}
            >
              <span style={{ color: C.paper, fontSize: 13, fontWeight: 600 }}>{isRiserva ? "Imposta una scadenza per il recupero" : "Imposta una scadenza"}</span>
              <div style={{ width: 38, height: 20, borderRadius: 999, backgroundColor: form.hasDeadline ? C.brass : "#DED7C4", position: "relative", transition: "background-color 0.15s" }}>
                <div style={{ position: "absolute", top: 2, left: form.hasDeadline ? 20 : 2, width: 16, height: 16, borderRadius: "50%", backgroundColor: C.ink, transition: "left 0.15s" }} />
              </div>
            </button>

            {form.hasDeadline ? (
              <div style={{ marginBottom: 16 }}>
                <FieldLabel>Mesi</FieldLabel>
                <input
                  type="number" value={form.mesi} placeholder="12"
                  onChange={(e) => setForm({ ...form, mesi: e.target.value })}
                  style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px", color: C.paper, fontSize: 14, marginTop: 4, outline: "none" }}
                />
                {newMonthlyTarget > 0 ? (
                  <div style={{
                    display: "flex", alignItems: "flex-start", gap: 8, marginTop: 10, padding: "10px 12px", borderRadius: 4,
                    backgroundColor: overBudget ? "rgba(225,74,46,0.1)" : tight ? "rgba(255,107,74,0.1)" : "rgba(124,179,66,0.1)",
                    border: `1px solid ${overBudget ? C.rust : tight ? C.brass : C.green}`,
                  }}>
                    <span style={{ fontSize: 13, marginTop: -1 }}>{overBudget ? "⚠" : tight ? "!" : "✓"}</span>
                    <p style={{ fontSize: 12, color: C.paper, margin: 0, lineHeight: 1.5 }}>
                      {isRiserva ? "Per tornare alla soglia minima ti servono" : "Richiede"} <strong>{newMonthlyTarget.toFixed(0)}€/mese</strong>.{" "}
                      {overBudget ? (
                        <>Col reddito e le spese fisse che hai inserito ti restano solo <strong>{Math.max(freeMonthly, 0).toFixed(0)}€/mese</strong> liberi{existingMonthlyCommitted > 0 ? `, già impegnati per ${existingMonthlyCommitted.toFixed(0)}€/mese da altri obiettivi` : ""} — non è realistico così com'è. Allunga la scadenza o riduci l'importo.</>
                      ) : tight ? (
                        <>Ti restano {Math.max(freeMonthly, 0).toFixed(0)}€/mese liberi: fattibile, ma assorbe la maggior parte del margine.</>
                      ) : (
                        <>Sostenibile rispetto ai {Math.max(freeMonthly, 0).toFixed(0)}€/mese che ti restano liberi.</>
                      )}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: C.textFaint, lineHeight: 1.5, margin: "0 0 16px 0" }}>
                {isRiserva ? "Senza scadenza niente ritmo di recupero fisso: deciderai tu quanto rimettere, dalla schermata Report." : "Senza scadenza niente target periodici: a fine settimana deciderai tu quanto destinarci, dalla schermata Report."}
              </p>
            )}

            <button onClick={submit} style={{ width: "100%", padding: "12px 0", borderRadius: 4, border: "none", backgroundColor: C.brass, color: C.ink, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              Aggiungi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function GoalScreen({ profile, hourly, onAddGoal }) {
  const [selectedId, setSelectedId] = useState(null);
  const selectedGoal = profile.goals.find((g) => g.id === selectedId) || null;

  if (selectedGoal) {
    return <GoalDetailScreen goal={selectedGoal} profile={profile} hourly={hourly} onBack={() => setSelectedId(null)} />;
  }
  return <GoalListScreen goals={profile.goals} profile={profile} hourly={hourly} onSelect={setSelectedId} onAddGoal={onAddGoal} />;
}

function SimulatoreScreen({ hourly }) {
  const [modo, setModo] = useState(hasTier("premium") ? "finanziato" : "cash"); // finanziato | cash | paypal3
  const [prezzo, setPrezzo] = useState(1000);
  const [rata, setRata] = useState(95);
  const [numRate, setNumRate] = useState(14);
  const [inputFinanziato, setInputFinanziato] = useState("rata"); // rata | tasso
  const [tasso, setTasso] = useState(9.9); // TAN annuo %

  const oreCash = prezzo / hourly;

  // Se si conosce il tasso (TAN annuo) invece della rata, la calcoliamo con la
  // formula standard di ammortamento francese (piano a rate costanti).
  const rataDaTasso = (() => {
    const i = (Number(tasso) || 0) / 100 / 12; // tasso mensile
    const n = Number(numRate) || 0;
    if (n <= 0) return 0;
    if (i === 0) return prezzo / n;
    return (prezzo * i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
  })();
  const rataEffettiva = inputFinanziato === "tasso" ? rataDaTasso : rata;

  let costoTotale, interessi, rataMostrata, numRateMostrate;
  if (modo === "cash") {
    costoTotale = prezzo;
    interessi = 0;
    rataMostrata = prezzo;
    numRateMostrate = 1;
  } else if (modo === "paypal3") {
    costoTotale = prezzo;
    interessi = 0;
    rataMostrata = prezzo / 3;
    numRateMostrate = 3;
  } else {
    costoTotale = rataEffettiva * numRate;
    interessi = costoTotale - prezzo;
    rataMostrata = rataEffettiva;
    numRateMostrate = numRate;
  }

  const oreReali = costoTotale / hourly;
  const oreDiff = oreReali - oreCash;

  const MODES = [
    { id: "cash", label: "Cash subito" },
    { id: "paypal3", label: "3 rate PayPal" },
    ...(hasTier("premium") ? [{ id: "finanziato", label: "Finanziamento" }] : []),
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 96 }}>
      <ScreenHeader eyebrow="Prima di firmare" title="Simulatore" />
      <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 6, backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 999, padding: 4 }}>
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setModo(m.id)}
              style={{
                flex: 1, padding: "8px 6px", borderRadius: 999, border: "none", cursor: "pointer",
                backgroundColor: modo === m.id ? C.brass : "transparent",
                color: modo === m.id ? C.ink : C.textFaint,
                fontSize: 11.5, fontWeight: 700, fontFamily: MONO_FONT,
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
        {!hasTier("premium") && (
          <p style={{ fontSize: 11, color: C.textFainter, textAlign: "center", margin: "-8px 0 0 0" }}>
            Con Premium confronti anche i finanziamenti a rate, con il calcolo degli interessi in ore.
          </p>
        )}

        <div style={{ backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <FieldLabel>Prezzo oggetto</FieldLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, borderBottom: "1px solid #DED7C4", paddingBottom: 4 }}>
              <span style={{ color: C.brass, fontFamily: MONO_FONT, fontSize: 20 }}>€</span>
              <input type="number" value={prezzo} onChange={(e) => setPrezzo(Number(e.target.value))}
                style={{ backgroundColor: "transparent", color: C.paper, fontFamily: MONO_FONT, fontSize: 20, width: "100%", border: "none", outline: "none" }} />
            </div>
          </div>

          {modo === "finanziato" && (
            <>
              <div style={{ display: "flex", gap: 6, backgroundColor: C.bg, border: `1px solid ${C.panelBorder}`, borderRadius: 999, padding: 4 }}>
                <button
                  onClick={() => setInputFinanziato("rata")}
                  style={{ flex: 1, padding: "7px 6px", borderRadius: 999, border: "none", cursor: "pointer", backgroundColor: inputFinanziato === "rata" ? C.brass : "transparent", color: inputFinanziato === "rata" ? "#FFFFFF" : C.textFaint, fontSize: 11, fontWeight: 700 }}
                >
                  Conosco la rata
                </button>
                <button
                  onClick={() => setInputFinanziato("tasso")}
                  style={{ flex: 1, padding: "7px 6px", borderRadius: 999, border: "none", cursor: "pointer", backgroundColor: inputFinanziato === "tasso" ? C.brass : "transparent", color: inputFinanziato === "tasso" ? "#FFFFFF" : C.textFaint, fontSize: 11, fontWeight: 700 }}
                >
                  Conosco il tasso
                </button>
              </div>

              {inputFinanziato === "rata" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <FieldLabel>Rata/mese</FieldLabel>
                    <input type="number" value={rata} onChange={(e) => setRata(Number(e.target.value))}
                      style={{ backgroundColor: "transparent", color: C.paper, fontFamily: MONO_FONT, fontSize: 16, width: "100%", border: "none", borderBottom: "1px solid #DED7C4", outline: "none", marginTop: 4, paddingBottom: 4 }} />
                  </div>
                  <div>
                    <FieldLabel>N. rate</FieldLabel>
                    <input type="number" value={numRate} onChange={(e) => setNumRate(Number(e.target.value))}
                      style={{ backgroundColor: "transparent", color: C.paper, fontFamily: MONO_FONT, fontSize: 16, width: "100%", border: "none", borderBottom: "1px solid #DED7C4", outline: "none", marginTop: 4, paddingBottom: 4 }} />
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <FieldLabel>Tasso annuo (TAN) %</FieldLabel>
                      <input type="number" value={tasso} onChange={(e) => setTasso(Number(e.target.value))}
                        style={{ backgroundColor: "transparent", color: C.paper, fontFamily: MONO_FONT, fontSize: 16, width: "100%", border: "none", borderBottom: "1px solid #DED7C4", outline: "none", marginTop: 4, paddingBottom: 4 }} />
                    </div>
                    <div>
                      <FieldLabel>N. rate</FieldLabel>
                      <input type="number" value={numRate} onChange={(e) => setNumRate(Number(e.target.value))}
                        style={{ backgroundColor: "transparent", color: C.paper, fontFamily: MONO_FONT, fontSize: 16, width: "100%", border: "none", borderBottom: "1px solid #DED7C4", outline: "none", marginTop: 4, paddingBottom: 4 }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: C.textFaint, display: "flex", justifyContent: "space-between" }}>
                    <span>Rata calcolata</span>
                    <span style={{ fontFamily: MONO_FONT, color: C.paper, fontWeight: 700 }}>{rataDaTasso.toFixed(2)}€/mese</span>
                  </div>
                  <p style={{ fontSize: 11, color: C.textFainter, lineHeight: 1.4, margin: 0 }}>
                    Trovi il TAN nel documento del finanziamento — è il tasso di interesse puro, diverso dal TAEG che include anche le spese.
                  </p>
                </>
              )}
            </>
          )}

          {modo === "cash" && (
            <div style={{ fontSize: 12, color: C.textFaint, lineHeight: 1.5 }}>
              Pagamento unico, oggi. Nessuna rata da seguire.
            </div>
          )}

          {modo === "paypal3" && (
            <div style={{ fontSize: 12, color: C.textFaint, lineHeight: 1.5 }}>
              3 rate mensili uguali, senza interessi: {(prezzo / 3).toFixed(0)}€ al mese.
            </div>
          )}
        </div>

        <PunchTicket style={{ borderRadius: 4, padding: 16, border: "1px solid #E2DAC5" }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.textDim, fontFamily: MONO_FONT, marginBottom: 12 }}>Il costo reale</div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: C.textFaint }}>
              {modo === "finanziato" ? "Costo totale finanziamento" : modo === "paypal3" ? "Costo totale (3 rate)" : "Costo totale"}
            </span>
            <span style={{ fontFamily: MONO_FONT, fontSize: 18, fontWeight: 800 }}>{costoTotale.toFixed(0)}€</span>
          </div>

          {modo === "paypal3" && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: C.textFaint }}>{numRateMostrate} rate da</span>
              <span style={{ fontFamily: MONO_FONT, fontSize: 14, color: C.paper }}>{rataMostrata.toFixed(0)}€/mese</span>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: C.textFaint }}>di cui interessi</span>
            {interessi > 0 ? (
              <span style={{ fontFamily: MONO_FONT, fontSize: 14, color: C.rust }}>+{interessi.toFixed(0)}€</span>
            ) : (
              <span style={{ fontFamily: MONO_FONT, fontSize: 13, color: C.green, fontWeight: 700 }}>zero</span>
            )}
          </div>

          <div style={{ borderTop: "1px dashed #DED7C4", paddingTop: 16 }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.textFaint, fontFamily: MONO_FONT, marginBottom: 4 }}>Il tuo tempo</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <div style={{ fontFamily: MONO_FONT, fontSize: 30, fontWeight: 800 }}>{Math.round(oreReali)}h</div>
              <div style={{ fontFamily: MONO_FONT, fontSize: 15, color: C.textFaint }}>≈ {euroToDaysHours(costoTotale, hourly)}</div>
            </div>
            {modo === "finanziato" ? (
              <div style={{ fontSize: 12, color: C.textDim, marginTop: 4 }}>
                vs {Math.round(oreCash)}h se pagato subito — <span style={{ color: C.rust, fontWeight: 700 }}>{Math.round(oreDiff)}h in più</span> per gli interessi
              </div>
            ) : modo === "paypal3" ? (
              <div style={{ fontSize: 12, color: C.green, marginTop: 4 }}>
                stesse ore del pagamento cash, solo divise in 3 tranche da {(oreCash / 3).toFixed(1)}h ciascuna
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.textDim, marginTop: 4 }}>
                nessun costo aggiuntivo: paghi esattamente il prezzo di oggi
              </div>
            )}
          </div>
        </PunchTicket>

        {modo === "finanziato" && oreDiff > 0 && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", borderRadius: 4, backgroundColor: C.panel, border: `1px solid ${C.panelBorder}` }}>
            <TriangleAlert size={14} color={C.rust} style={{ marginTop: 1, flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, color: C.textFaint, lineHeight: 1.5 }}>
              Confrontalo con "3 rate PayPal" o "Cash subito" qui sopra: potresti evitare {Math.round(oreDiff)}h di lavoro in più.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function UserPickerScreen({ onSelect }) {
  const [name, setName] = useState("");
  const [knownUsers, setKnownUsers] = useState([]);
  const [loading, setLoading] = useState(supabaseConfigured);

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase
      .from("orelibere_users")
      .select("name")
      .order("updated_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setKnownUsers(data.map((r) => r.name));
        setLoading(false);
      });
  }, []);

  const confirm = (chosenName) => {
    const trimmed = chosenName.trim();
    if (!trimmed) return;
    onSelect(trimmed);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: 32 }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontFamily: DISPLAY_FONT, fontSize: 24, color: C.paper, marginBottom: 6 }}>Chi sei?</div>
        <div style={{ fontSize: 13, color: C.textDim, lineHeight: 1.5 }}>
          Scegli il tuo nome se l'hai già usata, o scrivine uno nuovo. Servirà a ritrovare i tuoi dati la prossima volta.
        </div>
      </div>

      {!supabaseConfigured && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", borderRadius: 4, backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, marginBottom: 20 }}>
          <TriangleAlert size={14} color={C.brassDim} style={{ marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, color: C.textFaint, lineHeight: 1.5 }}>
            Il salvataggio online non è ancora collegato: per ora i dati restano solo su questo dispositivo.
          </span>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", color: C.textFaint, fontSize: 13 }}>Carico...</div>
      ) : (
        <>
          {knownUsers.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 20 }}>
              {knownUsers.map((u) => (
                <button
                  key={u}
                  onClick={() => confirm(u)}
                  style={{ padding: "10px 18px", borderRadius: 999, border: `1px solid ${C.panelBorder}`, backgroundColor: C.panel, color: C.paper, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                >
                  {u}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirm(name)}
              placeholder="Scrivi il tuo nome"
              style={{ flex: 1, backgroundColor: C.inputBg, color: C.paper, border: `1px solid ${C.panelBorder}`, borderRadius: 8, padding: "12px 14px", fontSize: 15, outline: "none" }}
            />
            <button
              onClick={() => confirm(name)}
              disabled={!name.trim()}
              style={{ padding: "12px 16px", borderRadius: 8, border: "none", backgroundColor: name.trim() ? C.brass : C.panelBorder, color: C.ink, fontWeight: 700, cursor: name.trim() ? "pointer" : "default" }}
            >
              <ArrowRight size={18} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function MainApp({ currentUser, onChangeUser }) {
  const [onboarded, setOnboarded] = useState(false);
  const [welcomeDone, setWelcomeDone] = useState(false);
  const [tutorialDone, setTutorialDone] = useState(true); // true di default: chi torna con onboarding già fatto non deve rivederlo
  const [tutorialStep, setTutorialStep] = useState(0);
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    stipendio: "", oreSettimana: "40",
    fixedList: [], // niente preset: ogni tester parte da zero e inserisce le proprie spese fisse
    goals: [], // nessun obiettivo demo: si imposta nel Passo 3 dell'onboarding
    closurePeriod: "settimana", // giorno | settimana | mese
    carryOver: 0, // quanto non è stato allocato nell'ultima chiusura, si somma al prossimo periodo
    connectedAccounts: {}, // { banca: true, revolut: false, paypal: true }
    calendario: {}, // turni/entrate/uscite per data, principalmente per redditi variabili
    progetti: [], // progetti con prezzo di vendita e ore, per calcolare la tariffa oraria reale per lavoro
    fatture: [], // fatture/pagamenti in attesa, collegate a giorni di lavoro: arancio finché non pagate, verde dopo
    tierOverride: null, // "free"|"premium"|"elite"|null — cambio fascia per i tester, sovrascrive TIER solo per questo utente
    regimeFiscale: {}, // parametri fiscali (forfettario/ordinario) per stimare il netto
  });

  // Aggiorna la fascia attiva per QUESTO render — deve succedere prima che qualsiasi
  // componente figlio chiami hasTier(), altrimenti vedrebbero il valore vecchio.
  ACTIVE_TIER = data.tierOverride || TIER;

  const [cloudLoaded, setCloudLoaded] = useState(!supabaseConfigured);
  const [syncError, setSyncError] = useState(null);
  const saveTimer = useRef(null);
  const frameRef = useRef(null); // per misurare la posizione reale dei pulsanti nel tutorial

  const [tab, setTab] = useState("diario");
  const [addOpen, setAddOpen] = useState(false);
  const [bankTx, setBankTx] = useState(null); // transazione simulata in attesa
  const [categorizeOpen, setCategorizeOpen] = useState(false);
  const [txFeed, setTxFeed] = useState(null); // elenco transazioni del Rendiconto, persistente tra i cambi di tab
  const [entries, setEntries] = useState([]); // nessuna spesa demo: si parte da un diario vuoto

  // Carica i dati salvati per questo utente (se il salvataggio online è collegato)
  useEffect(() => {
    if (!supabaseConfigured) return;
    let cancelled = false;
    supabase
      .from("orelibere_users")
      .select("data, entries, tx_feed, onboarded")
      .eq("name", currentUser)
      .maybeSingle()
      .then(({ data: row, error }) => {
        if (cancelled) return;
        if (error) {
          setSyncError("Caricamento: " + error.message);
        } else if (row) {
          if (row.data) setData(row.data);
          if (row.entries) setEntries(row.entries);
          if (row.tx_feed) setTxFeed(row.tx_feed);
          if (row.onboarded) setOnboarded(true);
        }
        setCloudLoaded(true);
      });
    return () => { cancelled = true; };
  }, [currentUser]);

  // Salva automaticamente su Supabase, con un piccolo ritardo per non scrivere ad ogni singola modifica
  useEffect(() => {
    if (!supabaseConfigured || !cloudLoaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      supabase
        .from("orelibere_users")
        .upsert(
          { name: currentUser, data, entries, tx_feed: txFeed, onboarded, updated_at: new Date().toISOString() },
          { onConflict: "name" }
        )
        .then(({ error }) => {
          setSyncError(error ? "Salvataggio: " + error.message : null);
        });
    }, 1200);
    return () => clearTimeout(saveTimer.current);
  }, [data, entries, txFeed, onboarded, cloudLoaded, currentUser]);

  const frameStyle = {
    position: "relative", width: 380, height: 780, background: `radial-gradient(circle at 50% 0%, #FFFFFF 0%, ${C.bg} 55%, ${C.outerBg} 100%)`,
    borderRadius: 36, overflow: "hidden", border: `4px solid ${C.panelBorder}`,
    boxShadow: "0 25px 60px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column",
  };
  const outerStyle = { minHeight: "100vh", backgroundColor: C.outerBg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, colorScheme: "light" };
  const tutorialSteps = buildTutorialSteps(data.redditoTipo === "variabile");

  const finishOnboarding = () => {
    setOnboarded(true);
    setTutorialDone(false); // subito dopo il primo onboarding, mostra il tutorial guidato una volta
    setTutorialStep(0);
    setTab(tutorialSteps[0].tab);
  };

  const advanceTutorial = () => {
    const nextStep = tutorialStep + 1;
    if (nextStep >= tutorialSteps.length) {
      setTutorialDone(true);
      setTab("diario");
    } else {
      setTutorialStep(nextStep);
      setTab(tutorialSteps[nextStep].tab);
    }
  };

  const skipTutorial = () => {
    setTutorialDone(true);
    setTab("diario");
  };

  if (!cloudLoaded) {
    return (
      <div style={outerStyle}>
        <div style={{ ...frameStyle, alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: C.textFaint, fontSize: 13, fontFamily: MONO_FONT }}>Carico i tuoi dati...</span>
        </div>
      </div>
    );
  }

  if (!onboarded) {
    if (!welcomeDone) {
      return (
        <div style={outerStyle}>
          <div style={frameStyle}>
            <WelcomeScreen onStart={() => setWelcomeDone(true)} />
          </div>
        </div>
      );
    }
    const steps = [
      <OnboardingIncome data={data} setData={setData} onNext={() => setStep(1)} />,
      <OnboardingFixed data={data} setData={setData} onNext={() => setStep(2)} onBack={() => setStep(0)} />,
      <OnboardingGoal data={data} setData={setData} onNext={finishOnboarding} onBack={() => setStep(1)} />,
    ];
    return (
      <div style={outerStyle}>
        <div style={frameStyle}>
          {syncError && (
            <div style={{ position: "absolute", top: 8, left: 8, right: 8, zIndex: 90, backgroundColor: C.rust, color: "#fff", borderRadius: 8, padding: "10px 12px", fontSize: 11.5, lineHeight: 1.4, display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{ flex: 1 }}>⚠ Sincronizzazione: {syncError}</span>
              <button onClick={() => setSyncError(null)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontWeight: 700, padding: 0 }}>✕</button>
            </div>
          )}
          {steps[step]}
        </div>
      </div>
    );
  }

  const estimatedHourlyRate = data.redditoTipo === "variabile" && data.usaOraria
    ? tariffaOrariaLordaDa(data) * ((Number(data.percentualeNetta) || 100) / 100)
    : (Number(data.stipendio) / 4.33) / Number(data.oreSettimana);
  const realRateInfo = data.redditoTipo === "variabile" && hasTier("elite") ? computeRealRate(data.calendario) : { ready: false };
  const hourlyRate = realRateInfo.ready ? realRateInfo.rate : estimatedHourlyRate;
  // Il reddito mensile "spendibile" va spalmato sui mesi realmente lavorati (se sono meno di 12) —
  // la tariffa oraria invece NO, resta quella vera di quando si lavora, altrimenti risulterebbe
  // artificialmente bassa e le spese sembrerebbero costare meno ore di quanto costino davvero.
  const mesiFrazione = data.redditoTipo === "variabile" ? Math.min(Math.max(Number(data.mesiLavorati) || 12, 1), 12) / 12 : 1;
  const monthlyIncomeQuandoLavora = data.redditoTipo === "variabile" && data.usaOraria
    ? estimatedHourlyRate * (Number(data.oreSettimana) || 0) * 4.33
    : Number(data.stipendio) || 0;
  const derivedMonthlyIncome = monthlyIncomeQuandoLavora * mesiFrazione;
  const profile = { hourlyRate, monthlyIncome: derivedMonthlyIncome, fixedList: data.fixedList, goals: data.goals, closurePeriod: data.closurePeriod, carryOver: data.carryOver };

  const addToGoalSaved = (goalId, amount) => {
    setData((d) => ({
      ...d,
      goals: d.goals.map((g) => (g.id === goalId ? { ...g, saved: g.saved + amount } : g)),
    }));
  };

  const addGoal = (newGoal) => {
    setData((d) => ({ ...d, goals: [...d.goals, { id: Date.now(), saved: 0, ...newGoal }] }));
  };

  const setCarryOver = (amount) => {
    setData((d) => ({ ...d, carryOver: amount }));
  };

  const { pool: closurePool } = computeClosurePool(profile, hourlyRate);

  const connectedAccounts = data.connectedAccounts || {};
  const hasAnyAccountConnected = !KICKSTARTER_BUILD && Object.values(connectedAccounts).some(Boolean);
  // Genera il feed una sola volta, la prima volta che serve, così resta stabile tra i cambi di tab
  if (hasAnyAccountConnected && txFeed === null) {
    setTxFeed(generateTransactionFeed(connectedAccounts));
  }
  const pendingTxCount = txFeed ? txFeed.length : 0;

  return (
    <div style={outerStyle}>
      <div style={frameStyle} ref={frameRef}>
        {!tutorialDone && <TutorialOverlay step={tutorialStep} steps={tutorialSteps} frameRef={frameRef} onNext={advanceTutorial} onFinish={skipTutorial} />}
        {syncError && (
          <div style={{ position: "absolute", top: 8, left: 8, right: 8, zIndex: 90, backgroundColor: C.rust, color: "#fff", borderRadius: 8, padding: "10px 12px", fontSize: 11.5, lineHeight: 1.4, display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{ flex: 1 }}>⚠ Sincronizzazione: {syncError}</span>
            <button onClick={() => setSyncError(null)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontWeight: 700, padding: 0 }}>✕</button>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 4px 20px" }}>
          <span style={{ fontFamily: MONO_FONT, fontSize: 11, color: C.textDim, letterSpacing: "0.15em" }}>ORELIBERE</span>
          <span style={{ fontFamily: MONO_FONT, fontSize: 11, color: C.textDim }}>09:41</span>
        </div>
        <div style={{ padding: "0 20px 12px 20px" }}>
          <span style={{ fontFamily: SERIF_FONT, fontStyle: "italic", fontWeight: 500, fontSize: 10.5, color: C.textFainter }}>
            I soldi vanno e vengono. Il tuo tempo no — scorre e basta.
          </span>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
          {tab === "diario" && (
            <DiarioScreen
              profile={profile}
              todayEntries={entries}
              onOpenAdd={() => setAddOpen(true)}
              onOpenSettings={() => setTab("settings")}
              onOpenReport={() => setTab("report")}
              onOpenGoal={() => setTab("goal")}
              onSimulateBankTx={() => setBankTx(generateFakeTransaction())}
              rateSource={data.redditoTipo === "variabile" ? (realRateInfo.ready ? "reale" : "stima") : null}
            />
          )}
          {tab === "sim" && <SimulatoreScreen hourly={hourlyRate} />}
          {tab === "calendario" && (
            <CalendarioScreen
              calendario={data.calendario || {}}
              setCalendario={(cal) => setData((d) => ({ ...d, calendario: cal }))}
              hourlyEstimate={hourlyRate}
              progetti={data.progetti || []}
              setProgetti={(list) => setData((d) => ({ ...d, progetti: list }))}
              redditoTipo={data.redditoTipo}
              fatture={data.fatture || []}
              setFatture={(list) => setData((d) => ({ ...d, fatture: list }))}
              regimeFiscale={data.regimeFiscale || {}}
            />
          )}
          {tab === "locked-calendario" && (
            <LockedFeatureScreen
              tier="premium"
              titolo="Calendario"
              descrizione="Pianifica le spese extra che sai già che arriveranno — una multa, il bollo auto, una gita — e (se hai reddito variabile) registra i tuoi turni di lavoro con promemoria sui pagamenti in attesa."
              onBack={() => setTab("diario")}
            />
          )}
          {tab === "locked-closure" && (
            <LockedFeatureScreen
              tier="premium"
              titolo="Chiusura"
              descrizione="A fine settimana o mese, decidi cosa fare del risparmio avanzato: lo metti in uno dei tuoi obiettivi, o lo lasci libero. Un piccolo rituale periodico per non perdere di vista dove va il tuo risparmio."
              onBack={() => setTab("diario")}
            />
          )}
          {tab === "locked-transactions" && (
            <LockedFeatureScreen
              tier="premium"
              titolo="Rendiconto"
              descrizione="Collega banca, Revolut o PayPal e ricevi le transazioni in automatico, pronte da categorizzare con un tocco invece di doverle scrivere a mano una per una."
              onBack={() => setTab("diario")}
            />
          )}
          {tab === "report" && <ReportScreen hourly={hourlyRate} profile={profile} onBack={() => setTab("diario")} onOpenClosure={() => setTab("closure")} />}
          {tab === "closure" && <ClosureScreen hourly={hourlyRate} profile={profile} onBack={() => setTab("report")} onAllocate={addToGoalSaved} onCarryOver={setCarryOver} />}
          {tab === "goal" && <GoalScreen profile={profile} hourly={hourlyRate} onAddGoal={addGoal} />}
          {tab === "settings" && <SettingsScreen data={data} setData={setData} onBack={() => setTab("diario")} onFullOnboarding={() => { setStep(0); setOnboarded(false); }} onOpenTransactions={() => setTab("transactions")} onChangeUser={onChangeUser} onOpenRegime={() => setTab("regime")} onOpenImport={() => setTab("importcsv")} onOpenImportPDF={() => setTab("importpdf")} onOpenGuida={() => setTab("guida")} onOpenLocked={(key) => setTab("locked-" + key)} />}
          {tab === "locked-conti" && (
            <LockedFeatureScreen
              tier="premium"
              titolo="Conti collegati e Rendiconto"
              descrizione="Collega banca, Revolut o PayPal e ricevi le transazioni in automatico, pronte da categorizzare con un tocco invece di doverle scrivere a mano una per una."
              onBack={() => setTab("settings")}
            />
          )}
          {tab === "locked-import" && (
            <LockedFeatureScreen
              tier="premium"
              titolo="Importa spese da file"
              descrizione="Carica il file CSV o Excel dei movimenti della tua banca: l'app li legge da sola e li trasforma in ore, invece di doverli inserire uno per uno a mano."
              onBack={() => setTab("settings")}
            />
          )}
          {tab === "locked-chiusura" && (
            <LockedFeatureScreen
              tier="premium"
              titolo="Periodo di chiusura"
              descrizione="Scegli ogni quanto rivedere i tuoi dati e distribuire il risparmio tra gli obiettivi — settimanale, mensile o come preferisci."
              onBack={() => setTab("settings")}
            />
          )}
          {tab === "locked-regime" && (
            <LockedFeatureScreen
              tier="elite"
              titolo="Regime fiscale e calcolo del netto"
              descrizione="Se hai partita IVA, stima quanto ti resta in tasca dopo tasse e contributi — e usa le tue aliquote vere per convertire automaticamente lordo in netto ovunque nell'app."
              onBack={() => setTab("settings")}
            />
          )}
          {tab === "regime" && <RegimeFiscaleScreen data={data} setData={setData} onBack={() => setTab("settings")} />}
          {tab === "guida" && <GuidaScreen onBack={() => setTab("settings")} redditoTipo={data.redditoTipo} />}
          {tab === "importcsv" && (
            <ImportEstrattoContoScreen
              calendario={data.calendario || {}}
              setCalendario={(cal) => setData((d) => ({ ...d, calendario: cal }))}
              onBack={() => setTab("settings")}
            />
          )}
          {tab === "importpdf" && (
            <ImportPDFScreen
              calendario={data.calendario || {}}
              setCalendario={(cal) => setData((d) => ({ ...d, calendario: cal }))}
              onBack={() => setTab("settings")}
            />
          )}
          {tab === "transactions" && (
            <TransactionsScreen
              hourly={hourlyRate}
              connectedAccounts={connectedAccounts}
              feed={txFeed || []}
              setFeed={setTxFeed}
              onBack={() => setTab("diario")}
              onOpenSettings={() => setTab("settings")}
              onCategorize={(e) => setEntries([e, ...entries])}
            />
          )}
          {addOpen && <AddSheet hourly={hourlyRate} onClose={() => setAddOpen(false)} onAdd={(e) => setEntries([e, ...entries])} />}
          {bankTx && !categorizeOpen && (
            <BankNotificationBanner tx={bankTx} onTap={() => setCategorizeOpen(true)} onDismiss={() => setBankTx(null)} />
          )}
          {bankTx && categorizeOpen && (
            <OneTapCategorizeSheet
              tx={bankTx}
              hourly={hourlyRate}
              onClose={() => { setCategorizeOpen(false); setBankTx(null); }}
              onConfirm={(e) => setEntries([e, ...entries])}
            />
          )}
        </div>
        {(tab === "diario" || tab === "goal" || tab === "sim" || tab === "closure" || tab === "transactions" || tab === "calendario" || tab === "locked-calendario" || tab === "locked-closure" || tab === "locked-transactions") && (
          <div id="tut-tabbar" style={{ borderTop: `1px solid ${C.panelBorder}`, backgroundColor: C.bg, display: "flex", alignItems: "center", justifyContent: "space-around", padding: "12px 6px" }}>
            <button onClick={() => setTab("diario")} style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <Home size={20} color={tab === "diario" ? C.brass : "#A6A29A"} />
              <span style={{ fontSize: 10, fontFamily: MONO_FONT, color: tab === "diario" ? C.brass : "#A6A29A" }}>Diario</span>
            </button>
            {hasTier("premium") ? (
              <button id="tut-tab-calendario" onClick={() => setTab("calendario")} style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <Calendar size={20} color={tab === "calendario" ? C.brass : "#A6A29A"} />
                <span style={{ fontSize: 10, fontFamily: MONO_FONT, color: tab === "calendario" ? C.brass : "#A6A29A" }}>Calendario</span>
              </button>
            ) : (
              <button onClick={() => setTab("locked-calendario")} style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", opacity: 0.5 }}>
                <div style={{ position: "relative" }}>
                  <Calendar size={20} color="#A6A29A" />
                  <Lock size={9} color={C.textFainter} style={{ position: "absolute", bottom: -2, right: -3, backgroundColor: C.bg, borderRadius: "50%", padding: 1 }} />
                </div>
                <span style={{ fontSize: 10, fontFamily: MONO_FONT, color: "#A6A29A" }}>Calendario</span>
              </button>
            )}
            <button id="tut-tab-sim" onClick={() => setTab("sim")} style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <Calculator size={20} color={tab === "sim" ? C.brass : "#A6A29A"} />
              <span style={{ fontSize: 10, fontFamily: MONO_FONT, color: tab === "sim" ? C.brass : "#A6A29A" }}>Simula</span>
            </button>
            <button id="tut-tab-goal" onClick={() => setTab("goal")} style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <PiggyBank size={20} color={tab === "goal" ? C.brass : "#A6A29A"} />
              <span style={{ fontSize: 10, fontFamily: MONO_FONT, color: tab === "goal" ? C.brass : "#A6A29A" }}>Budget</span>
            </button>
            {hasTier("premium") ? (
              closurePool > 0 && (
                <button id="tut-tab-closure" onClick={() => setTab("closure")} style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", position: "relative" }}>
                  <div style={{ position: "relative" }}>
                    <HandCoins size={20} color={tab === "closure" ? C.brass : "#A6A29A"} />
                    <span style={{ position: "absolute", top: -3, right: -4, width: 8, height: 8, borderRadius: "50%", backgroundColor: C.rust, border: `1.5px solid ${C.bg}` }} />
                  </div>
                  <span style={{ fontSize: 10, fontFamily: MONO_FONT, color: tab === "closure" ? C.brass : "#A6A29A" }}>Chiusura</span>
                </button>
              )
            ) : (
              <button onClick={() => setTab("locked-closure")} style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", opacity: 0.5 }}>
                <div style={{ position: "relative" }}>
                  <HandCoins size={20} color="#A6A29A" />
                  <Lock size={9} color={C.textFainter} style={{ position: "absolute", bottom: -2, right: -3, backgroundColor: C.bg, borderRadius: "50%", padding: 1 }} />
                </div>
                <span style={{ fontSize: 10, fontFamily: MONO_FONT, color: "#A6A29A" }}>Chiusura</span>
              </button>
            )}
            {hasTier("premium") ? (
              hasAnyAccountConnected && (
                <button onClick={() => setTab("transactions")} style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", position: "relative" }}>
                  <div style={{ position: "relative" }}>
                    <BarChart3 size={20} color={tab === "transactions" ? C.brass : "#A6A29A"} />
                    {pendingTxCount > 0 && (
                      <span style={{
                        position: "absolute", top: -6, right: -8, minWidth: 14, height: 14, borderRadius: 999, backgroundColor: C.brass,
                        border: `1.5px solid ${C.bg}`, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px",
                      }}>
                        <span style={{ fontSize: 8.5, fontFamily: MONO_FONT, color: C.ink, fontWeight: 800 }}>{pendingTxCount}</span>
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 10, fontFamily: MONO_FONT, color: tab === "transactions" ? C.brass : "#A6A29A" }}>Conti</span>
                </button>
              )
            ) : (
              <button onClick={() => setTab("locked-transactions")} style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", opacity: 0.5 }}>
                <div style={{ position: "relative" }}>
                  <BarChart3 size={20} color="#A6A29A" />
                  <Lock size={9} color={C.textFainter} style={{ position: "absolute", bottom: -2, right: -3, backgroundColor: C.bg, borderRadius: "50%", padding: 1 }} />
                </div>
                <span style={{ fontSize: 10, fontFamily: MONO_FONT, color: "#A6A29A" }}>Conti</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", backgroundColor: "#F7F3EA", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 380, backgroundColor: "#fff", border: "1px solid #E7E1D2", borderRadius: 12, padding: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#171717", marginBottom: 8 }}>Qualcosa è andato storto</div>
            <div style={{ fontSize: 12.5, color: "#6B6B68", lineHeight: 1.5, marginBottom: 14, wordBreak: "break-word" }}>
              {String(this.state.error && this.state.error.message ? this.state.error.message : this.state.error)}
            </div>
            <button
              onClick={() => { this.setState({ error: null }); }}
              style={{ padding: "10px 16px", borderRadius: 8, border: "none", backgroundColor: "#FF6B4A", color: "#171717", fontWeight: 700, cursor: "pointer" }}
            >
              Riprova
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppInner() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      return localStorage.getItem("orelibere_user") || null;
    } catch {
      return null;
    }
  });

  const handleSelectUser = (name) => {
    try {
      localStorage.setItem("orelibere_user", name);
    } catch {
      // storage non disponibile (es. navigazione privata): l'app funziona comunque,
      // semplicemente il nome andrà riscelto al prossimo avvio.
    }
    setCurrentUser(name);
  };

  const handleChangeUser = () => {
    try {
      localStorage.removeItem("orelibere_user");
    } catch {
      // vedi sopra
    }
    setCurrentUser(null);
  };

  const outerStyle = { minHeight: "100vh", backgroundColor: C.outerBg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, colorScheme: "light" };
  const frameStyle = {
    position: "relative", width: 380, height: 780, background: `radial-gradient(circle at 50% 0%, #FFFFFF 0%, ${C.bg} 55%, ${C.outerBg} 100%)`,
    borderRadius: 36, overflow: "hidden", border: `4px solid ${C.panelBorder}`,
    boxShadow: "0 25px 60px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column",
  };

  if (!currentUser) {
    return (
      <div style={outerStyle}>
        <div style={frameStyle}>
          <UserPickerScreen onSelect={handleSelectUser} />
        </div>
      </div>
    );
  }

  return <MainApp key={currentUser} currentUser={currentUser} onChangeUser={handleChangeUser} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
