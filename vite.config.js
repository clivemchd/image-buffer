import { defineConfig } from 'vite';

// Dynamically set base when running inside GitHub Actions so asset URLs work on GitHub Pages.
// If repository is a user/organization pages repo (name ends with .github.io) keep base '/'.
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
let base = '/';
if (process.env.GITHUB_ACTIONS && repo && !/\.github\.io$/i.test(repo)) {
  base = `/${repo}/`;
}

export default defineConfig({
  base,
});
