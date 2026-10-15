// "use client";

// import { Button } from "@/components/ui/button";
// import {
//   Form,
//   FormControl,
//   FormDescription,
//   FormField,
//   FormItem,
//   FormMessage,
// } from "@/components/ui/form";
// import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
// import { ssw_logo } from "@/lib/logos";
// import { zodResolver } from "@hookform/resolvers/zod";
// import clsx from "clsx";
// import { Loader, MailCheck } from "lucide-react";
// import Link from "next/link";
import { redirect, useRouter, useSearchParams } from "next/navigation";
// import { useMemo, useState } from "react";
// import { useForm } from "react-hook-form";
// import { z } from "zod";
// import { Input } from "@/components/ui/input";
// import { FormSchema } from "@/lib/types";
// import { signup, signupTrial } from "@/lib/action/auth-action";
import { auth } from "@/auth";

// const SignUpFormSchema = z
//   .object({
//     email: z.string().describe("Email").email({ message: "Invalid Email" }),
//     password: z
//       .string()
//       .describe("Password")
//       .min(6, "Password must be minimum 6 characters"),
//     confirmPassword: z
//       .string()
//       .describe("Confirm Password")
//       .min(6, "Password must be minimum 6 characters"),
//   })
//   .refine((data) => data.password === data.confirmPassword, {
//     message: "Passwords don't match.",
//     path: ["confirmPassword"],
//   });

export default async function signUp() {

  const session = await auth();
  if(session){
    redirect("/dashboard");
  }
  // const router = useRouter();
  // const searchParams = useSearchParams();
  // const [submitError, setSubmitError] = useState("");
  // const [confirmation, setConfirmation] = useState(false);

  // const codeExchangeError = useMemo(() => {
  //   if (!searchParams) return "";
  //   return searchParams.get("error description");
  // }, [searchParams]);

  // const confirmationAndErrorStyles = useMemo(
  //   () =>
  //     clsx("bg-pink-200", {
  //       "bg-red-500/10": codeExchangeError,
  //       "border-red-500/50": codeExchangeError,
  //       "text-red-700": codeExchangeError,
  //     }),
  //   [codeExchangeError]
  // );

  // const form = useForm<z.infer<typeof SignUpFormSchema>>({
  //   mode: "onChange",
  //   resolver: zodResolver(SignUpFormSchema),
  //   defaultValues: { email: "", password: "", confirmPassword: "" },
  // });

  // const isLoading = form.formState.isSubmitting;

  // const onSubmit = async ({ email, password }: z.infer<typeof FormSchema>) => {
  //   const { error } = await signup({ email, password });
  //   if (error) {
  //     setSubmitError(error.message);
  //     form.reset();
  //     return;
  //   }
  //   setConfirmation(true);
  // };

}
