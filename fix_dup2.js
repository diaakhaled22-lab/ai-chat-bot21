const fs = require('fs');

let content = fs.readFileSync('artifacts/chatbot-admin/src/pages/client/ClientLeads.tsx', 'utf8');

// Remove all occurrences of the block using regex
content = content.replace(/  const queryClient = useQueryClient\(\);[\s\S]*?deleteLeadMutation\.mutate\(leadId\);\n    \}\n  \};\n/g, '');

const block = `  const queryClient = useQueryClient();

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

content = content.replace('  const [search, setSearch] = useState("");', '  const [search, setSearch] = useState("");\n' + block);

fs.writeFileSync('artifacts/chatbot-admin/src/pages/client/ClientLeads.tsx', content);
