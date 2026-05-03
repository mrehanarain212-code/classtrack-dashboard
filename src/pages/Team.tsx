import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Copy, Trash2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { Button } from "@/components/ui/button";

interface Member {
  id: string;
  full_name: string | null;
  role: "admin" | "teacher";
}

export default function Team() {
  const { session, schoolId, isAdmin, loading, user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [code, setCode] = useState<string>("");
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!schoolId) return;
    let active = true;
    setFetching(true);
    Promise.all([
      supabase.from("profiles").select("id, full_name").eq("school_id", schoolId),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("schools").select("join_code").eq("id", schoolId).maybeSingle(),
    ]).then(([p, r, s]) => {
      if (!active) return;
      if (p.error) toast.error(p.error.message);
      const roleMap = new Map<string, "admin" | "teacher">();
      (r.data ?? []).forEach((row: any) => {
        const cur = roleMap.get(row.user_id);
        if (row.role === "admin" || !cur) roleMap.set(row.user_id, row.role);
      });
      const list: Member[] = (p.data ?? []).map((x: any) => ({
        id: x.id, full_name: x.full_name, role: roleMap.get(x.id) ?? "teacher",
      }));
      list.sort((a, b) => (a.role === b.role ? 0 : a.role === "admin" ? -1 : 1));
      setMembers(list);
      setCode((s.data as any)?.join_code ?? "");
      setFetching(false);
    });
    return () => { active = false; };
  }, [schoolId]);

  const removeTeacher = async (m: Member) => {
    if (m.role === "admin") { toast.error("Can't remove an admin"); return; }
    if (!confirm(`Remove ${m.full_name ?? "teacher"} from the school?`)) return;
    const { error } = await supabase.from("user_roles").delete().eq("user_id", m.id).eq("role", "teacher");
    if (error) { toast.error(error.message); return; }
    setMembers(prev => prev.filter(x => x.id !== m.id));
    toast.success("Teacher removed");
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(code);
    toast.success("Join code copied");
  };

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  if (!session) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center gap-3">
          <Link to="/"><Button variant="ghost" size="icon" aria-label="Back"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold leading-tight">Team</h1>
            <p className="text-xs text-muted-foreground truncate">Manage admins and teachers</p>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-5 space-y-5">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <div className="text-xs text-muted-foreground">School join code</div>
          <div className="mt-1 flex items-center gap-2">
            <code className="text-lg font-mono tracking-widest">{code || "—"}</code>
            <Button variant="outline" size="sm" onClick={copyCode} disabled={!code}>
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Share this code with teachers. They sign up via "Join school (Teacher)" using this code.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Members</span>
            <span className="ml-auto text-xs text-muted-foreground">{members.length}</span>
          </div>
          {fetching ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : members.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No members</div>
          ) : (
            <ul className="divide-y divide-border">
              {members.map(m => (
                <li key={m.id} className="p-4 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-muted grid place-items-center text-xs">
                    {(m.full_name ?? "?").slice(0,1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{m.full_name ?? "Unnamed"}{m.id === user?.id && " (you)"}</div>
                    <div className="text-xs capitalize text-muted-foreground">{m.role}</div>
                  </div>
                  {m.role === "teacher" && (
                    <Button variant="ghost" size="icon" onClick={() => removeTeacher(m)} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}