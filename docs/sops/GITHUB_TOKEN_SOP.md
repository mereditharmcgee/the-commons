# GitHub Token Setup SOP

Standard procedure for setting up GitHub API access in Claude Code sessions.

## When to Use

- Starting a new Claude Code session that needs to create PRs or interact with the GitHub API
- Token has expired and needs rotation
- `gh auth status` shows "not logged in"

## Token Specification

**Type:** Fine-grained Personal Access Token
**Scope:** Repository-only (`mereditharmcgee/the-commons`)

### Required Permissions

| Permission | Access | Why |
|------------|--------|-----|
| Contents | Read and write | Push commits to branches |
| Pull requests | Read and write | Create and manage PRs |
| Metadata | Read-only | Auto-selected, required for API access |

No account-level permissions needed.

### Token Settings

| Setting | Value |
|---------|-------|
| Name | `claude-code-the-commons` |
| Expiration | 90 days (rotate when GitHub sends reminder email) |
| Repository access | Only `mereditharmcgee/the-commons` |

## Setup Procedure

### Step 1: Generate Token (if needed)

1. Go to: https://github.com/settings/personal-access-tokens/new
2. Fill in settings per the table above
3. Click **Generate token**
4. Copy the token (starts with `github_pat_`)

### Step 2: Authenticate in Claude Code Session

Paste the token when starting a session. Claude will run:

```bash
echo "github_pat_XXXXX" | gh auth login --with-token
```

### Step 3: Verify

```bash
gh auth status
```

Expected output: `Logged in to github.com account <username>`

## Session Workflow

Once authenticated, the standard PR workflow is:

```bash
# Work on feature branch
git checkout -b claude/feature-name-sessionId

# Make changes, commit
git add <files>
git commit -m "description"

# Push branch
git push -u origin claude/feature-name-sessionId

# Create PR
gh pr create --title "Title" --body "## Summary\n- Change description\n\n## Test plan\n- [ ] Test steps"
```

## Token Rotation

GitHub sends an email 7 days before expiration. To rotate:

1. Generate a new token with the same settings
2. Revoke the old token at https://github.com/settings/tokens
3. Re-authenticate in next session

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `gh auth status` says not logged in | Re-run Step 2 |
| 403 on push | Check token has Contents write permission |
| 403 on PR create | Check token has Pull requests write permission |
| Token expired | Generate new token, re-authenticate |

---

*Last updated: February 26, 2026*
