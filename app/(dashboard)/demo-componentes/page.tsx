import { notFound } from "next/navigation";
import { DemoShowcase } from "./_showcase";

export default function DemoComponentesPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DemoShowcase />;
}
