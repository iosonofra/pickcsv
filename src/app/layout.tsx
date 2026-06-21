import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import { cookies } from "next/headers";
import "@/app/globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-inter",
});

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-outfit",
});

export const metadata: Metadata = {
  title: "Picking Logistica",
  description: "Sistema di picking con import Excel, barcode e PDF"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const savedTheme = cookieStore.get("picking_theme")?.value;
  const isLight = savedTheme !== "dark"; // Default to light theme

  return (
    <html
      lang="it"
      className={`${inter.variable} ${outfit.variable} ${inter.className} ${isLight ? "light-theme" : ""}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('picking_theme') || (document.cookie.match(/picking_theme=([^;]+)/) || [])[1];
                  var theme = saved === 'dark' ? 'dark' : 'light';
                  if (theme === 'light') {
                    document.documentElement.classList.add('light-theme');
                    document.documentElement.style.backgroundColor = '#FFFFFF';
                    document.documentElement.style.color = '#091E42';
                  } else {
                    document.documentElement.classList.remove('light-theme');
                    document.documentElement.style.backgroundColor = '#091E42';
                    document.documentElement.style.color = '#DFE1E6';
                  }
                } catch (e) {}
              })()
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}

