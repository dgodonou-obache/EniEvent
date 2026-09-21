import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { MessageThread } from "@/components/messaging/MessageThread";
import { requireUser } from "@/lib/auth/session";
import { getConversation } from "@/lib/messaging";

/**
 * Un fil, côté client.
 *
 * Le 404 sur un fil inaccessible est délibéré, comme pour `/projets/[id]` :
 * répondre « accès refusé » révélerait que la conversation existe.
 */

export const metadata = { title: "Conversation" };

export default async function AccountThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();

  const { id } = await params;
  const fil = await getConversation(id);

  if (!fil) notFound();

  return (
    <div>
      <Link
        href="/compte/messages"
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
