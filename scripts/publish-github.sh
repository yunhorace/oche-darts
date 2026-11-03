#!/bin/bash
# Run in the Mac's Terminal; requires Git and the GitHub CLI, but no local Node.js.
set -euo pipefail
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_name="${1:-oche-darts}"
if [[ ! "$repo_name" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo 'Repository name must contain only letters, numbers, underscores, and hyphens.' >&2
  exit 1
fi
command -v gh >/dev/null || { echo 'GitHub CLI (gh) is required.' >&2; exit 1; }
command -v git >/dev/null || { echo 'Git is required.' >&2; exit 1; }
if ! gh auth status --hostname github.com >/dev/null 2>&1; then
  echo 'GitHub needs a working login. Follow the browser sign-in below.'
  gh auth login --hostname github.com --git-protocol https --web --scopes workflow
fi
# Classic OAuth credentials need workflow scope to push the Actions file.
# Fine-grained credentials omit this header and use their configured permissions.
scopes="$(gh api --include user | sed -n 's/^[Xx]-[Oo][Aa][Uu][Tt][Hh]-[Ss][Cc][Oo][Pp][Ee][Ss]: *//p' | tr -d '\r')"
if [[ -n "$scopes" ]]; then
  case ",${scopes// /}," in
    *,workflow,*) ;;
    *) echo 'GitHub needs permission to publish the deployment workflow.'
       gh auth refresh --hostname github.com --scopes workflow ;;
  esac
fi
owner="$(gh api user --jq .login)"
repository="$owner/$repo_name"
checkout="$project_dir/.publish/$owner/$repo_name"
mkdir -p "$checkout"
trap 'echo "Publishing stopped. Fix the error above and run this publisher again to resume." >&2' ERR

if [[ ! -d "$checkout/.git" ]]; then
  git init -b main "$checkout"
fi
git -C "$checkout" config user.name "$owner"
git -C "$checkout" config user.email "$owner@users.noreply.github.com"
git -C "$checkout" config --replace-all credential.helper ''
git -C "$checkout" config --add credential.helper '!gh auth git-credential'

# Copy only website source; no credentials, local game data, or machine settings.
for item in index.html package.json README.md .gitignore src public scripts tests; do
  if [[ -d "$project_dir/$item" ]]; then
    mkdir -p "$checkout/$item"
    cp -R "$project_dir/$item/." "$checkout/$item/"
  else
    cp "$project_dir/$item" "$checkout/$item"
  fi
done
git -C "$checkout" add index.html package.json README.md .gitignore src public scripts tests
if ! git -C "$checkout" diff --cached --quiet; then
  git -C "$checkout" commit -m 'Build Oche darts scorer'
fi

# An existing unrelated repository is never adopted or overwritten.
remote="$(git -C "$checkout" remote get-url origin 2>/dev/null || true)"
if [[ -z "$remote" ]]; then
  echo "Creating public GitHub repository $repository..."
  gh repo create "$repository" --public --description 'Oche — a shared-phone darts scorer' --source "$checkout" --remote origin
  git -C "$checkout" remote set-url origin "https://github.com/$repository.git"
elif [[ "$remote" != "https://github.com/$repository.git" && "$remote" != "https://github.com/$repository" ]]; then
  echo "Unexpected remote: $remote. Nothing was pushed." >&2
  exit 1
fi
git -C "$checkout" push -u origin main

if ! gh api "repos/$repository/pages" >/dev/null 2>&1; then
  echo 'Enabling GitHub Pages...'
  gh api --method POST "repos/$repository/pages" -f build_type=workflow >/dev/null
fi

# Add the workflow after Pages is configured, so the first build can deploy.
mkdir -p "$checkout/.github/workflows"
cp "$project_dir/.github/workflows/deploy.yml" "$checkout/.github/workflows/deploy.yml"
git -C "$checkout" add .github/workflows/deploy.yml
if ! git -C "$checkout" diff --cached --quiet; then
  git -C "$checkout" commit -m 'Deploy website with GitHub Pages'
fi
git -C "$checkout" push origin main
commit="$(git -C "$checkout" rev-parse HEAD)"
echo 'Waiting for GitHub to test, build, and publish the site...'
run_id=''
for attempt in {1..24}; do
  run_id="$(gh run list --repo "$repository" --commit "$commit" --limit 1 --json databaseId --jq '.[0].databaseId // empty')"
  if [[ -n "$run_id" ]]; then break; fi
  sleep 5
done
if [[ -z "$run_id" ]]; then
  echo "No build appeared yet. Open https://github.com/$repository/actions and run Deploy Oche to GitHub Pages."
  exit 1
fi
# A rerun resumes a failed deployment without creating another repository.
conclusion="$(gh run view "$run_id" --repo "$repository" --json conclusion --jq .conclusion)"
if [[ "$conclusion" == 'failure' || "$conclusion" == 'cancelled' || "$conclusion" == 'timed_out' ]]; then
  gh run rerun "$run_id" --repo "$repository"
fi
gh run watch "$run_id" --repo "$repository" --exit-status
site_url="$(gh api "repos/$repository/pages" --jq .html_url)"
printf '\nYour website is published. Share this link with anyone:\n%s\n' "$site_url"
command -v open >/dev/null && open "$site_url" || true
