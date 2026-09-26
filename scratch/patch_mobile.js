const fs = require('fs');
const path = require('path');

const layoutPath = path.join(__dirname, '../artifacts/chatbot-admin/src/components/layout/DashboardLayout.tsx');
let content = fs.readFileSync(layoutPath, 'utf8');

// 1. Add imports
if (!content.includes('Sheet,')) {
    content = content.replace(
        'import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";',
        'import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";\nimport { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";'
    );
}
if (!content.includes('Menu,')) {
    content = content.replace(
        '  PenTool',
        '  PenTool, Menu'
    );
}

// 2. Add state inside DashboardLayout
if (!content.includes('const [mobileMenuOpen, setMobileMenuOpen] = useState(false);')) {
    content = content.replace(
        'const { t, lang } = useLanguage();',
        'const { t, lang } = useLanguage();\n  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);'
    );
}

// 3. Extract sidebarContent
const asideRegex = /<aside className="w-64 border-r border-border bg-card flex flex-col overflow-hidden">([\s\S]*?)<\/aside>/;
const match = content.match(asideRegex);
if (match) {
    let innerAside = match[1];
    
    // add onClick to Link
    innerAside = innerAside.replace(
        /<Link\s+key=\{link\.href\}\s+href=\{link\.href\}/g,
        '<Link\n                key={link.href}\n                href={link.href}\n                onClick={() => setMobileMenuOpen(false)}'
    );

    const sidebarContentDef = `\n  const sidebarContent = (\n    <>\n${innerAside}\n    </>\n  );\n`;

    content = content.replace(
        'const currentPage = links.find((l) => l.href === location)?.label ?? "";',
        'const currentPage = links.find((l) => l.href === location)?.label ?? "";\n' + sidebarContentDef
    );

    // Replace old <aside> with desktop <aside>
    content = content.replace(
        asideRegex,
        '<aside className="w-64 border-r border-border bg-card hidden md:flex flex-col overflow-hidden shrink-0">\n        {sidebarContent}\n      </aside>'
    );
}

// 4. Update Header for Mobile Menu
const headerRegex = /<header className="py-\[17px\] border-b border-border bg-card\/50 backdrop-blur-sm flex items-center justify-between px-8 shrink-0">\s*<p className="text-sm font-medium text-foreground">\{currentPage\}<\/p>/;
const newHeader = `<header className="py-[17px] border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-4 md:px-8 shrink-0">
          <div className="flex items-center gap-3">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side={lang === "ar" ? "right" : "left"} className="w-64 p-0 flex flex-col bg-card [&>button]:hidden">
                {sidebarContent}
              </SheetContent>
            </Sheet>
            <p className="text-sm font-medium text-foreground">{currentPage}</p>
          </div>`;
content = content.replace(headerRegex, newHeader);

// Write back
fs.writeFileSync(layoutPath, content, 'utf8');
console.log('Successfully patched DashboardLayout.tsx');
