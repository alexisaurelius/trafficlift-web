import { SignUp } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function SignUpPage() {
  const { userId } = await auth();
  if (userId) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--surface)] p-8">
      <SignUp forceRedirectUrl="/dashboard" fallbackRedirectUrl="/dashboard" />
    </main>
  );
}
