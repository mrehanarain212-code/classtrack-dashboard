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
import { GraduationCap } from "lucide-react";

const signUpSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your name").max(80),
  school_name: z.string().trim().min(2, "Enter school name").max(120),
  email: z.string().trim().email().max(255),
  password: z.string().min(8, "Min 8 characters").max(72),
});
const signInSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export default function Auth() {
  const { session, loading } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);

  if (!loading && session) return <Navigate to="/" replace />;

  const onSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = signUpSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: parsed.data.full_name, school_name: parsed.data.school_name },
      },
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Account created");
    nav("/", { replace: true });
  };

  const onSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = signInSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
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
              <TabsTrigger value="signup">Create school</TabsTrigger>
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
                <div className="space-y-2">
                  <Label htmlFor="su-name">Your name</Label>
                  <Input id="su-name" name="full_name" required className="tap-44" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-school">School name</Label>
                  <Input id="su-school" name="school_name" required className="tap-44" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-email">Email</Label>
                  <Input id="su-email" name="email" type="email" required className="tap-44" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-pw">Password</Label>
                  <Input id="su-pw" name="password" type="password" required minLength={8} className="tap-44" />
                </div>
                <Button type="submit" disabled={busy} className="w-full tap-44 bg-gradient-primary text-primary-foreground hover:opacity-90">
                  {busy ? "Creating…" : "Create account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </main>
  );
}