"use server";

import { redirect } from "next/navigation";

export async function createUser(prevState: any, formData: FormData) {
  const res = await fetch("https://pokeapi.co/api/v2/pokemon/ditto");
  const json = await res.json();

  if (!res.ok) {
    return { message: "Please enter a valid email" };
  }
  redirect("/dashboard");
}
