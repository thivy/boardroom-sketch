import { Switch } from "@app/ui/components/switch";
import { cn } from "@app/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request, jsonRequest } from "../../shared/client/api-request";

type LiveGraph = { enabled: boolean };

const KEY = ["graph", "live"];
const ENDPOINT = "/api/graph/live";

/**
 * Whether the graph is built while a meeting is recorded. It is off until switched on, because it asks
 * the Copilot model about the meeting as it happens. Changing it applies at once, also to a recording
 * that is running: the graph follows the meeting from the moment it is on.
 */
export function LiveGraphSwitch({ className }: { className?: string }) {
  const queryClient = useQueryClient();
  const setting = useQuery({ queryKey: KEY, queryFn: () => request<LiveGraph>(ENDPOINT) });
  const update = useMutation({
    mutationFn: (enabled: boolean) => request<LiveGraph>(ENDPOINT, jsonRequest("PUT", { enabled })),
    onSuccess: (data) => queryClient.setQueryData(KEY, data),
  });

  // Show the new position straight away, and go back to the saved one if saving fails.
  const checked = update.isPending ? update.variables : (setting.data?.enabled ?? false);

  return (
    <label
      className={cn("inline-flex items-center gap-2 text-sm", className)}
      title="While a meeting is recorded, the Copilot model reads it as it is said and builds the graph: about one call for every speaker turn, plus one for every 8 turns. It follows the meeting from the moment this is on."
    >
      <Switch
        size="sm"
        checked={checked}
        disabled={setting.isPending || update.isPending}
        onCheckedChange={(value) => update.mutate(value)}
      />
      Build graph live
      {(setting.isError || update.isError) && (
        <span role="alert" className="text-xs text-destructive">
          Could not save
        </span>
      )}
    </label>
  );
}
