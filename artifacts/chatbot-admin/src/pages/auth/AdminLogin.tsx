import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation, Link } from "wouter";
import { useAdminLogin, useAdminLoginVerify2fa, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, Lock, User, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { PasswordInput } from "@/components/ui/password-input";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const login = useAdminLogin();
  const verify2fa = useAdminLoginVerify2fa();

  const [tempToken, setTempToken] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    login.mutate({ data: values }, {
      onSuccess: (data) => {
        if (data.requires2FA) {
          setTempToken(data.tempToken!);
          toast({
            title: "2FA Required",
            description: "Please enter your authenticator code.",
          });
          return;
        }
        
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        toast({
          title: "Welcome back",
          description: "Successfully logged in as administrator.",
        });
        setLocation("/admin/dashboard");
      },
      onError: (error: any) => {
        toast({
          title: "Login failed",
          description: error.message || "Invalid login credentials",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div className="h-[100dvh] flex flex-col items-center bg-background p-4 py-12 sm:py-4 relative overflow-x-hidden overflow-y-auto">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-background to-background pointer-events-none" />
      
      <div className="w-full max-w-md relative z-10 my-auto shrink-0">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4 border border-primary/20 shadow-[0_0_15px_rgba(var(--primary),0.2)]">
            <Bot className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Mission Control</h1>
          <p className="text-muted-foreground mt-2">AI Deployment Management</p>
        </div>

        <Card className="border-border/50 shadow-2xl bg-card/80 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>{tempToken ? "Two-Factor Authentication" : "Admin Login"}</CardTitle>
            <CardDescription>{tempToken ? "Enter the 6-digit code from your authenticator app." : "Authenticate to access the admin portal."}</CardDescription>
          </CardHeader>
          <CardContent>
            {!tempToken ? (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <div className="relative">
                            <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Username" className="pl-9 bg-background/50" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <PasswordInput placeholder="Password" className="pl-9 bg-background/50" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={login.isPending}>
                    {login.isPending ? "Authenticating..." : "Sign In"}
                  </Button>
                </form>
              </Form>
            ) : (
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  const codeInput = (e.currentTarget.elements.namedItem("code") as HTMLInputElement).value;
                  const codeStr = codeInput.replace(/\D/g, "");
                  if (codeStr.length !== 6) {
                    toast({ title: "Invalid Code", description: "Code must be exactly 6 digits", variant: "destructive" });
                    return;
                  }
                  verify2fa.mutate({ data: { tempToken: tempToken!, code: codeStr } }, {
                    onSuccess: () => {
                      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
                      toast({ title: "Welcome back", description: "Successfully logged in as administrator." });
                      setLocation("/admin/dashboard");
                    },
                    onError: (error: any) => {
                      toast({ title: "Verification failed", description: error.message || "Invalid verification code", variant: "destructive" });
                    }
                  });
                }} 
                className="space-y-4"
              >
                <div className="space-y-2">
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input 
                      name="code"
                      type="text" 
                      placeholder="Enter 6-digit code" 
                      className="pl-9 bg-background/50 text-center text-lg font-bold tracking-widest" 
                      maxLength={6} 
                    />
                  </div>
                  <p className="text-[0.8rem] text-muted-foreground text-center">Type your 6-digit authenticator code</p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="w-full" onClick={() => setTempToken(null)} disabled={verify2fa.isPending}>
                    Back
                  </Button>
                  <Button type="submit" className="w-full" disabled={verify2fa.isPending}>
                    {verify2fa.isPending ? "Verifying..." : "Verify Code"}
                  </Button>
                </div>
              </form>
            )}

            {!tempToken && (
              <div className="mt-6 text-center text-sm text-muted-foreground border-t border-border pt-4 space-y-2">
                <div>
                  <Link href="/forgot-password" className="text-primary hover:underline">Forgot password?</Link>
                </div>
                <div>
                  Client user? <Link href="/client-login" className="text-primary hover:underline">Client Login</Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
