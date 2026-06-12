"use client";

import AuthGate from "../components/AuthGate";
import ConstructionHub from "@/components/ConstructionHub";

export default function Home() {
  return (
    <AuthGate>
      <ConstructionHub />
    </AuthGate>
  );
}