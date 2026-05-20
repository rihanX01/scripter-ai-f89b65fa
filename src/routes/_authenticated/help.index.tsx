import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Nav } from "@/components/site/Nav";
import { createTicket, getTicket, isHumanOnline, listMyTickets, sendUserMessage } from "@/lib/support.functions";
import { supabase } from "@/integrations/supabase/client";
import { Bot, Circle, Headphones, Loader2, MessageCircle, Plus, Send, UserCircle2, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/help/")({
  head: () => ({ meta: [{ title: "Help & Support — ShortForge AI" }] }),
  component: HelpPage,
});

function HelpPage() {
  const listFn = useServerFn(listMyTickets);
  const onlineFn = useServerFn(isHumanOnline);
  const createFn = useServerFn(createTicket);
  const qc = useQueryClient();
  const [subject, setSubject] = useState("");
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);

  const tickets = useQuery({ queryKey: ["my-tickets"], queryFn: () => listFn(), refetchInterval: 8000 });
  const online = useQuery({ queryKey: ["human-online"], queryFn: () => onlineFn(), refetchInterval: 30000 });

  const create = useMutation({
    mutationFn: (s: string) => createFn({ data: { subject: s || "Support request" } }),
    onSuccess: ({ id }) => {
      setSubject("");
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
      setActiveTicketId(id);
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't create ticket"),
  });

  return (
    <div className="min-h-screen pt-24 pb-24 px-6">
      <Nav />
      <div className="max-w-4xl mx-auto">
        <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="font-display text-3xl md:text-4xl font-bold">Help & <span className="text-gradient">Support</span></h1>
            <p className="text-muted-foreground mt-1 text-sm">Chat with our AI assistant or talk to a human.</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Circle className={`size-2.5 ${online.data?.online ? "fill-emerald-400 text-emerald-400" : "fill-zinc-500 text-zinc-500"}`} />
            <span className="text-muted-foreground">{online.data?.online ? "Staff online now" : "No staff online — AI + ticket"}</span>
          </div>
        </div>

        <div className="glass rounded-2xl p-5 mb-6 border border-border/40">
          <div className="font-display font-semibold mb-3">Start a new ticket</div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What do you need help with?"
              className="flex-1 rounded-lg bg-background/60 border border-border/60 px-3 py-2 text-sm"
              maxLength={200}
            />
            <button
              onClick={() => create.mutate(subject)}
              disabled={create.isPending}
              className="btn-hero rounded-lg px-4 py-2 text-sm inline-flex items-center gap-2 disabled:opacity-50"
            >
              {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              New chat
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Your tickets</div>
          {tickets.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {tickets.data?.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTicketId(t.id)}
              className={`glass w-full rounded-xl p-4 flex items-center justify-between hover:border-[var(--neon)]/40 border transition-colors text-left ${activeTicketId === t.id ? "border-[var(--neon)]/50" : "border-border/40"}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <MessageCircle className="size-4 text-[var(--neon)] shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{t.subject}</div>
                  <div className="text-xs text-muted-foreground">{new Date(t.last_message_at).toLocaleString()}</div>
                </div>
              </div>
              <StatusBadge status={t.status} />
            </button>
          ))}
          {tickets.data && tickets.data.length === 0 && (
            <div className="text-sm text-muted-foreground">No tickets yet — start a new chat above.</div>
          )}
        </div>
        {activeTicketId && <SmallSupportChat ticketId={activeTicketId} onClose={() => setActiveTicketId(null)} />}
      </div>
    </div>
  );
}

function SmallSupportChat({ ticketId, onClose }: { ticketId: string; onClose: () => void }) {
  const getFn = useServerFn(getTicket);
  const sendFn = useServerFn(sendUserMessage);
  const onlineFn = useServerFn(isHumanOnline);
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const q = useQuery({ queryKey: ["ticket", ticketId], queryFn: () => getFn({ data: { ticket_id: ticketId } }) });
  const online = useQuery({ queryKey: ["human-online"], queryFn: () => onlineFn(), refetchInterval: 30000 });

  useEffect(() => {
    const ch = supabase.channel(`help-ticket-${ticketId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_messages", filter: `ticket_id=eq.${ticketId}` }, () => {
        qc.invalidateQueries({ queryKey: ["ticket", ticketId] });
        qc.invalidateQueries({ queryKey: ["my-tickets"] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "support_tickets", filter: `id=eq.${ticketId}` }, () => {
        qc.invalidateQueries({ queryKey: ["ticket", ticketId] });
        qc.invalidateQueries({ queryKey: ["my-tickets"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ticketId, qc]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    inputRef.current?.focus();
  }, [q.data?.messages.length, ticketId]);

  const send = useMutation({
    mutationFn: (vars: { body: string; request_human?: boolean }) =>
      sendFn({ data: { ticket_id: ticketId, body: vars.body, request_human: vars.request_human } }),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["ticket", ticketId] });
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
      inputRef.current?.focus();
    },
    onError: (e: any) => toast.error(e?.message ?? "Send failed"),
  });

  const messages = q.data?.messages ?? [];
  const status = q.data?.ticket?.status ?? "open";

  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-[380px] z-50 glass border border-border/50 rounded-2xl shadow-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display font-semibold text-sm truncate">{q.data?.ticket?.subject ?? "Support chat"}</div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Circle className={`size-2 ${online.data?.online ? "fill-emerald-400 text-emerald-400" : "fill-zinc-500 text-zinc-500"}`} />
            {online.data?.online ? "Staff online" : "AI + ticket"}
          </div>
        </div>
        <button type="button" onClick={onClose} className="size-8 grid place-items-center rounded-lg border border-border/50 hover:border-[var(--neon)]/50" aria-label="Close chat">
          <X className="size-4" />
        </button>
      </div>

      <div ref={scrollRef} className="h-80 overflow-y-auto p-4 space-y-3 bg-background/40">
        {q.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
        {messages.map((m: any) => <ChatBubble key={m.id} m={m} />)}
        {send.isPending && status !== "live" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Bot className="size-3.5" /> AI is thinking…</div>
        )}
      </div>

      {status === "closed" ? (
        <div className="p-3 text-xs text-muted-foreground text-center border-t border-border/40">This ticket is closed.</div>
      ) : (
        <div className="p-3 border-t border-border/40">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (text.trim()) send.mutate({ body: text.trim() }); }
            }}
            placeholder={status === "live" ? "Type a message to staff…" : "Ask the AI or request a human…"}
            rows={2}
            className="w-full rounded-xl bg-background/60 border border-border/50 px-3 py-2 outline-none text-sm resize-none"
            maxLength={4000}
          />
          <div className="flex items-center justify-between mt-2 gap-2">
            {status !== "live" ? (
              <button
                type="button"
                onClick={() => text.trim() ? send.mutate({ body: text.trim(), request_human: true }) : send.mutate({ body: "I'd like to talk to a human, please.", request_human: true })}
                disabled={send.isPending}
                className="text-xs px-3 py-1.5 rounded-lg border border-border/60 hover:border-[var(--neon)]/50 inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Headphones className="size-3.5" /> Human
              </button>
            ) : <span className="text-xs text-emerald-400">Live with staff</span>}
            <button
              type="button"
              onClick={() => text.trim() && send.mutate({ body: text.trim() })}
              disabled={send.isPending || !text.trim()}
              className="btn-hero rounded-lg px-4 py-1.5 text-sm inline-flex items-center gap-2 disabled:opacity-50"
            >
              {send.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChatBubble({ m }: { m: any }) {
  if (m.sender_type === "user") {
    return (
      <div className="flex items-start gap-2 justify-end">
        <div className="max-w-[78%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-wrap">{m.body}</div>
        <UserCircle2 className="size-5 text-muted-foreground mt-1" />
      </div>
    );
  }
  const isAdmin = m.sender_type === "admin";
  const Icon = isAdmin ? Headphones : Bot;
  return (
    <div className="flex items-start gap-2">
      <div className={`size-7 rounded-full flex items-center justify-center ${isAdmin ? "bg-emerald-500/20 text-emerald-300" : "bg-[var(--neon)]/15 text-[var(--neon)]"}`}>
        <Icon className="size-4" />
      </div>
      <div className="max-w-[78%]">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{isAdmin ? "Staff" : "AI"}</div>
        <div className="text-sm whitespace-pre-wrap text-foreground/90">{m.body}</div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    open: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
    live: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    closed: "bg-rose-500/20 text-rose-300 border-rose-500/30",
  };
  return <span className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded border ${styles[status] ?? styles.open}`}>{status}</span>;
}
