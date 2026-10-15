import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";



// TODO : add the logic to take all the details from the workspace and then vectoirise.
// TODO : add the logic for mindMap here
export default function EnableAIWorkspace({
  myWorkspaceId,
}: {
  myWorkspaceId: string;
}) {
  return(

    <div className="flex items-center space-x-2 my-2 w-full justify-center bg-yellow-100 border-2 border-yellow-300 rounded-md p-2">
      <Label htmlFor="airplane-mode " className="max-w-[200px]  opacity-60 text-yellow-700">Enable AI Chat for the workspace</Label>
      <Switch id="airplane-mode" />
    </div>

  )
}
