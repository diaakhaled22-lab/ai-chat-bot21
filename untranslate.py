import os
import re

# Extract English translations
with open('artifacts/chatbot-admin/src/i18n/translations.ts', 'r', encoding='utf-8') as f:
    content = f.read()

en_start = content.find('en: {')
ar_start = content.find('  ar: {')
en_block = content[en_start:ar_start]

# Parse translation keys and values
translations = {}
# Match key: "value" or key: 'value'
for match in re.finditer(r'([a-zA-Z0-9_]+):\s*"([^"]*)",', en_block):
    translations[match.group(1)] = match.group(2)
for match in re.finditer(r'([a-zA-Z0-9_]+):\s*\'([^\']*)\',', en_block):
    translations[match.group(1)] = match.group(2)

def untranslate_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        file_content = f.read()
    
    # Replace {t("key")} or {t('key')}
    def replace_jsx(m):
        key = m.group(1)
        if key in translations:
            return translations[key]
        return m.group(0)
    
    # Replace t("key") or t('key') in strings or attributes (e.g. placeholder={t("key")})
    # If it's inside {}, we usually want "string" if it's JSX. 
    # Let's handle JSX `{t("key")}` -> `"string"` 
    def replace_jsx_t(m):
        key = m.group(1)
        if key in translations:
            return translations[key]
        return m.group(0)

    # Replace `{t("key")}` with `Translated String`
    new_content = re.sub(r'\{t\([\'"]([a-zA-Z0-9_]+)[\'"]\)\}', replace_jsx_t, file_content)
    
    # Replace `t("key")` with `"Translated String"` (for props like label=t("key"))
    def replace_prop_t(m):
        key = m.group(1)
        if key in translations:
            return f'"{translations[key]}"'
        return m.group(0)
    new_content = re.sub(r't\([\'"]([a-zA-Z0-9_]+)[\'"]\)', replace_prop_t, new_content)
    
    if new_content != file_content:
        # Check if we should remove `useLanguage` import
        if 't(' not in new_content and 'useLanguage' in new_content:
            # We might still need setLang or lang? Let's check
            if 'const { t' in new_content:
                new_content = re.sub(r'const \{[^\}]*t[^\}]*\} = useLanguage\(\);\s*', '', new_content)
            # if useLanguage is completely unused now
            if 'useLanguage' not in new_content.replace('import { useLanguage } from', ''):
                new_content = re.sub(r'import \{[^}]*useLanguage[^}]*\} from [^\n]+\n', '', new_content)

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Untranslated {filepath}")

# Process files
admin_dir = 'artifacts/chatbot-admin/src/pages/admin'
for filename in os.listdir(admin_dir):
    if filename.endswith('.tsx'):
        untranslate_file(os.path.join(admin_dir, filename))

untranslate_file('artifacts/chatbot-admin/src/components/layout/DashboardLayout.tsx')
