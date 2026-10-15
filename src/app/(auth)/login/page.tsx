// import { signIn } from 'next-auth/react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import SignIn from "./signin-btn";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { NeuraQueryLogoWithText } from "@/utils/neura-query-logo-component";

//TODO here I need to add the Details to SUPABASE. from DRIZLLE

export default async function LoginPage() {
  const session = await auth();
  // console.log("session", session);

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <NeuraQueryLogoWithText/>
          <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
    
          <SignIn />

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">
                or
              </span>
            </div>
          </div>

          {/* <div className="text-center text-sm">
            Don&apos;t have an account?{" "}
            <Link 
              href="/signup" 
              className="font-medium text-primary hover:underline"
            >
              Sign up
            </Link>
          </div> */}
        </CardContent>
      </Card>
    </div>
  );
}
