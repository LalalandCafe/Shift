# Wiring the SHIFT auth screens

Three edits outside the new files. Without the first, Auth.js keeps serving its
own unstyled pages at /api/auth/signin and /api/auth/signout.

## 1. Point Auth.js at the custom pages

In `auth.config.js`, add at the top level of the config object:

    pages: {
      signIn: '/login',
      signOut: '/signout',
      error: '/login',
    },

## 2. Let both pages through the middleware

`/login` and `/signout` must be reachable while signed out, otherwise `/login`
redirects to itself forever.

Matcher form:

    export const config = {
      matcher: [
        '/((?!login|signout|api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)',
      ],
    };

Or, inside an `authorized` callback:

    const PUBLIC_PATHS = ['/login', '/signout'];
    authorized({ request, auth }) {
      const { pathname } = request.nextUrl;
      if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) return true;
      return !!auth?.user;
    }

## 3. Repoint the sign-out link

    grep -rn "api/auth/signout" --include="*.js" --include="*.jsx" .

Change every hit to `/signout`.

## Assumptions to check against the real repo

- Import alias `@/`. If jsconfig.json has no `@/*` path, switch to relative imports.
- `<ShiftLogo />` is rendered with no props and sized by CSS (.auth-mark is 60px
  tall). If the component requires a `size` prop, pass one.
- The CSS asks for Poppins first. If globals.css loads a different face, change
  the font-family on .auth-page to match.
- Written for Next 14, where `searchParams` is a plain object. On Next 15 it is
  a promise and needs awaiting.

## Verify

1. /login signed out renders the styled screen
2. /login?error=AccessDenied shows the red notice
3. /login while signed in redirects to the dashboard
4. /signout shows your name and email
5. Signing out lands on the confirmation state
6. /api/auth/signout is no longer the blue default page
