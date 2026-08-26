// scripts/seed-users.js
//
//   node --env-file=.env.local scripts/seed-users.js
//
// Imprime los codigos UNA SOLA VEZ. No se pueden recuperar despues, porque
// en la base solo queda el hash sha256 con pepper.

const { createClient } = require("@supabase/supabase-js");
const { createHash, randomInt } = require("crypto");

// Sin 0/O ni 1/I/l: estos codigos se dictan por telefono y se escriben en
// un celular con una mano.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function newCode(len = 10) {
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

function hashCode(code) {
  return createHash("sha256")
    .update(process.env.AUTH_PEPPER + ":" + code.trim())
    .digest("hex");
}

// ============================================================
// LA LISTA
//
//   role: 'admin'   -> todo, sin scope ni store_code
//   role: 'region'  -> scope: 'TX-TN' o 'CA-AZ'
//   role: 'store'   -> store_code: 10019
//
// Los 7 van como admin porque hoy tecnologia y operaciones necesitan todas
// las pestanas. Los usuarios de region se siembran en el paso 2, cuando el
// filtrado ya funcione: dar un codigo de region mientras la persona sigue
// viendo las 35 tiendas solo genera confianza equivocada.
// ============================================================
const USERS = [
  { name: "Beto Rodriguez",      email: "beto@lalalandkindcafe.com",     role: "admin" },
  { name: "Mike Javaherian",     email: "mike@lalalandkindcafe.com",     role: "admin" },
  { name: "Robert Gooderl",      email: "robert@lalalandkindcafe.com",   role: "admin" },
  { name: "Marielle Villarreal", email: "marielle@lalalandkindcafe.com", role: "admin" },
  { name: "Heather Zhou",        email: "heather@lalalandkindcafe.com",  role: "admin" },
  { name: "Ethan Hassett",       email: "ethan@lalalandkindcafe.com",    role: "admin" },
  { name: "August Edwards",      email: "august@lalalandkindcafe.com",   role: "admin" },
];

(async () => {
  for (const v of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "AUTH_PEPPER"]) {
    if (!process.env[v]) throw new Error("Falta la variable " + v);
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  console.log("\n  GUARDA ESTO AHORA. No se vuelve a mostrar.\n");
  console.log("  " + "NOMBRE".padEnd(24) + "CORREO".padEnd(38) + "CODIGO");
  console.log("  " + "-".repeat(76));

  let ok = 0;
  for (const u of USERS) {
    const code = newCode();
    const { error } = await db.from("app_users").insert({
      name: u.name,
      email: u.email ?? null,
      role: u.role,
      scope: u.scope ?? null,
      store_code: u.store_code ?? null,
      code_hash: hashCode(code),
    });
    if (error) {
      console.error("  ERROR " + u.name + ": " + error.message);
      continue;
    }
    ok++;
    console.log("  " + u.name.padEnd(24) + String(u.email || "").padEnd(38) + code);
  }
  console.log("\n  " + ok + " de " + USERS.length + " usuarios creados.\n");
})();
