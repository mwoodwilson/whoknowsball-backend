# GitHub Upload Instructions for WhoKnowsBall Backend

This guide will help you upload the WhoKnowsBall backend project to GitHub.

## Prerequisites

Before you begin, ensure you have:

1. **GitHub Account**: Create one at [github.com](https://github.com) if you don't have one
2. **Git Installed**: Verify by running `git --version` in your terminal
3. **SSH Key Configured**: Set up SSH keys with GitHub following [GitHub's SSH guide](https://docs.github.com/en/authentication/connecting-to-github-with-ssh)
   - Alternatively, you can use HTTPS (instructions below include both methods)

## Step 1: Create GitHub Repository

1. Go to [github.com/new](https://github.com/new)
2. Fill in the repository details:
   - **Repository name**: `whoknowsball-backend`
   - **Description**: "Node.js backend API for WhoKnowsBall sports betting app - Backend"
   - **Visibility**: Public (or Private if you prefer)
   - **DO NOT** initialize with README, .gitignore, or license (we already have these)
3. Click "Create repository"

## Step 2: Initialize Git and Push to GitHub

Open your terminal and run the following commands:

### Using SSH (Recommended)

```bash
# Navigate to the backend directory
cd ~/Documents/github-portfolio/whoknowsball-backend

# Initialize git repository
git init

# Add all files to staging
git add .

# Create initial commit
git commit -m "Initial commit: WhoKnowsBall Node.js backend API"

# Rename branch to main
git branch -M main

# Add remote origin (replace YOUR_USERNAME with your GitHub username)
git remote add origin git@github.com:YOUR_USERNAME/whoknowsball-backend.git

# Push to GitHub
git push -u origin main
```

### Using HTTPS (Alternative)

If you prefer HTTPS or haven't set up SSH keys:

```bash
# Navigate to the backend directory
cd ~/Documents/github-portfolio/whoknowsball-backend

# Initialize git repository
git init

# Add all files to staging
git add .

# Create initial commit
git commit -m "Initial commit: WhoKnowsBall Node.js backend API"

# Rename branch to main
git branch -M main

# Add remote origin (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/whoknowsball-backend.git

# Push to GitHub
git push -u origin main
```

## Step 3: Verify Upload

1. Go to `https://github.com/YOUR_USERNAME/whoknowsball-backend`
2. Verify all files are present
3. Check that the README.md displays correctly

## Step 4: Post-Upload Configuration

### Add Repository Description

1. Go to your repository page
2. Click the gear icon next to "About"
3. Add description: "Node.js backend API for WhoKnowsBall sports betting predictions app"
4. Add website URL if applicable
5. Click "Save changes"

### Add Topics/Tags

In the same "About" section, add relevant topics:
- `nodejs`
- `typescript`
- `express`
- `supabase`
- `postgresql`
- `rest-api`
- `backend`
- `sports`
- `betting`
- `api`
- `authentication`

### Pin Repository to Profile (Optional)

1. Go to your GitHub profile
2. Click "Customize your pins"
3. Select `whoknowsball-backend`
4. Click "Save pins"

### Enable GitHub Pages (Optional)

If you want to host API documentation:
1. Go to repository Settings
2. Navigate to "Pages" in the left sidebar
3. Under "Source", select the branch and folder
4. Click "Save"

## Step 5: Change Visibility (Optional)

If you want to make the repository private later:

1. Go to repository Settings
2. Scroll to the bottom to "Danger Zone"
3. Click "Change visibility"
4. Select "Make private"
5. Confirm the action

## Important Security Notes

### Environment Variables

**CRITICAL**: Ensure your `.env` file is in `.gitignore` and never committed to GitHub.

Before pushing, verify:
```bash
cat .gitignore | grep .env
```

Your `.gitignore` should include:
```
.env
.env.local
.env.*.local
```

### Secrets Management

After uploading to GitHub:

1. **Never commit sensitive data**: API keys, database credentials, JWT secrets
2. **Use GitHub Secrets** for CI/CD:
   - Go to Settings > Secrets and variables > Actions
   - Add repository secrets for deployment
3. **Review commit history**: Ensure no secrets were accidentally committed
4. **Rotate credentials**: If you accidentally committed secrets, rotate them immediately

## Troubleshooting

### Authentication Failed (HTTPS)

If using HTTPS and authentication fails:
- You may need to use a Personal Access Token instead of your password
- Generate one at [github.com/settings/tokens](https://github.com/settings/tokens)
- Use the token as your password when prompted

### Permission Denied (SSH)

If you get "Permission denied (publickey)":
- Verify SSH key is added to GitHub: `ssh -T git@github.com`
- Follow [GitHub's SSH troubleshooting guide](https://docs.github.com/en/authentication/troubleshooting-ssh)

### Remote Already Exists

If you get "remote origin already exists":
```bash
git remote remove origin
git remote add origin git@github.com:YOUR_USERNAME/whoknowsball-backend.git
```

## Next Steps

After uploading to GitHub:

1. **Set up branch protection** (Settings > Branches) to protect the main branch
2. **Enable Dependabot** (Settings > Security) for dependency updates
3. **Configure GitHub Actions** for CI/CD (optional)
4. **Add collaborators** if working with a team (Settings > Collaborators)
5. **Create a development branch** for ongoing work:
   ```bash
   git checkout -b develop
   git push -u origin develop
   ```

## Future Updates

To push future changes:

```bash
# Make your changes, then:
git add .
git commit -m "Description of your changes"
git push
```

## CI/CD Setup (Optional)

Consider setting up GitHub Actions for:
- Automated testing
- Linting and code quality checks
- Deployment to hosting platforms (Heroku, AWS, etc.)

Example workflow file location: `.github/workflows/ci.yml`

## Additional Resources

- [GitHub Documentation](https://docs.github.com)
- [Git Basics](https://git-scm.com/book/en/v2/Getting-Started-Git-Basics)
- [Node.js Deployment Best Practices](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)
- [Supabase Documentation](https://supabase.com/docs)

## Linking Frontend and Backend

In your README files, you can link the repositories:

**Frontend README**: Add link to backend repository
```markdown
Backend repository: [whoknowsball-backend](https://github.com/YOUR_USERNAME/whoknowsball-backend)
```

**Backend README**: Add link to frontend repository
```markdown
Frontend repository: [whoknowsball-frontend](https://github.com/YOUR_USERNAME/whoknowsball-frontend)
```

---

**Security Reminder**: Always review files before committing. Use `git status` and `git diff` to check what you're about to commit. Never commit sensitive information like API keys, passwords, or private keys to public repositories.
