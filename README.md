import { createClient } from "@supabase/supabase-js";

// Cliente para el backend. Usa la SERVICE ROLE key, asi que solo debe
// importarse desde API routes (nunca desde componentes del cliente).
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  }
);
