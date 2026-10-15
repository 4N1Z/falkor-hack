import { auth } from "@/auth";
import { redirect } from "next/navigation";
import React from "react";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user || session === null) redirect("/login");

  return (
    <>
      {/* Main content - only visible on desktop */}
      <main className="hidden md:flex w-full h-screen font-sans">
        {children}
      </main>

      {/* Mobile message - only visible on mobile */}
      <div className="md:hidden w-full min-h-screen bg-background flex items-center justify-center p-4 font-sans">
        <div className="max-w-md text-center px-4">
          <h1 className="text-2xl font-bold mb-4 text-primary ">
            Desktop only
          </h1>
          <p className="text-muted-foreground">
            This application is optimized for larger screens. Please access it
            from your computer for the best experience.
          </p>
        </div>
      </div>
    </>
  );
}
