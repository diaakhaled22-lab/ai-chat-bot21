const fs = require('fs');
const channels = ['telegram', 'whatsapp', 'messenger', 'widget'];

for (const channel of channels) {
  const filePath = 'artifacts/api-server/src/routes/' + channel + '.ts';
  let text = fs.readFileSync(filePath, 'utf8');

  // Replace ", ," or ",\n    ," with a single comma
  text = text.replace(/,\s*,/g, ',');

  fs.writeFileSync(filePath, text, 'utf8');
}
