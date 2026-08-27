import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { resolveAccess, ROLE_NONE } from "./lib/permissions";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: `https://login.microsoftonline.com/${process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID}/v2.0`,
      authorization: { params: { scope: "openid profile email User.Read" } },
    }),
  ],

  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },

  callbacks: {
    /**
     * Completing the Microsoft sign in is not the same as being allowed
     * into SHIFT. Anyone in the tenant can do the first. Only members of
     * the three SHIFT groups get past this callback.
     *
     * If the groups claim is not configured in Entra, profile.groups is
     * undefined and every sign in is rejected. That is intentional, but
     * it is also the first thing to check when nobody can get in.
     */
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

  pages: { signIn: "/signin", error: "/signin" },
});
