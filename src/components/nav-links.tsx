"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
// import { useRouter } from "next/navigation";

export function NavLinks() {
  const pathname = usePathname();
  // const router = useRouter();

  return (
    <nav className="flex flex-col gap-3 bg-pink-50">
      <Link href="/login">Open modal</Link>
      <Link className={`link ${pathname === "/" ? "active" : ""}`} href="/">
        Home
      </Link>

      <Link
        className={`link ${pathname === "/dashboard" ? "active" : ""}`}
        href="/dashboard"
      >
        Dashboard
      </Link>

      {/* <button type="button" onClick={() => router.push("/dashboard")}>
        Dashboard
      </button> */}

      <Link
        className={`link ${pathname === "/email" ? "active" : ""}`}
        href="/dashboard/email"
      >
        Email
      </Link>
      <Link
        className={`link ${pathname === "/lazyStreaming" ? "active" : ""}`}
        href="/dashboard/loadingStreaming"
      >
        Loading streaming
      </Link>
      <Link
        className={`link ${pathname === "/lazyLoading" ? "active" : ""}`}
        href="/dashboard/lazyLoading"
      >
        Lazy loading
      </Link>
      <Link
        className={`link ${pathname === "/parallelRoutes" ? "active" : ""}`}
        href="/dashboard/parallelRoutes"
      >
        Parallel Routes
      </Link>
      {/* <Link href='/photo'>Photo</Link> */}
    </nav>
  );
}
