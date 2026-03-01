# Extension Lifecycle

Extensions live in `extensions/<name>/` as pnpm workspace packages.

## Creating an Extension

1. `mkdir -p extensions/<name>/src`
2. Create `extensions/<name>/package.json` with `openclaw` in `devDependencies`
3. Add to `.github/labeler.yml` with matching file patterns
4. Create the GitHub label: `gh label create "ext/<name>" --color "#0075ca"`
5. Implement in `extensions/<name>/src/index.ts`

## Removing an Extension

Run these steps in order — do not skip any.

1. **Check for references first:**

   ```bash
   scripts/feature-removal-checklist.sh <name>
   ```

   Fix every issue it reports before continuing.

2. **Remove the directory:**

   ```bash
   git rm -r extensions/<name>/
   ```

3. **Remove from labeler:**
   Edit `.github/labeler.yml` — delete the `<name>` block.

4. **Delete the GitHub label:**

   ```bash
   gh label delete "ext/<name>"
   ```

5. **Document in tombstones:**
   Add a row to `docs/reference/tombstones.md`:

   ```
   | <name> | YYYY-MM-DD | `<name>`, any other grep patterns |
   ```

6. **Commit:**
   ```bash
   git commit -m "chore(extensions): remove <name>"
   ```

## Checklist (copy-paste)

```
[ ] scripts/feature-removal-checklist.sh <name>  → 0 issues
[ ] git rm -r extensions/<name>/
[ ] .github/labeler.yml entry removed
[ ] gh label delete "ext/<name>"
[ ] docs/reference/tombstones.md row added
[ ] committed
```
