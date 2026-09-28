const fs = require('fs');
let content = fs.readFileSync('artifacts/chatbot-admin/src/pages/client/ClientLeads.tsx', 'utf8');

const hookToInsert = \
  const [dateFilter, setDateFilter] = useState("all");

  const dateOptions = useMemo(() => {
    const options = [];
    const today = new Date();
    for (let i = 0; i < currentRetention; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split("T")[0];
      let label = iso;
      if (i === 0) label = lang === "ar" ? \\\????? (\)\\\ : \\\Today (\)\\\;
      else if (i === 1) label = lang === "ar" ? \\\??? (\)\\\ : \\\Yesterday (\)\\\;
      options.push({ value: iso, label });
    }
    return options;
  }, [currentRetention, lang]);
\;

content = content.replace(
  '  const [search, setSearch] = useState("");',
  '  const [search, setSearch] = useState("");' + hookToInsert
);

const newFilteredLeads = \
  const filteredLeads = useMemo(() => {
    if (!leads) return [];
    return leads.filter(l => {
      const matchesSearch = (l.name || "").toLowerCase().includes(search.toLowerCase()) ||
        (l.email || "").toLowerCase().includes(search.toLowerCase()) ||
        (l.phone || "").toLowerCase().includes(search.toLowerCase()) ||
        (l.interest || "").toLowerCase().includes(search.toLowerCase());
      
      let matchesDate = true;
      if (dateFilter !== "all" && l.createdAt) {
        const leadDate = new Date(l.createdAt).toISOString().split("T")[0];
        matchesDate = leadDate === dateFilter;
      }
      return matchesSearch && matchesDate;
    });
  }, [leads, search, dateFilter]);
\;

content = content.replace(
  /  const filteredLeads = useMemo\(\(\) => \{[\s\S]*?\}, \[leads, search\]\);/,
  newFilteredLeads.trim()
);

fs.writeFileSync('artifacts/chatbot-admin/src/pages/client/ClientLeads.tsx', content);
console.log("Updated hooks successfully");
