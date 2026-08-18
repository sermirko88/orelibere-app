import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Se le variabili d'ambiente non sono configurate (es. prima del collegamento
// a Supabase), l'app deve continuare a funzionare normalmente ma senza
// salvataggio persistente. Non lanciamo errori, torniamo semplicemente `null`.
export const supabase = url && key ? createClient(url, key) : null;
export const supabaseConfigured = Boolean(supabase);
