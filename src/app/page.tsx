import { redirect } from "next/navigation";

// The intro page comes in v1.1 step 3. Until then the home address opens question practice.
export default function Home() {
  redirect("/practice");
}
