import React, { useState, useEffect, useRef } from "react";
import * as Tone from "tone";
import { supabase, supabaseConfigured } from "./supabaseClient.js";
import {
  Home, Calculator, Plus, Coffee, UtensilsCrossed, Beer, Dumbbell, Car,
  MoreHorizontal, X, TrendingDown, Receipt, Zap, Building2, Fuel,
  Cigarette, Wifi, ArrowRight, Settings2, CreditCard, ShoppingBag, Gift, HeartPulse, BarChart3, ChevronLeft, Lightbulb, PiggyBank, Landmark, Bell, Info, HandCoins, ExternalLink, TriangleAlert
} from "lucide-react";

// ---- Design tokens (applied via inline style, NOT via bg-[#..] classes) ----
const C = {
  bg: "#FFF7ED",
  panel: "#FFFFFF",
  panelBorder: "#F0DFC7",
  inputBg: "#FFFBF4",
  ticket: "#FFF3D6",
  brass: "#FF9F5A",
  brassDim: "#E8823A",
  paper: "#3B2E22",
  ink: "#2A1F16",
  rust: "#FF6F6F",
  green: "#4FBE8D",
  textDim: "#9A8873",
  textFaint: "#BCA98C",
  textFainter: "#DACBAE",
  fixedBar: "#A6B7E8",
  outerBg: "#F3E7D6",
};

const DISPLAY_FONT = "'Archivo Black', system-ui, sans-serif";
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



