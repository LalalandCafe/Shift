import { signIn } from "../../auth";

export const metadata = { title: "Sign in | SHIFT" };

export default function SignInPage({ searchParams }) {
  const failed = searchParams?.error;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F5EFE3",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background: "#FFFFFF",
          padding: "48px 40px",
          borderRadius: 12,
          boxShadow: "0 1px 3px rgba(60,42,28,0.12)",
          width: 380,
          textAlign: "center",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 28, color: "#3C2A1C", letterSpacing: "-0.02em" }}>
          SHIFT
        </h1>
        <p style={{ marginTop: 8, marginBottom: 32, fontSize: 14, color: "#7A6A58" }}>
          Labor and sales reporting
        </p>

        {failed ? (
          <p
            style={{
              marginBottom: 24,
              padding: "12px 14px",
              borderRadius: 8,
              background: "#FBEAEA",
              color: "#8C2F2F",
              fontSize: 13,
              lineHeight: 1.5,
              textAlign: "left",
            }}
          >
            Your account signed in, but it is not a member of a SHIFT access
            group. Ask the tech team to add you.
          </p>
        ) : null}

        <form
          action={async () => {
            "use server";
            await signIn("microsoft-entra-id", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 8,
              border: "none",
              background: "#3C2A1C",
              color: "#F5EFE3",
              fontSize: 15,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Sign in with Microsoft
          </button>
        </form>
      </div>
    </main>
  );
}
