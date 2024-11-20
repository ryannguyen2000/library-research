"use client";

import { useFormState } from "react-dom";
import { createUser } from "../app/email/actions";

const initialState = {
  message: "",
};

export default function EmailForm() {
  const [state, formAction] = useFormState(createUser, initialState);

  return (
    <form action={formAction}>
      <label htmlFor="email">Email</label>
      <input type="text" id="email" name="email" required />
      <p aria-live="polite">{state?.message}</p>
      <button>Sign up</button>
    </form>
  );
}
