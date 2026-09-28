const fs = require('fs');

let content = fs.readFileSync('artifacts/chatbot-admin/src/pages/client/ClientLeads.tsx', 'utf8');

const duplicateBlock = `  const queryClient = useQueryClient();

  const deleteLeadMutation = useMutation({
    mutationFn: async (leadId: number) => {
      const res = await fetch(\`/api/client/leads/\${leadId}\`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to delete lead');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-leads"] });
    }
  });

  const handleDelete = (leadId: number) => {
    if (confirm(lang === "ar" ? "هل أنت متأكد من حذف هذا العميل؟" : "Are you sure you want to delete this lead?")) {
      deleteLeadMutation.mutate(leadId);
    }
  };
`;

// Just clean it all up
content = content.replace(duplicateBlock, ''); // Remove first one
content = content.replace(duplicateBlock, ''); // Remove second one just in case
content = content.replace(duplicateBlock, ''); // Remove third one just in case

// Re-add exactly once
content = content.replace('  const [search, setSearch] = useState("");', '  const [search, setSearch] = useState("");\n' + duplicateBlock);

fs.writeFileSync('artifacts/chatbot-admin/src/pages/client/ClientLeads.tsx', content);
