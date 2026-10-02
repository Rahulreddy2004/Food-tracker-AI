import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { z } from "@/lib/zod";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { authErrorMessage, useAuth } from "@/lib/auth";
import { useTitle } from "@/lib/useTitle";

import { AuthLayout } from "./AuthLayout";

const schema = z.object({ email: z.email("Enter a valid email address") });

export default function ResetPage() {
  useTitle("Reset password");
  const { resetPassword } = useAuth();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<{ email: string }>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const onSubmit = form.handleSubmit(async ({ email }) => {
    setError(null);
    try {
      await resetPassword(email);
      setSentTo(email);
    } catch (err) {
      // Don't reveal whether an account exists; only show connection-type problems.
      const message = authErrorMessage(err);
      if (message.includes("offline") || message.includes("Too many")) setError(message);
      else setSentTo(email);
    }
  });

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll email you a link to choose a new one."
      footer={
        <Link to="/sign-in" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sentTo ? (
        <div
          role="status"
          className="grid justify-items-center gap-3 rounded-lg bg-secondary-soft p-6 text-center"
        >
          <MailCheck className="size-8 text-secondary" />
          <p className="font-medium">Check your inbox</p>
          <p className="text-sm text-ink-muted">
            If an account exists for <strong className="text-ink">{sentTo}</strong>, a reset link is
            on its way.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <Field label="Email" error={form.formState.errors.email?.message ?? error ?? undefined}>
            {(p) => <Input type="email" autoComplete="email" {...p} {...form.register("email")} />}
          </Field>
          <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
