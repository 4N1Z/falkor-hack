import { redirect } from "next/navigation";

/** No landing page: the root sends everyone to the dashboard, which sends signed-out visitors to /login. */
export default function Home() {
  redirect("/dashboard");
}
