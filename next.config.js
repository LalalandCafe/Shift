export const metadata = {
  title: "SHIFT - Labor Sync",
  description: "Sincronizacion de labor de Toast a Supabase",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#f7f8fa" }}>
        {children}
      </body>
    </html>
  );
}
