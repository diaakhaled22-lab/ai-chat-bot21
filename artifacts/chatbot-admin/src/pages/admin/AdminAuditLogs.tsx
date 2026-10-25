import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, ShieldAlert, Trash2 } from "lucide-react";
import { deleteAdminAuditLog, customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function AdminAuditLogs() {
  const { lang } = useLanguage();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deleteId, setDeleteId] = React.useState<number | null>(null);

  const { data: logs, isLoading, error } = useQuery({
    queryKey: ["admin-audit-logs"],
    queryFn: async () => {
      const data = (await customFetch("/api/admin/audit-logs")) as any[];
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await deleteAdminAuditLog(id);
    },
    onSuccess: () => {
      setDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ["admin-audit-logs"] });
      toast({ title: "Audit log deleted successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete audit log", description: err?.message || String(err), variant: "destructive" });
    },
  });

  const handleDelete = (id: number) => {
    setDeleteId(id);
  };

  return (
    <>
    <div className="space-y-6">
      {/* ── Hero Operations Banner matching Bot Manager Login aesthetic ── */}
      <div
        className="relative overflow-hidden rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-blue-600/15 border border-white/10"
        style={{
          background: "linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #1d4ed8 100%)",
        }}
      >
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute right-40 -top-10 w-48 h-48 bg-blue-300/20 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.18)] flex items-center justify-center shrink-0">
              <i className="fa-solid fa-clock-rotate-left text-2xl sm:text-3xl text-white"></i>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-semibold text-blue-100 mb-1.5 border border-white/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {lang === "ar" ? "سجل الرقابة والتتبع" : "Audit Trail & Compliance"}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
                {lang === "ar" ? "سجل تدقيق المشرفين" : "Admin Audit Logs"}
              </h1>
              <p className="text-xs sm:text-sm text-blue-100/90 mt-1 max-w-xl leading-relaxed">
                {lang === "ar"
                  ? "تتبع كافة الإجراءات والعمليات الحساسة التي قام بها المسؤولون عبر المنصة."
                  : "Track all critical actions and sensitive changes performed by administrators across the platform."}
              </p>
            </div>
          </div>
        </div>
      </div>

      <Card className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
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
            <div className="border border-[#DCE7FF] dark:border-slate-800 rounded-xl overflow-hidden shadow-inner">
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
    <AlertDialog
      open={deleteId !== null}
      onOpenChange={(open) => {
        if (!open && !deleteMutation.isPending) setDeleteId(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete audit log entry?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes only this audit log row. The original action and related company data will not be changed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteMutation.isPending || deleteId === null}
            onClick={() => {
              if (deleteId !== null) deleteMutation.mutate(deleteId);
            }}
          >
            {deleteMutation.isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
