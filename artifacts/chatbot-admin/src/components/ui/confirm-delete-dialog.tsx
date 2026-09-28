import { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useLanguage } from "@/hooks/use-language";

interface ConfirmDeleteDialogProps {
  onConfirm: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
}

export function ConfirmDeleteDialog({
  onConfirm,
  title,
  description,
  children,
}: ConfirmDeleteDialogProps) {
  const { lang } = useLanguage();
  
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {children}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {title || (lang === "ar" ? "تأكيد الحذف؟" : "Confirm Deletion?")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {description || (lang === "ar" 
              ? "سيتم حذف هذا العنصر نهائياً. لا يمكن التراجع عن هذا الإجراء." 
              : "This item will be permanently deleted. This action cannot be undone.")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{lang === "ar" ? "إلغاء" : "Cancel"}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.stopPropagation();
              onConfirm();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {lang === "ar" ? "حذف" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
