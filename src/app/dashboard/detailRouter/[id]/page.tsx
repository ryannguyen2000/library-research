import { redirect } from "next/navigation";
import { Suspense } from "react";

async function fetchTeam(id: string) {
  const res = await fetch("https://pokeapi.co/api/v2/pokemon/ditto");
  if (!res.ok) return undefined;
  return res.json();
}

const DashboardId = async ({ params }: { params: { id: string } }) => {
  const team = await fetchTeam(params.id);
  if (!team) {
    redirect("/");
  }
  if (team) {
    return (
      <section>
        <Suspense fallback={<p>Loading feed...</p>}>
          <div>Post</div>
        </Suspense>
        <Suspense>
          <div>Weather</div>
        </Suspense>
      </section>
    );
  }
};

export default DashboardId;
