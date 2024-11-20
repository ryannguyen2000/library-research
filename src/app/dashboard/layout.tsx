import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "This is a cms page",
  keywords: ["CMS", "Dashboard", "Next.js"],
  authors: [{ name: "Bao", url: "https://github/tbao" }],
  creator: "Thai Bao",
  publisher: "Thai Bao",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL("https://github/tbao09"),
  // (openGraph) This is a SEO method for social medias
  openGraph: {
    images: "/images/iconic_sign-in.png",
  },
  icons: {
    icon: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQnanEbaCrmdJy857x-rLsHbLwea2vJPU5MZw&s",
  },
};

{
  /* <meta name="application-name" content="Next.js" />
<meta name="author" content="Seb" />
<link rel="author" href="https://nextjs.org" />
<meta name="author" content="Josh" />
<meta name="generator" content="Next.js" />
<meta name="keywords" content="Next.js,React,JavaScript" />
<meta name="referrer" content="origin-when-cross-origin" />
<meta name="color-scheme" content="dark" />
<meta name="creator" content="Jiachi Liu" />
<meta name="publisher" content="Sebastian Markbåge" />
<meta name="format-detection" content="telephone=no, address=no, email=no" /> */
}

export default function DashboardLayout({
  children, // will be a page or nested layout
}: {
  children: React.ReactNode;
}) {
  return <section>{children}</section>;
}