function toMonthly(spesa) {
  if (spesa.frequenza === "giornaliera") return spesa.importo * 30;
  if (spesa.frequenza === "settimanale") return spesa.importo * 4.33;
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
  const totalMinutes = (euro / hourlyRate) * 60;
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
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

function PunchTicket({ children, style = {} }) {
  return (
    <div
      style={{
        backgroundColor: C.ticket,
        color: C.ink,
        backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 7px, rgba(59,46,34,0.05) 7px, rgba(59,46,34,0.05) 8px)",
        ...style,
      }}
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

// ===================== ONBOARDING =====================

function OnboardingIncome({ data, setData, onNext }) {
  const hourly = data.stipendio && data.oreSettimana ? (Number(data.stipendio) / 4.33) / Number(data.oreSettimana) : null;
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 20px 32px 20px" }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.brass, fontFamily: MONO_FONT, marginBottom: 4 }}>Passo 1 di 3</div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: C.paper, fontFamily: DISPLAY_FONT, margin: "0 0 4px 0" }}>Quanto vale il tuo tempo</h1>
      <p style={{ fontSize: 13, color: C.textFainter, marginBottom: 24 }}>Serve per convertire ogni spesa in ore di lavoro.</p>

      <div style={{ marginBottom: 6 }}><FieldLabel>Stipendio netto mensile</FieldLabel></div>
      <div style={{ marginBottom: 16 }}>
        <TextInput type="number" value={data.stipendio} placeholder="1500" prefix="€" big
          onChange={(e) => setData({ ...data, stipendio: e.target.value })} />
      </div>

      <div style={{ marginBottom: 6 }}><FieldLabel>Ore lavorate a settimana</FieldLabel></div>
      <div style={{ marginBottom: 16 }}>
        <TextInput type="number" value={data.oreSettimana} placeholder="40" suffix="h/sett" big
          onChange={(e) => setData({ ...data, oreSettimana: e.target.value })} />
      </div>

      {hourly ? (
        <PunchTicket style={{ borderRadius: 4, padding: 16 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.textDim, fontFamily: MONO_FONT, marginBottom: 4 }}>Il tuo tempo vale</div>
          <div style={{ fontFamily: MONO_FONT, fontSize: 24, fontWeight: 800 }}>{hourly.toFixed(2)}€/ora</div>
        </PunchTicket>
      ) : null}

      <div style={{ flex: 1 }} />
      <button
        onClick={onNext}
        disabled={!hourly}
        style={{
          width: "100%", padding: "14px 0", borderRadius: 4, border: "none",
          backgroundColor: hourly ? C.brass : "#D9BE93",
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
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.brass, fontFamily: MONO_FONT, marginBottom: 4 }}>Passo 2 di 3</div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: C.paper, fontFamily: DISPLAY_FONT, margin: "0 0 4px 0" }}>Spese fisse</h1>
      <p style={{ fontSize: 13, color: C.textFainter, marginBottom: 20 }}>Affitto, bollette, rate, abbonamenti: tutto ciò che parte da solo ogni mese.</p>

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
                <div style={{ color: C.textDim, fontSize: 11, fontFamily: MONO_FONT }}>{f.importo.toFixed(2)}€ / {f.frequenza === "mensile" ? "mese" : f.frequenza === "settimanale" ? "sett" : "giorno"}</div>
              </div>
              <button onClick={() => remove(f.id)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={15} color={C.textDim} /></button>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => setShowAdd(true)}
        style={{
          width: "100%", padding: "12px 0", borderRadius: 4, border: `1px dashed #D9BE93`, background: "none",
          color: C.textFainter, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 16, cursor: "pointer",
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
          <div style={{ position: "relative", backgroundColor: C.panel, borderTop: `1px solid #D9BE93`, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "16px 20px 32px 20px", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ width: 40, height: 4, backgroundColor: "#D9BE93", borderRadius: 4, margin: "0 auto 16px auto" }} />
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
  const [form, setForm] = useState({ nome: "", importo: "", hasDeadline: true, mesi: "12" });
  const goals = data.goals;

  const fixedMonthly = data.fixedList.reduce((s, f) => s + toMonthly(f), 0);
  const freeMonthly = (Number(data.stipendio) || 0) - fixedMonthly;
  const existingMonthlyCommitted = goals.filter((g) => g.mesi).reduce((s, g) => s + g.importo / g.mesi, 0);
  const newMonthlyTarget = form.hasDeadline && form.importo && form.mesi ? Number(form.importo) / Number(form.mesi) : 0;
  const totalMonthlyIfAdded = existingMonthlyCommitted + newMonthlyTarget;
  const overBudget = form.hasDeadline && newMonthlyTarget > 0 && totalMonthlyIfAdded > freeMonthly;
  const tight = form.hasDeadline && newMonthlyTarget > 0 && !overBudget && totalMonthlyIfAdded > freeMonthly * 0.6;

  const addGoal = () => {
    if (!form.nome || !form.importo) return;
    setData({ ...data, goals: [...goals, { id: Date.now(), nome: form.nome, importo: Number(form.importo), mesi: form.hasDeadline ? (Number(form.mesi) || 12) : null, saved: 0 }] });
    setForm({ nome: "", importo: "", hasDeadline: true, mesi: "12" });
    setShowAdd(false);
  };
  const remove = (id) => setData({ ...data, goals: goals.filter((g) => g.id !== id) });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 20px 32px 20px", position: "relative", overflowY: "auto" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, marginBottom: 12, alignSelf: "flex-start", cursor: "pointer" }}>← indietro</button>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.brass, fontFamily: MONO_FONT, marginBottom: 4 }}>Passo 3 di 3</div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: C.paper, fontFamily: DISPLAY_FONT, margin: "0 0 4px 0" }}>I tuoi obiettivi</h1>
      <p style={{ fontSize: 13, color: C.textFainter, marginBottom: 20 }}>Puoi avere più budget in parallelo — viaggio, fondo emergenza, quello che vuoi. Ogni spesa extra li farà slittare o avvicinare.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {goals.map((g) => (
          <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 12, backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", backgroundColor: C.panelBorder, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <PiggyBank size={15} color={C.brass} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: C.paper, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.nome}</div>
              <div style={{ color: C.textDim, fontSize: 11, fontFamily: MONO_FONT }}>{g.importo.toFixed(0)}€{g.mesi ? ` in ${g.mesi} mesi` : " · senza scadenza"}</div>
            </div>
            <button onClick={() => remove(g.id)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={15} color={C.textDim} /></button>
          </div>
        ))}
      </div>

      <button
        onClick={() => setShowAdd(true)}
        style={{ width: "100%", padding: "12px 0", borderRadius: 4, border: `1px dashed #D9BE93`, background: "none", color: C.textFainter, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 16, cursor: "pointer" }}
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
          <div style={{ position: "relative", backgroundColor: C.panel, borderTop: `1px solid #D9BE93`, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "16px 20px 32px 20px", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ width: 40, height: 4, backgroundColor: "#D9BE93", borderRadius: 4, margin: "0 auto 16px auto" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ color: C.paper, fontWeight: 700, fontSize: 15 }}>Nuovo obiettivo</span>
              <button onClick={() => setShowAdd(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} color={C.textDim} /></button>
            </div>
            <div style={{ marginBottom: 4 }}><FieldLabel>Nome</FieldLabel></div>
            <input
              type="text" value={form.nome} placeholder="es. Viaggio in Giappone"
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px", color: C.paper, fontSize: 14, marginTop: 4, marginBottom: 12, outline: "none" }}
            />
            <div style={{ marginBottom: 4 }}><FieldLabel>Importo €</FieldLabel></div>
            <input
              type="number" value={form.importo} placeholder="2000"
              onChange={(e) => setForm({ ...form, importo: e.target.value })}
              style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px", color: C.paper, fontSize: 14, marginTop: 4, marginBottom: 16, outline: "none" }}
            />

            <button
              onClick={() => setForm({ ...form, hasDeadline: !form.hasDeadline })}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", padding: 0, marginBottom: form.hasDeadline ? 12 : 16, cursor: "pointer" }}
            >
              <span style={{ color: C.paper, fontSize: 13, fontWeight: 600 }}>Imposta una scadenza</span>
              <div style={{ width: 38, height: 20, borderRadius: 999, backgroundColor: form.hasDeadline ? C.brass : "#D9BE93", position: "relative", transition: "background-color 0.15s" }}>
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
                    backgroundColor: overBudget ? "rgba(196,80,46,0.1)" : tight ? "rgba(201,162,39,0.1)" : "rgba(78,122,106,0.1)",
                    border: `1px solid ${overBudget ? C.rust : tight ? C.brass : C.green}`,
                  }}>
                    <span style={{ fontSize: 13, marginTop: -1 }}>{overBudget ? "⚠" : tight ? "!" : "✓"}</span>
                    <p style={{ fontSize: 12, color: C.paper, margin: 0, lineHeight: 1.5 }}>
                      Richiede <strong>{newMonthlyTarget.toFixed(0)}€/mese</strong>.{" "}
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
                Senza scadenza niente target periodici: a fine settimana deciderai tu quanto destinarci, dalla schermata Report.
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
        <span style={{ fontFamily: MONO_FONT, fontSize: 36, fontWeight: 800, letterSpacing: "-0.02em", color: over ? C.rust : C.ink }}>{spentHours.toFixed(1)}h</span>
        {hourly ? <span style={{ fontSize: 12, color: C.textDim, fontFamily: MONO_FONT, marginTop: 2 }}>≈ {(spentHours * hourly).toFixed(0)}€</span> : null}
      </div>
      <div style={{ position: "relative", width: "100%", height: 18, borderRadius: 999, backgroundColor: "rgba(59,46,34,0.08)", overflow: "hidden", display: "flex" }}>
        <div style={{ width: `${fixedPct}%`, backgroundColor: C.fixedBar, transition: "width 0.6s ease", borderRadius: 999 }} />
        <div style={{ width: `${extraPct}%`, backgroundColor: extraColor, transition: "width 0.6s ease, background-color 0.3s ease", borderRadius: 999, marginLeft: fixedPct > 0 && extraPct > 0 ? 3 : 0 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span style={{ fontSize: 10, color: C.textFainter, fontFamily: MONO_FONT }}>0h</span>
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
        padding: "10px 12px", boxShadow: "0 8px 24px rgba(59,46,34,0.18)",
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
      <div style={{ position: "relative", backgroundColor: C.panel, borderTop: `1px solid #D9BE93`, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "16px 20px 32px 20px" }}>
        <div style={{ width: 40, height: 4, backgroundColor: "#D9BE93", borderRadius: 4, margin: "0 auto 16px auto" }} />

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
                      backgroundColor: isSuggested ? "rgba(201,162,39,0.12)" : C.inputBg,
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
        <PunchTicket style={{ borderRadius: 4, padding: 16, border: "1px solid #E7C98A", marginBottom: 16 }}>
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

function DiarioScreen({ profile, todayEntries, onOpenAdd, onOpenSettings, onOpenReport, onOpenGoal, onSimulateBankTx }) {
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
            <button
              onClick={onSimulateBankTx}
              title="Demo: simula una notifica bancaria"
              style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: `1px solid ${C.panelBorder}`, borderRadius: 999, padding: "5px 10px", cursor: "pointer" }}
            >
              <Landmark size={13} color={C.brass} />
              <span style={{ fontSize: 10, fontFamily: MONO_FONT, color: C.textFaint }}>simula</span>
            </button>
            <button onClick={onOpenSettings} style={{ background: "none", border: "none", cursor: "pointer" }}><Settings2 size={18} color={C.textDim} /></button>
          </div>
        }
      />

      <div style={{ padding: "0 20px" }}>
        <PunchTicket style={{ borderRadius: 4, padding: "24px 16px", border: `1px solid #E7C98A` }}>
          <SpendingBar fixedHours={fixedHours} extraHours={extraHours} capHours={dailyHours} hourly={hourly} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 12, marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: C.fixedBar, display: "inline-block" }} />
              <span style={{ fontSize: 11, color: C.textFaint }}>Fisse {fixedHours.toFixed(1)}h <span style={{ opacity: 0.7 }}>({(fixedHours * hourly).toFixed(0)}€)</span></span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: C.brass, display: "inline-block" }} />
              <span style={{ fontSize: 11, color: C.textFaint }}>Extra {extraHours.toFixed(1)}h <span style={{ opacity: 0.7 }}>({(extraHours * hourly).toFixed(0)}€)</span></span>
            </div>
          </div>
          <div style={{ textAlign: "center", marginTop: 8 }}>
            {over ? (
              <p style={{ fontSize: 13, color: C.rust, fontWeight: 600, margin: 0 }}>Hai superato di {(spentHours - dailyHours).toFixed(1)}h il tuo tempo disponibile</p>
            ) : (
              <p style={{ fontSize: 13, color: C.green, fontWeight: 600, margin: 0 }}>Ti restano {remaining.toFixed(1)}h libere oggi, fisse già scalate</p>
            )}
          </div>
        </PunchTicket>
      </div>

      {primaryGoal ? (
        <div style={{ padding: "0 20px", marginTop: 20 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.textDim, fontFamily: MONO_FONT, marginBottom: 8 }}>
            Obiettivo principale{otherGoalsCount > 0 ? ` · +${otherGoalsCount} altri` : ""}
          </div>
          <button
            onClick={onOpenGoal}
            style={{ width: "100%", textAlign: "left", cursor: "pointer", backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: 16 }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ color: C.paper, fontWeight: 700, fontSize: 15 }}>{primaryGoal.nome}</span>
              <TrendingDown size={16} color={C.rust} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontFamily: MONO_FONT, fontSize: 11, color: C.textFainter }}>{primaryGoal.saved.toFixed(0)}€ / {primaryGoal.importo.toFixed(0)}€</span>
              <span style={{ fontFamily: MONO_FONT, fontSize: 11, color: C.textFainter }}>{(goalPct || 0).toFixed(0)}%</span>
            </div>
            <div style={{ height: 6, backgroundColor: C.panelBorder, borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
              <div style={{ height: "100%", backgroundColor: C.brass, width: `${goalPct || 0}%` }} />
            </div>
            <div style={{ fontSize: 11, color: C.textFainter }}>vai a tutti i budget →</div>
          </button>
        </div>
      ) : null}

      <div style={{ padding: "0 20px", marginTop: 20 }}>
        <button
          onClick={onOpenReport}
          style={{
            width: "100%", textAlign: "left", cursor: "pointer", border: `1px solid ${C.brass}`,
            backgroundColor: "rgba(201,162,39,0.08)", borderRadius: 4, padding: 16,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          }}
        >
          <div>
            <div style={{ color: C.paper, fontWeight: 700, fontSize: 14, marginBottom: 2 }}>La tua prima settimana è pronta</div>
            <div style={{ color: C.textFaint, fontSize: 12 }}>Guarda dove puoi migliorare →</div>
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
              const EntryIcon = (e.icon) || (CATEGORIES.find((c) => c.id === e.iconId)?.icon) || MoreHorizontal;
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
        onClick={onOpenAdd}
        style={{
          position: "fixed", bottom: 96, right: "calc(50% - 190px + 24px)",
          width: 56, height: 56, borderRadius: "50%", backgroundColor: C.brass, border: "none",
          display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 20px rgba(255,159,90,0.45)", cursor: "pointer",
        }}
      >
        <Plus size={26} color={C.ink} strokeWidth={2.5} />
      </button>
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
      <div style={{ position: "relative", backgroundColor: C.panel, borderTop: "1px solid #D9BE93", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "16px 20px 32px 20px", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ width: 40, height: 4, backgroundColor: "#D9BE93", borderRadius: 4, margin: "0 auto 16px auto" }} />
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
                  <button key={i} onClick={() => handleAmount(v)} style={{ padding: "8px 16px", borderRadius: 999, backgroundColor: C.panelBorder, color: C.paper, fontSize: 13, fontFamily: MONO_FONT, border: "1px solid #D9BE93", cursor: "pointer" }}>
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

      <div style={{ padding: "0 20px" }}>
        <PunchTicket style={{ borderRadius: 4, padding: 16, border: "1px solid #E7C98A" }}>
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
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 10, padding: "10px 12px", backgroundColor: "rgba(196,80,46,0.08)", border: `1px solid ${C.rust}`, borderRadius: 4 }}>
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
        <div style={{ backgroundColor: "rgba(201,162,39,0.08)", border: `1px solid ${C.brass}`, borderRadius: 4, padding: 16 }}>
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
            <PunchTicket style={{ borderRadius: 4, padding: 16, border: "1px solid #E7C98A", marginBottom: 14 }}>
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
                  <span style={{ color: C.textFainter }}>Assegnati {allocatedTotal}€ di {pool}€</span>
                  <span style={{ color: remaining < 0 ? C.rust : C.textFainter }}>{remaining < 0 ? `${Math.abs(remaining)}€ oltre il disponibile` : `${remaining}€ non assegnati`}</span>
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
                    backgroundColor: allocatedTotal > 0 && remaining >= 0 ? C.brass : "#D9BE93",
                    color: allocatedTotal > 0 && remaining >= 0 ? C.ink : C.textFaint,
                  }}
                >
                  Congela allocazione
                </button>
              </>
            ) : null}
          </>
        ) : (
          <div style={{ backgroundColor: "rgba(78,122,106,0.1)", border: `1px solid ${C.green}`, borderRadius: 4, padding: 16, display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ fontSize: 18, color: C.green, lineHeight: 1 }}>✓</span>
            <div style={{ fontSize: 13, color: C.paper, lineHeight: 1.6 }}>
              <strong>{allocatedTotal}€ congelati</strong> così:
              {profile.goals.filter((g) => Number(allocations[g.id]) > 0).map((g) => (
                <div key={g.id} style={{ fontFamily: MONO_FONT, fontSize: 12, color: C.textFainter, marginTop: 2 }}>• {g.nome}: {allocations[g.id]}€</div>
              ))}
              {pool - allocatedTotal > 0 ? (
                <div style={{ marginTop: 6, fontSize: 12, color: C.textFainter }}>
                  + <strong>{pool - allocatedTotal}€</strong> non assegnati: si aggiungono al prossimo periodo
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsScreen({ data, setData, onBack, onFullOnboarding, onOpenTransactions, onChangeUser }) {
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
      <ScreenHeader eyebrow="Preferenze" title="Impostazioni" />

      <div style={{ padding: "0 20px" }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.textDim, fontFamily: MONO_FONT, marginBottom: 10 }}>Conti collegati</div>
        <p style={{ fontSize: 12, color: C.textFainter, lineHeight: 1.5, marginTop: 0, marginBottom: 12 }}>
          Collega i tuoi conti per ricevere le transazioni in automatico invece di inserirle a mano.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
          {ACCOUNTS.map((acc) => {
            const connected = !!connectedAccounts[acc.id];
            return (
              <div key={acc.id} style={{ backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "12px 14px" }}>
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
                        backgroundColor: connected ? "rgba(78,122,106,0.12)" : "rgba(201,162,39,0.12)",
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
            width: "100%", padding: "12px 0", borderRadius: 4, border: `1px solid ${C.brass}`, backgroundColor: "rgba(201,162,39,0.08)",
            color: C.brass, fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 24,
          }}
        >
          <BarChart3 size={15} /> Vedi rendiconto transazioni
        </button>

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
                  backgroundColor: active ? "rgba(201,162,39,0.1)" : C.panel,
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

        <button
          onClick={onFullOnboarding}
          style={{ width: "100%", padding: "12px 0", borderRadius: 4, border: `1px dashed #D9BE93`, background: "none", color: C.textFainter, fontSize: 13, cursor: "pointer" }}
        >
          Modifica reddito, spese fisse e obiettivi iniziali
        </button>

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
          <PunchTicket style={{ borderRadius: 4, padding: 16, border: "1px solid #E7C98A" }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.textDim, fontFamily: MONO_FONT, marginBottom: 6 }}>Accumulato</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
              <div style={{ fontFamily: MONO_FONT, fontSize: 32, fontWeight: 800 }}>{saved.toFixed(0)}€</div>
              <div style={{ fontFamily: MONO_FONT, fontSize: 14, color: C.textFaint }}>/ {importo.toFixed(0)}€</div>
            </div>
            <div style={{ height: 8, backgroundColor: "#E7C98A", borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
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
        <PunchTicket style={{ borderRadius: 4, padding: 16, border: "1px solid #E7C98A" }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: C.textDim, fontFamily: MONO_FONT, marginBottom: 6 }}>Accumulato</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
            <div style={{ fontFamily: MONO_FONT, fontSize: 32, fontWeight: 800 }}>{saved.toFixed(0)}€</div>
            <div style={{ fontFamily: MONO_FONT, fontSize: 14, color: C.textFaint }}>/ {importo.toFixed(0)}€</div>
          </div>
          <div style={{ height: 8, backgroundColor: "#E7C98A", borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
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
            backgroundColor: overBudget ? "rgba(196,80,46,0.1)" : "rgba(201,162,39,0.1)",
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
          backgroundColor: onTrack ? "rgba(78,122,106,0.1)" : "rgba(196,80,46,0.08)",
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
  const [form, setForm] = useState({ nome: "", importo: "", hasDeadline: true, mesi: "12" });

  const freeMonthly = freeMonthlyMargin(profile);
  const existingMonthlyCommitted = goals.filter((g) => g.mesi).reduce((s, g) => s + g.importo / g.mesi, 0);
  const newMonthlyTarget = form.hasDeadline && form.importo && form.mesi ? Number(form.importo) / Number(form.mesi) : 0;
  const totalMonthlyIfAdded = existingMonthlyCommitted + newMonthlyTarget;
  const overBudget = form.hasDeadline && newMonthlyTarget > 0 && totalMonthlyIfAdded > freeMonthly;
  const tight = form.hasDeadline && newMonthlyTarget > 0 && !overBudget && totalMonthlyIfAdded > freeMonthly * 0.6;

  const submit = () => {
    if (!form.nome || !form.importo) return;
    onAddGoal({ nome: form.nome, importo: Number(form.importo), mesi: form.hasDeadline ? (Number(form.mesi) || 12) : null });
    setForm({ nome: "", importo: "", hasDeadline: true, mesi: "12" });
    setShowAdd(false);
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 96, position: "relative" }}>
      <ScreenHeader
        eyebrow={`${goals.length} budget attivi`}
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
                    <PiggyBank size={15} color={C.brass} />
                  </div>
                  <span style={{ color: C.paper, fontWeight: 700, fontSize: 15, flex: 1 }}>{g.nome}</span>
                  {!g.mesi ? (
                    <span style={{ fontSize: 9, fontFamily: MONO_FONT, color: C.textFaint, border: `1px solid ${C.panelBorder}`, borderRadius: 999, padding: "2px 8px" }}>libero</span>
                  ) : null}
                  <ChevronLeft size={16} color={C.textDim} style={{ transform: "rotate(180deg)" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontFamily: MONO_FONT, fontSize: 11, color: C.textFainter }}>{g.saved.toFixed(0)}€ / {g.importo.toFixed(0)}€</span>
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

      {showAdd && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.8)" }} onClick={() => setShowAdd(false)} />
          <div style={{ position: "relative", backgroundColor: C.panel, borderTop: `1px solid #D9BE93`, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "16px 20px 32px 20px", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ width: 40, height: 4, backgroundColor: "#D9BE93", borderRadius: 4, margin: "0 auto 16px auto" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ color: C.paper, fontWeight: 700, fontSize: 15 }}>Nuovo obiettivo</span>
              <button onClick={() => setShowAdd(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} color={C.textDim} /></button>
            </div>

            <div style={{ marginBottom: 4 }}><FieldLabel>Nome</FieldLabel></div>
            <input
              type="text" value={form.nome} placeholder="es. Nuovo scooter"
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px", color: C.paper, fontSize: 14, marginTop: 4, marginBottom: 12, outline: "none" }}
            />
            <div style={{ marginBottom: 4 }}><FieldLabel>Importo €</FieldLabel></div>
            <input
              type="number" value={form.importo} placeholder="2000"
              onChange={(e) => setForm({ ...form, importo: e.target.value })}
              style={{ width: "100%", backgroundColor: C.inputBg, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: "10px 12px", color: C.paper, fontSize: 14, marginTop: 4, marginBottom: 16, outline: "none" }}
            />

            <button
              onClick={() => setForm({ ...form, hasDeadline: !form.hasDeadline })}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", padding: 0, marginBottom: form.hasDeadline ? 12 : 16, cursor: "pointer" }}
            >
              <span style={{ color: C.paper, fontSize: 13, fontWeight: 600 }}>Imposta una scadenza</span>
              <div style={{ width: 38, height: 20, borderRadius: 999, backgroundColor: form.hasDeadline ? C.brass : "#D9BE93", position: "relative", transition: "background-color 0.15s" }}>
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
                    backgroundColor: overBudget ? "rgba(196,80,46,0.1)" : tight ? "rgba(201,162,39,0.1)" : "rgba(78,122,106,0.1)",
                    border: `1px solid ${overBudget ? C.rust : tight ? C.brass : C.green}`,
                  }}>
                    <span style={{ fontSize: 13, marginTop: -1 }}>{overBudget ? "⚠" : tight ? "!" : "✓"}</span>
                    <p style={{ fontSize: 12, color: C.paper, margin: 0, lineHeight: 1.5 }}>
                      Richiede <strong>{newMonthlyTarget.toFixed(0)}€/mese</strong>.{" "}
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
                Senza scadenza niente target periodici: a fine settimana deciderai tu quanto destinarci, dalla schermata Report.
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
  const [modo, setModo] = useState("finanziato"); // finanziato | cash | paypal3
  const [prezzo, setPrezzo] = useState(1000);
  const [rata, setRata] = useState(95);
  const [numRate, setNumRate] = useState(14);

  const oreCash = prezzo / hourly;

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
    costoTotale = rata * numRate;
    interessi = costoTotale - prezzo;
    rataMostrata = rata;
    numRateMostrate = numRate;
  }

  const oreReali = costoTotale / hourly;
  const oreDiff = oreReali - oreCash;

  const MODES = [
    { id: "cash", label: "Cash subito" },
    { id: "paypal3", label: "3 rate PayPal" },
    { id: "finanziato", label: "Finanziamento" },
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

        <div style={{ backgroundColor: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 4, padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <FieldLabel>Prezzo oggetto</FieldLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, borderBottom: "1px solid #D9BE93", paddingBottom: 4 }}>
              <span style={{ color: C.brass, fontFamily: MONO_FONT, fontSize: 20 }}>€</span>
              <input type="number" value={prezzo} onChange={(e) => setPrezzo(Number(e.target.value))}
                style={{ backgroundColor: "transparent", color: C.paper, fontFamily: MONO_FONT, fontSize: 20, width: "100%", border: "none", outline: "none" }} />
            </div>
          </div>

          {modo === "finanziato" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <FieldLabel>Rata/mese</FieldLabel>
                <input type="number" value={rata} onChange={(e) => setRata(Number(e.target.value))}
                  style={{ backgroundColor: "transparent", color: C.paper, fontFamily: MONO_FONT, fontSize: 16, width: "100%", border: "none", borderBottom: "1px solid #D9BE93", outline: "none", marginTop: 4, paddingBottom: 4 }} />
              </div>
              <div>
                <FieldLabel>N. rate</FieldLabel>
                <input type="number" value={numRate} onChange={(e) => setNumRate(Number(e.target.value))}
                  style={{ backgroundColor: "transparent", color: C.paper, fontFamily: MONO_FONT, fontSize: 16, width: "100%", border: "none", borderBottom: "1px solid #D9BE93", outline: "none", marginTop: 4, paddingBottom: 4 }} />
              </div>
            </div>
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

        <PunchTicket style={{ borderRadius: 4, padding: 16, border: "1px solid #E7C98A" }}>
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

          <div style={{ borderTop: "1px dashed #E0B97A", paddingTop: 16 }}>
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
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    stipendio: "", oreSettimana: "40",
    fixedList: [
      { id: 1, nome: "Affitto / mutuo", tipo: "affitto", importo: 650, frequenza: "mensile" },
      { id: 2, nome: "Bollette", tipo: "bollette", importo: 140, frequenza: "mensile" },
      { id: 3, nome: "Rata auto", tipo: "auto", importo: 220, frequenza: "mensile" },
    ],
    goals: [{ id: 1, nome: "Viaggio in Giappone", importo: 2000, mesi: 12, saved: 620 }],
    closurePeriod: "settimana", // giorno | settimana | mese
    carryOver: 0, // quanto non è stato allocato nell'ultima chiusura, si somma al prossimo periodo
    connectedAccounts: {}, // { banca: true, revolut: false, paypal: true }
  });

  const [cloudLoaded, setCloudLoaded] = useState(!supabaseConfigured);
  const [syncError, setSyncError] = useState(null);
  const saveTimer = useRef(null);

  const [tab, setTab] = useState("diario");
  const [addOpen, setAddOpen] = useState(false);
  const [bankTx, setBankTx] = useState(null); // transazione simulata in attesa
  const [categorizeOpen, setCategorizeOpen] = useState(false);
  const [txFeed, setTxFeed] = useState(null); // elenco transazioni del Rendiconto, persistente tra i cambi di tab
  const [entries, setEntries] = useState([
    { cat: "Colazione", iconId: "colazione", euro: 2.5, time: "08:12" },
    { cat: "Pranzo", iconId: "pranzo", euro: 9, time: "13:02" },
  ]);

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
    position: "relative", width: 380, height: 780, backgroundColor: C.bg,
    borderRadius: 36, overflow: "hidden", border: `4px solid ${C.panelBorder}`,
    boxShadow: "0 25px 60px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column",
  };
  const outerStyle = { minHeight: "100vh", backgroundColor: C.outerBg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, colorScheme: "light" };

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
    const steps = [
      <OnboardingIncome data={data} setData={setData} onNext={() => setStep(1)} />,
      <OnboardingFixed data={data} setData={setData} onNext={() => setStep(2)} onBack={() => setStep(0)} />,
      <OnboardingGoal data={data} setData={setData} onNext={() => setOnboarded(true)} onBack={() => setStep(1)} />,
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

  const hourlyRate = (Number(data.stipendio) / 4.33) / Number(data.oreSettimana);
  const profile = { hourlyRate, monthlyIncome: Number(data.stipendio) || 0, fixedList: data.fixedList, goals: data.goals, closurePeriod: data.closurePeriod, carryOver: data.carryOver };

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
  const hasAnyAccountConnected = Object.values(connectedAccounts).some(Boolean);
  // Genera il feed una sola volta, la prima volta che serve, così resta stabile tra i cambi di tab
  if (hasAnyAccountConnected && txFeed === null) {
    setTxFeed(generateTransactionFeed(connectedAccounts));
  }
  const pendingTxCount = txFeed ? txFeed.length : 0;

  return (
    <div style={outerStyle}>
      <div style={frameStyle}>
        {syncError && (
          <div style={{ position: "absolute", top: 8, left: 8, right: 8, zIndex: 90, backgroundColor: C.rust, color: "#fff", borderRadius: 8, padding: "10px 12px", fontSize: 11.5, lineHeight: 1.4, display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{ flex: 1 }}>⚠ Sincronizzazione: {syncError}</span>
            <button onClick={() => setSyncError(null)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontWeight: 700, padding: 0 }}>✕</button>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 8px 20px" }}>
          <span style={{ fontFamily: MONO_FONT, fontSize: 11, color: C.textDim, letterSpacing: "0.15em" }}>ORELIBERE</span>
          <span style={{ fontFamily: MONO_FONT, fontSize: 11, color: C.textDim }}>09:41</span>
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
            />
          )}
          {tab === "sim" && <SimulatoreScreen hourly={hourlyRate} />}
          {tab === "report" && <ReportScreen hourly={hourlyRate} profile={profile} onBack={() => setTab("diario")} onOpenClosure={() => setTab("closure")} />}
          {tab === "closure" && <ClosureScreen hourly={hourlyRate} profile={profile} onBack={() => setTab("report")} onAllocate={addToGoalSaved} onCarryOver={setCarryOver} />}
          {tab === "goal" && <GoalScreen profile={profile} hourly={hourlyRate} onAddGoal={addGoal} />}
          {tab === "settings" && <SettingsScreen data={data} setData={setData} onBack={() => setTab("diario")} onFullOnboarding={() => setOnboarded(false)} onOpenTransactions={() => setTab("transactions")} onChangeUser={onChangeUser} />}
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
        {(tab === "diario" || tab === "goal" || tab === "sim" || tab === "closure" || tab === "transactions") && (
          <div style={{ borderTop: `1px solid ${C.panelBorder}`, backgroundColor: C.bg, display: "flex", alignItems: "center", justifyContent: "space-around", padding: "12px 16px" }}>
            <button onClick={() => setTab("diario")} style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <Home size={20} color={tab === "diario" ? C.brass : "#C7B9A0"} />
              <span style={{ fontSize: 10, fontFamily: MONO_FONT, color: tab === "diario" ? C.brass : "#C7B9A0" }}>Diario</span>
            </button>
            {closurePool > 0 && (
              <button onClick={() => setTab("closure")} style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", position: "relative" }}>
                <div style={{ position: "relative" }}>
                  <HandCoins size={20} color={tab === "closure" ? C.brass : "#C7B9A0"} />
                  <span style={{ position: "absolute", top: -3, right: -4, width: 8, height: 8, borderRadius: "50%", backgroundColor: C.rust, border: `1.5px solid ${C.bg}` }} />
                </div>
                <span style={{ fontSize: 10, fontFamily: MONO_FONT, color: tab === "closure" ? C.brass : "#C7B9A0" }}>Chiusura</span>
              </button>
            )}
            {hasAnyAccountConnected && (
              <button onClick={() => setTab("transactions")} style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", position: "relative" }}>
                <div style={{ position: "relative" }}>
                  <BarChart3 size={20} color={tab === "transactions" ? C.brass : "#C7B9A0"} />
                  {pendingTxCount > 0 && (
                    <span style={{
                      position: "absolute", top: -6, right: -8, minWidth: 14, height: 14, borderRadius: 999, backgroundColor: C.brass,
                      border: `1.5px solid ${C.bg}`, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px",
                    }}>
                      <span style={{ fontSize: 8.5, fontFamily: MONO_FONT, color: C.ink, fontWeight: 800 }}>{pendingTxCount}</span>
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 10, fontFamily: MONO_FONT, color: tab === "transactions" ? C.brass : "#C7B9A0" }}>Rendiconto</span>
              </button>
            )}
            <button onClick={() => setTab("goal")} style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <PiggyBank size={20} color={tab === "goal" ? C.brass : "#C7B9A0"} />
              <span style={{ fontSize: 10, fontFamily: MONO_FONT, color: tab === "goal" ? C.brass : "#C7B9A0" }}>Budget</span>
            </button>
            <button onClick={() => setTab("sim")} style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <Calculator size={20} color={tab === "sim" ? C.brass : "#C7B9A0"} />
              <span style={{ fontSize: 10, fontFamily: MONO_FONT, color: tab === "sim" ? C.brass : "#C7B9A0" }}>Simulatore</span>
            </button>
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
        <div style={{ minHeight: "100vh", backgroundColor: "#FFF7ED", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 380, backgroundColor: "#fff", border: "1px solid #F0DFC7", borderRadius: 12, padding: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#3B2E22", marginBottom: 8 }}>Qualcosa è andato storto</div>
            <div style={{ fontSize: 12.5, color: "#9A8873", lineHeight: 1.5, marginBottom: 14, wordBreak: "break-word" }}>
              {String(this.state.error && this.state.error.message ? this.state.error.message : this.state.error)}
            </div>
            <button
              onClick={() => { this.setState({ error: null }); }}
              style={{ padding: "10px 16px", borderRadius: 8, border: "none", backgroundColor: "#FF9F5A", color: "#2A1F16", fontWeight: 700, cursor: "pointer" }}
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
    position: "relative", width: 380, height: 780, backgroundColor: C.bg,
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
