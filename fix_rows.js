const fs = require('fs');

let content = fs.readFileSync('artifacts/chatbot-admin/src/pages/client/ClientLeads.tsx', 'utf8');

// Fix headers
content = content.replace(/<th className="px-4 sm:px-6 py-4 font-semibold w-12"><\/th>\s*<th className="px-4 sm:px-6 py-4 font-semibold w-12"><\/th>/g, '<th className="px-4 sm:px-6 py-4 font-semibold w-12"></th>');

// Fix the rows
const rowEndCode = `                      <td className="px-4 sm:px-6 py-4 text-muted-foreground">{new Date(lead.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 sm:px-6 py-4">
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(lead.id)} disabled={deleteLeadMutation.isPending}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>`;

content = content.replace(/<td className="px-4 sm:px-6 py-4 text-muted-foreground">\{new Date\(lead\.createdAt\)\.toLocaleDateString\(\)\}<\/td>\s*<\/tr>/g, rowEndCode);

// Also fix skeleton rows just in case
const skeletonEndCode = `<td className="px-4 sm:px-6 py-4"><Skeleton className="h-4 w-24" /></td>
                      <td className="px-4 sm:px-6 py-4"><Skeleton className="h-8 w-8 rounded-md" /></td>
                    </tr>`;

content = content.replace(/<td className="px-4 sm:px-6 py-4"><Skeleton className="h-4 w-24" \/><\/td>\s*<\/tr>/g, skeletonEndCode);

fs.writeFileSync('artifacts/chatbot-admin/src/pages/client/ClientLeads.tsx', content);
