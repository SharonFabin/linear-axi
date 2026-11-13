# Publishing linear-axi

For team distribution of this fork, use [README installation](README.md#install).
The procedures below cover optional npm publication and AXI catalog submission.

Two independent tracks: **(A)** ship linear-axi as its own package/repo, and
**(B)** get it listed in the AXI catalog on [axi.md](https://axi.md). Track B
references the URL from track A, so do A first.

## A. Ship the standalone project

1. **Set your identity in `package.json`.** Replace the `piotrgalka` placeholder
   in `repository`, `homepage`, and `bugs` with your GitHub handle, and confirm
   `author`.
2. **Init git and commit.**
   ```bash
   git init && git add -A && git commit -m "feat: linear-axi initial release"
   ```
   (`.env` and `bench/results/` are gitignored - the API token never lands in git.)
3. **Create the GitHub repo and push** (`github.com/<you>/linear-axi`).
4. **Verify the published bundle contents** (only `dist` + `skills` ship, per
   `files`):
   ```bash
   npm run build && npm pack --dry-run
   ```
5. **Publish to npm** (public):
   ```bash
   npm publish --access public
   ```
   `prepublishOnly` runs the build and tests first. Then confirm the zero-install
   path an agent uses:
   ```bash
   npx -y @pgalka0/linear-axi --help
   ```
6. **(Optional) Advertise the skill** so agents can install it directly:
   ```bash
   npx skills add pgalka0/linear-axi --skill linear-axi -g
   ```

## B. List it in the AXI catalog

The catalog (`catalog.yaml` in `kunchenguid/axi`) is the single source of truth;
the tables on axi.md and in its README are generated from it. Contributions to
`main` must go through the [`no-mistakes`](https://github.com/kunchenguid/no-mistakes)
gate (see that repo's `CONTRIBUTING.md`).

1. **Fork and clone** `kunchenguid/axi`; set `origin` to the parent repo. Use
   Node 24 + pnpm to match CI.
   ```bash
   pnpm install --frozen-lockfile
   ```
2. **Add one community entry** to the `community` list in `catalog.yaml`:
   ```yaml
   - name: linear-axi
     url: https://github.com/<you>/linear-axi
     author: <you>
     domain: Linear
     description: "Issues: list, view, create, update, comment. Wraps the Linear GraphQL API with token-efficient TOON output and next-step hints."
   ```
3. **Regenerate the docs** (do not hand-edit the `generated:...` regions - the
   `docs-check` CI job fails on drift):
   ```bash
   pnpm run docs:gen
   ```
4. **Run the same gate commands CI runs** before pushing:
   ```bash
   pnpm run format:check
   pnpm run lint
   ```
5. **Push through the no-mistakes gate** (not to `origin`). It runs an AI
   review/test/build pipeline in an isolated worktree and opens the PR for you
   with the required signature (the `Require no-mistakes` check needs it):
   ```bash
   no-mistakes init --fork-url git@github.com:<you>/axi.git
   git add catalog.yaml README.md docs/index.html
   git commit -m "docs: add linear-axi to the community catalog"
   git push no-mistakes
   no-mistakes            # attach to the pipeline; auto-fix / review; it opens the PR
   ```

### CI checks to satisfy

- **Require no-mistakes** - the PR body needs the no-mistakes signature; pushing
  through the gate adds it.
- **docs-check** - fails on catalog/README drift; run `pnpm run docs:gen` and
  commit all generated files.
- **Guard generated files** - do not hand-edit release-please-generated files.

## Pre-flight checklist for this repo

- [x] All source and docs are ASCII (no non-English characters).
- [x] MIT `LICENSE`, publishable `package.json` (`bin`, `files`, `engines`).
- [x] `README.md`, `bench/README.md`, `skills/linear-axi/SKILL.md`.
- [x] `npm run typecheck`, `npm test`, `npm run build` pass.
- [x] Replace the `piotrgalka` placeholder handle in `package.json`.
- [ ] Optionally firm up benchmark numbers with `BENCH_REPEATS=3`.
