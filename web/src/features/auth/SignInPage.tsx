import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { authErrorMessage, useAuth } from "@/lib/auth";
import { useTitle } from "@/lib/useTitle";

import { AuthLayout, GoogleIcon, OrDivider } from "./AuthLayout";

const schema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});
type Values = z.infer<typeof schema>;

export default function SignInPage() {
  useTitle("Sign in");
  const { signIn, signInWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = form.handleSubmit(async ({ email, password }) => {
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(authErrorMessage(err));
    }
  });

  const google = async () => {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(authErrorMessage(err));
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to see today's meals and your progress."
      footer={
        <>
          New here?{" "}
          <Link to="/sign-up" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <Button variant="secondary" size="lg" className="w-full" onClick={google} type="button">
        <GoogleIcon /> Continue with Google
      </Button>
      <OrDivider />
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <Field label="Email" error={form.formState.errors.email?.message}>
          {(p) => (
            <Input
              type="email"
              autoComplete="email"
              inputMode="email"
              {...p}
              {...form.register("email")}
            />
          )}
        </Field>
        <Field label="Password" error={form.formState.errors.password?.message}>
          {(p) => (
            <Input
              type="password"
              autoComplete="current-password"
              {...p}
              {...form.register("password")}
            />
          )}
        </Field>
        <div className="-mt-1 text-right">
          <Link to="/reset" className="text-sm font-medium text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        {error && (
          <p role="alert" className="rounded-md bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? (
            <Spinner className="text-primary-fg" label="Signing in" />
          ) : (
            "Sign in"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
