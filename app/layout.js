export const metadata = {
  title: "SHIFT - Lalaland Cafe",
  description: "Labor and sales reporting",
};

export const viewport = {
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
