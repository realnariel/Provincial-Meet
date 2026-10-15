import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const isConfigured = Boolean(url && key);
export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

// Auth uses a synthetic address because the user-facing credential is a
// username, not an email. Accounts are created only by trusted administration.
export function usernameEmail(username: string) {
  const normalized = username.trim().toLowerCase();
  // Existing accounts may have been created with a real email address.
  // Accept that address directly without publishing an email-to-username map.
  if (normalized.includes("@")) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
      throw new Error("Enter a valid email address.");
    return normalized;
  }
  if (!/^[a-z0-9._-]{1,50}$/.test(normalized))
    throw new Error("Enter a valid username.");
  return `${normalized}@accounts.provmeet.example.com`;
}

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error("Supabase is not configured yet.");
  return supabase;
}
