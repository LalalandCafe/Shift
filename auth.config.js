// auth.config.js
//
// La mitad de la config de Auth.js que el middleware puede cargar.
//
// El middleware corre en Edge runtime. Importar auth.js completo desde
// ahi arrastra el provider de Entra y sus dependencias de Node, que en
// Edge truenan. Esta mitad solo trae callbacks y cookies, que es todo lo
// que el middleware necesita para leer y verificar la sesion.
import { resolveAccess, ROLE_NONE } from "./lib/permissions";

export default {
  providers: [],

  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },

  callbacks: {
    async signIn({ profile }) {
      return resolveAccess(profile?.groups).role !== ROLE_NONE;
    },

    async jwt({ token, profile }) {
      if (profile) {
        const access = resolveAccess(profile.groups);
        token.role = access.role;
        token.grps = access.grps;
        token.allStores = access.allStores;
        token.email = profile.email ?? profile.preferred_username ?? token.email;
        token.name = profile.name ?? token.name;
      }
      return token;
    },

    async session({ session, token }) {
      session.user.role = token.role ?? ROLE_NONE;
      session.user.grps = token.grps ?? [];
      session.user.allStores = token.allStores === true;
      return session;
    },
  },

  pages: {
    signIn: "/login",
    signOut: "/signout",
    error: "/login",
  },
};
