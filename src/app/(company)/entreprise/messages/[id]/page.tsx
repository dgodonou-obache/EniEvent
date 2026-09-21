import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { MessageThread } from "@/components/messaging/MessageThread";
import { requireSpace } from "@/lib/auth/session";
import { getConversation } from "@/lib/messaging";

/** Un fil, côté entreprise. Ouvert à toute l'équipe, comme les projets. */

export const metadata = { title: "Conversation" };

export default async function CompanyThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { decision } = await requireSpace("company", "/connexion");
  if (!decision.granted || !decision.org) return null;

  const { id } = await params;
  const fil = await getConversation(id);

  if (!fil) notFound();

  return (
    <div>
      <Link
        href="/entreprise/messages"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-all duration-200 hover:text-orange-600"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Messages
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {fil.summary.counterpart}
        </h1>
        {fil.summary.listingTitle ?? fil.summary.requestReference ? (
          <p className="mt-1 text-sm text-slate-500">
            À propos de {fil.summary.listingTitle ?? fil.summary.requestReference}
          </p>
        ) : null}
      </div>

      <MessageThread
        summary={fil.summary}
        messages={fil.messages}
        unmasked={fil.summary.unmasked}
      />
    </div>
  );
}
