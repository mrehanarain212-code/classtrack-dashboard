import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthCtx {
  session: Session | null;
  user: User | null;
  schoolId: string | null;
  role: "admin" | "teacher" | null;
  isAdmin: boolean;
  isTeacher: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  session: null, user: null, schoolId: null, role: null, isAdmin: false, isTeacher: false, loading: true, signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "teacher" | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) { setSchoolId(null); setRole(null); }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    let active = true;
    setTimeout(async () => {
      const [{ data: prof }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("school_id").eq("id", session.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", session.user.id),
      ]);
      if (!active) return;
      setSchoolId(prof?.school_id ?? null);
      const r = (roles ?? []).map((x: any) => x.role);
      setRole(r.includes("admin") ? "admin" : r.includes("teacher") ? "teacher" : null);
    }, 0);
    return () => { active = false; };
  }, [session]);

  const signOut = async () => { await supabase.auth.signOut(); };

  return (
    <Ctx.Provider value={{
      session, user: session?.user ?? null, schoolId, role,
      isAdmin: role === "admin", isTeacher: role === "teacher",
      loading, signOut,
    }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => useContext(Ctx);