import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, ShieldAlert, Trash2 } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function AdminAuditLogs() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: logs, isLoading, error } = useQuery({
    queryKey: ["admin-audit-logs"],
    queryFn: async () => {
      const data = (await customFetch("/api/admin/audit-logs")) as any[];
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await customFetch(`/api/admin/audit-logs/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-audit-logs"] });
      toast({ title: "Audit log deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete audit log", variant: "destructive" });
    },
  });

  const handleDelete = (id: number) => {
    if (!window.confirm("Delete this audit log entry? This only removes the log row.")) return;
    deleteMutation.mutate(id);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Audit Logs</h1>
        <p className="text-muted-foreground mt-2">
          Track all critical actions performed by administrators across the platform.
        </p>
      </div>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-primary" />
            Activity History
          </CardTitle>
          <CardDescription>Recent administrative changes and actions</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="p-8 text-center text-destructive">Failed to load audit logs</div>
          ) : !logs || logs.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground border-2 border-dashed border-border rounded-lg">
              No admin activity logged yet.
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {log.createdAt ? format(new Date(log.createdAt), "MMM d, yyyy HH:mm") : "-"}
                      </TableCell>
                      <TableCell className="font-medium">{log.adminUsername}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                          {log.action}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-md truncate" title={log.details || ""}>
                        {log.details || "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs font-mono">
                        {log.ipAddress || "-"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(log.id)}
                          disabled={deleteMutation.isPending}
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          aria-label="Delete audit log"
                          title="Delete audit log"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
