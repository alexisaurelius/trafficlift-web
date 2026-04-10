import { redirect } from "next/navigation";

export default function LegacyMyObjectsPage() {
  redirect("/dashboard/my-audits");
}
