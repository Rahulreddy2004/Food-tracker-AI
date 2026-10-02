import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { z } from "@/lib/zod";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { authErrorMessage, useAuth } from "@/lib/auth";
import { useTitle } from "@/lib/useTitle";

import { AuthLayout, GoogleIcon, OrDivider } from "./AuthLayout";

const schema = z.object({
  name: z.string().trim().max(60, "Keep it under 60 characters"),
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters"),
});
type Values = z.infer<typeof schema>;

export default function SignUpPage() {
  useTitle("Create account");
  const { signUp, signInWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "" },
  });

  const onSubmit = form.handleSubmit(async ({ name, email, password }) => {
    setError(null);
    try {
      await signUp(name, email, password);
    } catch (err) {
      setError(authErrorMessage(err));
    }
  });

  return (
    <AuthLayout
      title="Start with a photo"
      subtitle="Create a free account. It takes under a minute."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/sign-in" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        type="button"
        onClick={async () => {
          setError(null);
          try {
            await signInWithGoogle();
          } catch (err) {
            setError(authErrorMessage(err));
          }
        }}
      >
        <GoogleIcon /> Sign up with Google
      </Button>
      <OrDivider />
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <Field
          label="Your first name"
          hint="So the coach knows what to call you (optional)."
          error={form.formState.errors.name?.message}
        >
          {(p) => <Input autoComplete="given-name" {...p} {...form.register("name")} />}
        </Field>
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
        <Field
          label="Password"
          hint="At least 8 characters."
          error={form.formState.errors.password?.message}
        >
          {(p) => (
            <Input
              type="password"
              autoComplete="new-password"
              {...p}
              {...form.register("password")}
            />
          )}
        </Field>
        {error && (
          <p role="alert" className="rounded-md bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? (
            <Spinner className="text-primary-fg" label="Creating account" />
          ) : (
            "Create account"
          )}
        </Button>
        <p className="text-center text-xs text-ink-subtle">
          Calorie numbers are estimates. Food Tracker isn't medical advice.
        </p>
      </form>
    </AuthLayout>
  );
}
