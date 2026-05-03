import { redirect } from "next/navigation";

type Query = string | string[] | undefined;

function first(v: Query): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export default async function DashboardEntry({
  searchParams,
}: {
  searchParams?: Promise<Record<string, Query>>;
}) {
  const params = (await searchParams) ?? {};
  const legacyTab = first(params.legacyTab || params.tab);
  const view = first(params.view);

  if (legacyTab === "pipeline") redirect("/dashboard/install?view=pipeline");
  if (legacyTab === "equipment") redirect("/dashboard/equipment");
  if (legacyTab === "analytics") redirect("/dashboard/insights?tab=analytics");
  if (legacyTab === "logs") redirect("/dashboard/insights?tab=logs");

  if (view === "card" || view === "pipeline") {
    redirect(`/dashboard/install?view=${view}`);
  }

  redirect("/dashboard/warroom");
}
