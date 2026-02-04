# 🔐 Git Security Checklist

**READ THIS BEFORE YOUR FIRST `git push`!**

## ⚠️ Files That Should NEVER Be On GitHub

The following files contain sensitive information and must NEVER be committed:

### 🚨 Automatically Protected (by .gitignore)

These are already in `.gitignore` and won't be committed:

- ✅ `.env` - Your actual credentials
- ✅ `DAY1_SUMMARY.md` - Contains API keys and claim codes
- ✅ `SETUP_GUIDE.md` - Contains API keys in examples
- ✅ `logs/*.log` - May contain sensitive data
- ✅ `*.key`, `*.pem` - Private keys
- ✅ `wallet.json` - Wallet private keys

### ✅ Safe to Commit

These files are safe for public GitHub:

- ✅ `README.md` - Public project documentation
- ✅ `SETUP_GUIDE_PUBLIC.md` - Setup guide without secrets
- ✅ `.env.example` - Template (no real values)
- ✅ All source code in `backend/src/`
- ✅ All source code in `frontend/src/`
- ✅ `docs/PROJECT_PLAN.md` - Public roadmap
- ✅ `docs/AUTONOMY_LOG.md` - Action log (no secrets)
- ✅ `scripts/*.js` - Scripts (if they don't contain keys)
- ✅ `.gitignore` - Git ignore rules

---

## 📋 Pre-Push Checklist

**Before your first `git push`, verify:**

### Step 1: Check .gitignore is Working

```bash
# This should show .gitignore exists
ls -la | grep gitignore

# This should NOT show .env file
git status | grep "\.env$"

# This should NOT show sensitive files
git status | grep -E "DAY1_SUMMARY|SETUP_GUIDE.md"
```

### Step 2: Verify What Will Be Committed

```bash
# See what will be added
git status

# If you see .env or other sensitive files, STOP!
```

### Step 3: Double Check Before Push

```bash
# See exactly what's staged
git diff --cached --name-only

# If you see sensitive files, remove them:
git reset HEAD path/to/sensitive/file
```

---

## 🛡️ Emergency: Already Committed Sensitive Data?

If you accidentally committed sensitive information:

### Option 1: Remove from Last Commit (NOT pushed yet)

```bash
# Remove the file from git but keep locally
git rm --cached .env

# Or remove from history
git reset HEAD~1
```

### Option 2: Already Pushed to GitHub

**YOU MUST:**
1. **Delete the repository** on GitHub immediately
2. **Rotate all keys** (generate new ones):
   - Register new agent (get new API key)
   - Generate new Claude API key
   - Create new database
3. **Create fresh repository** with proper .gitignore
4. **Push clean version**

**Important:** Once on GitHub, consider keys compromised forever!

---

## ✅ Safe Git Workflow

### Initial Setup

```bash
# 1. Initialize git
git init

# 2. Verify .gitignore is working
cat .gitignore

# 3. Add files
git add .

# 4. CHECK what's being added (IMPORTANT!)
git status

# 5. If all looks good, commit
git commit -m "Initial commit - AgentPulse"

# 6. Add remote
git remote add origin YOUR_REPO_URL

# 7. FINAL CHECK before push
git diff origin/main --name-only

# 8. Push
git push -u origin main
```

### Daily Workflow

```bash
# 1. Always check status first
git status

# 2. Add only what you need
git add specific-file.js

# 3. Check again
git status

# 4. Commit
git commit -m "Description of changes"

# 5. Push
git push
```

---

## 🔍 Files to Review Before Committing

Always review these before commit:

### Scripts

Check `scripts/*.js` don't have hardcoded:
- API keys
- URLs with tokens
- Database passwords

### Documentation

Check `docs/*.md` don't contain:
- Real API keys
- Real claim codes
- Real wallet addresses
- Real database URLs

### Config Files

Ensure:
- `.env` is in `.gitignore`
- `.env.example` has only placeholders
- No config files with real credentials

---

## 📝 .gitignore Explained

Our `.gitignore` protects you from common mistakes:

```bash
# Blocks all .env files except templates
.env
.env.*
!.env.example

# Blocks specific sensitive docs
DAY1_SUMMARY.md
SETUP_GUIDE.md

# Blocks private keys
*.key
*.pem
wallet.json

# Blocks logs that might contain data
logs/
*.log
```

---

## 🆘 Quick Reference

### Check if file is ignored:

```bash
git check-ignore -v .env
# Should output: .gitignore:XX:.env    .env
```

### See what's tracked:

```bash
git ls-files
```

### Remove file from git (keep locally):

```bash
git rm --cached filename
git commit -m "Remove sensitive file"
```

---

## 🎯 Best Practices

1. **Never commit `.env`** - Always use `.env.example` template
2. **Review before push** - Use `git status` and `git diff`
3. **Use separate docs** - Keep private notes outside git
4. **Regular audits** - Periodically check what's tracked
5. **Use secrets manager** - For production, use proper secrets management

---

## 🔗 Additional Resources

- [GitHub: Removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [Git: gitignore documentation](https://git-scm.com/docs/gitignore)

---

**Remember: Once on GitHub, consider it public forever!**

Even if you delete it, it may be:
- Cached by GitHub
- Cloned by others
- Archived by bots
- Visible in git history

**Prevention is the only solution!** 🔐

---

*Stay safe! 🛡️*
