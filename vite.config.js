import { defineConfig } from 'vite';
import fs from 'fs';

// Strategy:
// 1. If VITE_BASE env var is set, use it directly.
// 2. If a CNAME file exists (root or public/) assume custom domain => base '/'.
// 3. Else, on GitHub Actions for a project (non user org page) use '/repo/'.
// 4. Fallback to relative './' which works locally and when served from a subfolder.

let base = process.env.VITE_BASE ?? null;

const hasCNAME = fs.existsSync('CNAME') || fs.existsSync('public/CNAME');
if (!base) {
  if (hasCNAME) {
    base = '/';
  } else {
    const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
    if (process.env.GITHUB_ACTIONS && repo && !/\.github\.io$/i.test(repo)) {
      base = `/${repo}/`;
    } else {
      base = './';
    }
  }
}

export default defineConfig({ base });
