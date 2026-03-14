"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BulletinsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/dashboard/grades?tab=bulletin"); }, [router]);
  return null;
}
