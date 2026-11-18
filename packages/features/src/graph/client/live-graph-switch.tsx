import { Switch } from "@app/components/components/switch";
import { cn } from "@app/components/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type LiveGraph = { enabled: boolean };

const KEY = ["graph", "live"];
const ENDPOINT = "/api/graph/live";

async function request(init?: RequestInit): Promise<LiveGraph> {
  const response = await fetch(ENDPOINT, init);
  const body = await response.json();
  if (!response.ok) throw new Error((body as { error: string }).error);
  return body as LiveGraph;
}

/**
 * Whether the graph is built while a meeting is recorded. It is off until switched on, because it asks
 * the Copilot model about the meeting as it happens. Changing it applies at once, also to a recording
 * that is running: the graph follows the meeting from the moment it is on.
 */
export function LiveGraphSwitch({ className }: { className?: string }) {
  const queryClient = useQueryClient();
  const setting = useQuery({ queryKey: KEY, queryFn: () => request() });
  const update = useMutation({
    mutationFn: (enabled: boolean) =>
      request({
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
      }),
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
