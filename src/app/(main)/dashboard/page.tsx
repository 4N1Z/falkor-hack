import db from "@/db";
import { redirect } from "next/navigation";
import DashboardSetup from "./_components/dashboard-setup";
import { getUserSubscriptionUser } from "@/db/actions/get-user-subscription";
import { auth } from "@/auth";
import OnboardingForm from "@/components/blocks/onboarding/onboarding-form";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  // console.log("Session in dashboard :: ", session.user);

  const workspace = await db.query.workspaces.findFirst({
    where: (workspace, { eq }) =>
      eq(workspace?.workspaceOwner, session.user?.id!),
  });

  const userData = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.id, session.user?.id!),
    columns: {
      onBoardingData: true,
    },
  });

  // console.log("In dashboard :: ", session.user, "\n", userData);

  const { data: subscription, error: subscriptionError } =
    await getUserSubscriptionUser(session.user?.id!);

  // If not user.advanceed_detail === null, then do Onboarding. Check DB

  if (subscriptionError) return;

  if (!userData?.onBoardingData || userData?.onBoardingData === null) {
    return (
      <div className="w-full">
        <OnboardingForm />
      </div>
    );
  }


  if (!workspace) {
    return (
      <div className="h-screen w-screen flex justify-center items-center">
        <DashboardSetup user={session.user} subscription={subscription} />
      </div>
    );
  }

  // Finally: If both onboarding and workspace setup are done, go to dashboard
  redirect(`/dashboard/${workspace.id}`);
}
