"use client";

import React, { useState, useTransition, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { toast } from "sonner";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const signupSchema = loginSchema.extend({
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type LoginFormValues = z.infer<typeof loginSchema>;
type SignupFormValues = z.infer<typeof signupSchema>;

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [isPending, startTransition] = useTransition();
  const supabase = createBrowserSupabaseClient();

  // Check for error query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "not_linked") {
      toast.error("Account not linked to a tenant", {
        description: "Your account needs to be linked to a tenant. See SETUP_GUIDE.md or run link-user.sql in Supabase SQL Editor.",
        duration: 10000,
      });
    }
  }, []);

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const signupForm = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  const handleLogin = async (values: LoginFormValues) => {
    startTransition(async () => {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: values.email,
          password: values.password,
        });

        if (error) throw error;

        if (!data.session) {
          throw new Error("No session created after login");
        }

        toast.success("Logged in successfully");
        
        // Wait a bit for the session to be fully established
        await new Promise((resolve) => setTimeout(resolve, 100));
        
        // Use window.location for a full page reload to ensure session is picked up
        window.location.href = "/dashboard";
      } catch (error) {
        console.error(error);
        toast.error("Login failed", {
          description: error instanceof Error ? error.message : "Invalid credentials",
        });
      }
    });
  };

  const handleSignup = async (values: SignupFormValues) => {
    startTransition(async () => {
      try {
        const { error } = await supabase.auth.signUp({
          email: values.email,
          password: values.password,
        });

        if (error) throw error;

        toast.success("Account created", {
          description: "Please check your email to confirm your account, or contact an admin to link your account.",
        });

        // Note: User still needs to be added to app_users table by admin
        // or via SQL (see setup guide)
      } catch (error) {
        console.error(error);
        toast.error("Signup failed", {
          description: error instanceof Error ? error.message : "Unable to create account",
        });
      }
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{isLogin ? "Sign In" : "Sign Up"}</CardTitle>
          <CardDescription>
            {isLogin
              ? "Enter your credentials to access the AI Accounting Platform"
              : "Create an account to get started"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLogin ? (
            <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Email</label>
                <Input
                  type="email"
                  placeholder="admin@demo.com"
                  {...loginForm.register("email")}
                />
                {loginForm.formState.errors.email && (
                  <p className="mt-1 text-xs text-destructive">
                    {loginForm.formState.errors.email.message}
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium">Password</label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  {...loginForm.register("password")}
                />
                {loginForm.formState.errors.password && (
                  <p className="mt-1 text-xs text-destructive">
                    {loginForm.formState.errors.password.message}
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          ) : (
            <form onSubmit={signupForm.handleSubmit(handleSignup)} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Email</label>
                <Input
                  type="email"
                  placeholder="your@email.com"
                  {...signupForm.register("email")}
                />
                {signupForm.formState.errors.email && (
                  <p className="mt-1 text-xs text-destructive">
                    {signupForm.formState.errors.email.message}
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium">Password</label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  {...signupForm.register("password")}
                />
                {signupForm.formState.errors.password && (
                  <p className="mt-1 text-xs text-destructive">
                    {signupForm.formState.errors.password.message}
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium">Confirm Password</label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  {...signupForm.register("confirmPassword")}
                />
                {signupForm.formState.errors.confirmPassword && (
                  <p className="mt-1 text-xs text-destructive">
                    {signupForm.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? "Creating account..." : "Sign Up"}
              </Button>
            </form>
          )}

          <div className="text-center text-sm">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary hover:underline"
            >
              {isLogin
                ? "Don't have an account? Sign up"
                : "Already have an account? Sign in"}
            </button>
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <p className="font-medium">⚠️ Important:</p>
            <p className="mt-1">
              After signing up, you need to link your account to a tenant in the database.
            </p>
            <p className="mt-2 font-medium">Quick Setup:</p>
            <ol className="mt-1 list-decimal list-inside space-y-1">
              <li>Go to Supabase Dashboard → Authentication → Users</li>
              <li>Copy your User ID (UUID)</li>
              <li>Run <code className="bg-amber-100 px-1 rounded">link-user.sql</code> in Supabase SQL Editor</li>
              <li>Replace the placeholders with your User ID and email</li>
            </ol>
            <p className="mt-2">See SETUP_GUIDE.md for detailed instructions.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


