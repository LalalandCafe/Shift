// auth.config.js
//
// La mitad de la config de Auth.js que el middleware puede cargar.
//
// El middleware corre en Edge runtime. Importar auth.js completo desde
// ahi arrastra el provider de Entra y sus dependencias de Node, que en
// Edge truenan. Esta mitad solo trae callbacks y cookies, que es todo lo
// que el middleware necesita para leer y verificar la sesion.
//
// Identity vs. access, because they are NOT the same field here:
//
//   oid    - the stable user identifier. Tenant-wide, immutable, and the
//            only thing safe to key a user on. Carried from here through
//            middleware.js (x-shift-oid) into lib/auth.js.
//   email  - DISPLAY ONLY. The tenant runs a mix of @lalalandcafe.com and
//            @lalalandkindcafe.com UPNs, and Entra only fills the `email`
//            claim when the account has a mail attribute, so this value is
//            neither stable nor consistently shaped. Never key on it.
//   groups - the ONLY input to access. Role and grps come from the security
//            group GUIDs and from nothing else. oid never widens or narrows
//            what anyone can see; adding it changed no access decision.
import { resolveAccess, missingGroupEnv, ROLE_NONE } from "./lib/permissions";

export default {
  providers: [],

  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },

  callbacks: {
    async signIn({ profile }) {
      const access = resolveAccess(profile?.groups);
      if (access.role !== ROLE_NONE) return true;

      // TODO(am-rollout): remove this block once regional sign-in is verified
      // in production for all eight area managers.
      //
      // Why it exists: returning false here means no session is ever created,
      // so /api/whoami - the endpoint built to diagnose exactly this - answers
      // `signedIn: false` and tells you nothing. This log is the only place
      // that can distinguish the three failure modes from each other:
      //
      //   1. no `groups` key on the profile at all -> the app registration is
      //      not emitting the claim on the ID TOKEN (it may be on the access
      //      token, which Auth.js never reads here)
      //   2. `_claim_names.groups` present      -> Entra groups overage; the
      //      claim was replaced by a Graph pointer and the GUIDs are not in
      //      the token
      //   3. groups present and non-empty       -> the claim works, the user
      //      is simply not in a SHIFT group, or a GUID env var is wrong
      //
      // KEY NAMES AND COUNTS ONLY. No claim values are logged, ever - not the
      // group GUIDs, not the UPN, not the oid.
      const keys = profile ? Object.keys(profile) : [];
      const groups = profile?.groups;
      console.error("[auth] sign-in denied: no SHIFT group resolved", {
        profileKeys: keys,
        hasGroupsClaim: Object.prototype.hasOwnProperty.call(profile ?? {}, "groups"),
        groupsIsArray: Array.isArray(groups),
        groupsCount: Array.isArray(groups) ? groups.length : null,
        // The Entra groups overage case. When set, the GUIDs are NOT in the
        // token and no amount of fixing the env vars will help.
        hasClaimNamesGroups: !!profile?._claim_names?.groups,
        claimNamesKeys: profile?._claim_names ? Object.keys(profile._claim_names) : [],
        // Reads "[]" when the config is fine, which rules out the single most
        // likely cause in one glance. See lib/permissions.js.
        missingGroupEnv: missingGroupEnv(),
      });

      return false;
    },

    async jwt({ token, profile }) {
      if (profile) {
        const access = resolveAccess(profile.groups);
        token.role = access.role;
        token.grps = access.grps;
        token.allStores = access.allStores;
        // The stable identifier. Set alongside the access fields, never used
        // by them. `sub` would also have been stable, but it is pairwise per
        // application; oid is the same value the rest of the tenant uses.
        token.oid = profile.oid ?? token.oid ?? null;
        token.email = profile.email ?? profile.preferred_username ?? token.email;
        token.name = profile.name ?? token.name;
      }
      return token;
    },

    async session({ session, token }) {
      session.user.role = token.role ?? ROLE_NONE;
      session.user.grps = token.grps ?? [];
      session.user.allStores = token.allStores === true;
      // Null rather than undefined so a consumer can tell "this session
      // predates oid" (sign in again) from "this key does not exist".
      // Sessions issued before this change carry no oid until they expire.
      session.user.oid = token.oid ?? null;
      return session;
    },
  },

  pages: {
    signIn: "/login",
    signOut: "/signout",
    error: "/login",
  },
};
