import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <Link href="/" className="text-2xl font-bold tracking-tight text-slate-900">
        <span className="text-orange-500">Éni</span>Event
      </Link>

      <div className="mt-8 w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 sm:p-8">
        {children}
      </div>
    </div>
  );
}
