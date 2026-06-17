"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getUserId } from "@/lib/client/token-store";
import { Spinner } from "@/components/ui/spinner";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(getUserId() ? "/dashboard" : "/onboarding");
  }, [router]);
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner />
    </div>
  );
}
