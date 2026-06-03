const fs = require('fs');
const path = require('path');

const OLD_STORE_ID_REGEX = /const\s+STORE_ID\s*=\s*['"]8de2930d-a196-4aa1-b9bf-7fa83321b10c['"];?/g;
const IMPORT_STATEMENT = "import { getStoreId } from '@/utils/supabase/getStore';\n";
const DYNAMIC_STORE_ID = "\n  const STORE_ID = await getStoreId();\n  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });\n";

function getFiles(dir, filesList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getFiles(filePath, filesList);
    } else if (filePath.endsWith('route.ts')) {
      filesList.push(filePath);
    }
  }
  return filesList;
}

const apiDir = path.join(__dirname, 'app', 'api');
const files = getFiles(apiDir);

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  if (content.match(OLD_STORE_ID_REGEX)) {
    // 1. Add import if not present
    if (!content.includes('getStoreId')) {
      const lastImportIndex = content.lastIndexOf('import ');
      if (lastImportIndex !== -1) {
        const endOfLine = content.indexOf('\n', lastImportIndex);
        content = content.slice(0, endOfLine + 1) + IMPORT_STATEMENT + content.slice(endOfLine + 1);
      } else {
        content = IMPORT_STATEMENT + content;
      }
    }

    // 2. Remove old STORE_ID
    content = content.replace(OLD_STORE_ID_REGEX, '');

    // 3. Inject DYNAMIC_STORE_ID inside GET, POST, PUT, DELETE
    content = content.replace(/export async function (GET|POST|PUT|DELETE|PATCH)\s*\([^)]*\)\s*\{/g, match => {
      // make sure we don't inject multiple times
      return match + DYNAMIC_STORE_ID;
    });

    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated:', file);
  }
});
