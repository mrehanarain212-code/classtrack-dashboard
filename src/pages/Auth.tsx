import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GraduationCap, Shield, Users, Heart } from "lucide-react";

const signUpSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your name").max(80),
  school_name: z.string().trim().max(120).optional().or(z.literal("")),
  school_code: z.string().trim().max(20).optional().or(z.literal("")),
  student_roll: z.string().trim().max(40).optional().or(z.literal("")),
  mode: z.enum(["create", "join", "parent"]),
  email: z.string().trim().email().max(255),
  password: z.string().min(8, "Min 8 characters").max(72),
}).refine(d => {
  if (d.mode === "create") return !!d.school_name;
  if (d.mode === "join") return !!d.school_code;
  return !!d.school_code && !!d.student_roll;
}, {
  message: "Please fill all required fields",
  path: ["school_name"],
});
const signInSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export default function Auth() {
  const { session, loading } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [signupMode, setSignupMode] = useState<"create" | "join" | "parent">("create");

  if (!loading && session) return <Navigate to="/" replace />;

  const onSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = signUpSchema.safeParse({ ...Object.fromEntries(fd), mode: signupMode });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          full_name: parsed.data.full_name,
          school_name: signupMode === "create" ? parsed.data.school_name : undefined,
          school_code: signupMode !== "create" ? parsed.data.school_code?.toUpperCase() : undefined,
          signup_role: signupMode === "parent" ? "parent" : undefined,
          student_roll: signupMode === "parent" ? parsed.data.student_roll : undefined,
        },
      },
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(
      signupMode === "create" ? "School created — you're the admin" :
      signupMode === "parent" ? "Parent account created" : "Joined as teacher"
    );
    nav("/", { replace: true });
  };

  const onSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = signInSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    nav("/", { replace: true });
  };

  return (
    <main className="min-h-screen bg-gradient-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="h-14 w-14 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-glow">
            <GraduationCap className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">ClassTrack</h1>
          <p className="text-sm text-muted-foreground">Premium school management, simplified.</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={onSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="si-email">Email</Label>
                  <Input id="si-email" name="email" type="email" required className="tap-44" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="si-pw">Password</Label>
                  <Input id="si-pw" name="password" type="password" required className="tap-44" />
                </div>
                <Button type="submit" disabled={busy} className="w-full tap-44 bg-gradient-primary text-primary-foreground hover:opacity-90">
                  {busy ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={onSignUp} className="space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground">I am signing up as</Label>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {([
                      { id: "create", label: "Admin", sub: "Create school", icon: Shield },
                      { id: "join", label: "Teacher", sub: "Join school", icon: Users },
                      { id: "parent", label: "Parent", sub: "Track child", icon: Heart },
                    ] as const).map(opt => {
                      const Icon = opt.icon;
                      const active = signupMode === opt.id;
                      return (
                        <button key={opt.id} type="button" onClick={() => setSignupMode(opt.id)}
                          className={`tap-44 rounded-xl border p-2 flex flex-col items-center gap-1 transition ${
                            active
                              ? "border-primary bg-primary/10 text-foreground shadow-glow"
                              : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50"
                          }`}
                          aria-pressed={active}>
                          <Icon className="h-4 w-4" />
                          <span className="text-xs font-semibold leading-none">{opt.label}</span>
                          <span className="text-[10px] leading-none">{opt.sub}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-name">Your name</Label>
                  <Input id="su-name" name="full_name" required className="tap-44" />
                </div>
                {signupMode === "create" ? (
                  <div className="space-y-2">
                    <Label htmlFor="su-school">School name</Label>
                    <Input id="su-school" name="school_name" required className="tap-44" />
                  </div>
                ) : signupMode === "join" ? (
                  <div className="space-y-2">
                    <Label htmlFor="su-code">School join code</Label>
                    <Input id="su-code" name="school_code" required className="tap-44 uppercase" placeholder="e.g. AB12CD" />
                    <p className="text-[11px] text-muted-foreground">Ask your school admin for the 6-character code.</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="su-code">School join code</Label>
                      <Input id="su-code" name="school_code" required className="tap-44 uppercase" placeholder="e.g. AB12CD" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-roll">Your child's roll number</Label>
                      <Input id="su-roll" name="student_roll" required className="tap-44" />
                      <p className="text-[11px] text-muted-foreground">We'll link your account to this student.</p>
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label htmlFor="su-email">Email</Label>
                  <Input id="su-email" name="email" type="email" required className="tap-44" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-pw">Password</Label>
                  <Input id="su-pw" name="password" type="password" required minLength={8} className="tap-44" />
                </div>
                <Button type="submit" disabled={busy} className="w-full tap-44 bg-gradient-primary text-primary-foreground hover:opacity-90">
                  {busy ? "Creating…" : signupMode === "create" ? "Create school" : signupMode === "parent" ? "Create parent account" : "Join as teacher"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </main>
  );
}