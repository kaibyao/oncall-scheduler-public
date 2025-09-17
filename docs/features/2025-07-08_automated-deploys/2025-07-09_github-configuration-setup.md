# GitHub Configuration Setup for Who-You-Gonna-Call CD Pipeline

This document provides step-by-step instructions for configuring GitHub repository settings, environments, and secrets for the CD pipeline.

## Prerequisites

- AWS infrastructure setup completed (see `aws-infrastructure-setup.md`)
- Repository admin access to configure environments and secrets
- AWS IAM role ARN from the infrastructure setup

## Step 1: Create Production Environment

### 1.1 Navigate to Environment Settings

1. Go to your repository on GitHub
2. Click on **Settings** tab
3. In the left sidebar, click on **Environments**
4. Click **New environment**

### 1.2 Configure Production Environment

1. **Environment name**: Enter `production`
2. **Protection rules** (optional but recommended):
   - ☑️ **Required reviewers**: Add team members who should approve production deployments
   - ☑️ **Wait timer**: Set a delay before deployment (e.g., 0 minutes for immediate deployment)
   - ☑️ **Deployment branches**: Restrict to `main` branch only
3. Click **Configure environment**

## Step 2: Add Environment Secrets

### 2.1 Add AWS Role ARN Secret

In the production environment configuration:

1. Scroll down to **Environment secrets**
2. Click **Add secret**
3. **Name**: `AWS_ROLE_TO_ASSUME`
4. **Value**: Enter the IAM role ARN from Step 5 of the AWS infrastructure setup
   - Format: `arn:aws:iam::YOUR_AWS_ACCOUNT_ID:role/github-actions-ecr-who-you-gonna-call`
5. Click **Add secret**

### 2.2 Verify Secret Configuration

- The secret should appear in the Environment secrets list
- Ensure the secret name exactly matches `AWS_ROLE_TO_ASSUME` (case-sensitive)
- The workflow will reference this secret as `${{ secrets.AWS_ROLE_TO_ASSUME }}`

## Step 3: Configure Repository Settings (Optional)

### 3.1 Branch Protection Rules

To ensure only reviewed code is deployed:

1. Go to **Settings** > **Branches**
2. Click **Add rule** for the `main` branch
3. Configure protection settings:
   - ☑️ **Require a pull request before merging**
   - ☑️ **Require status checks to pass before merging**
   - ☑️ **Require branches to be up to date before merging**
   - ☑️ **Include administrators**

### 3.2 Actions Permissions

Verify GitHub Actions permissions:

1. Go to **Settings** > **Actions** > **General**
2. Ensure **Actions permissions** is set to:
   - **Allow all actions and reusable workflows** (or)
   - **Allow enterprise actions and reusable workflows** with specific approved actions
3. Verify **Workflow permissions** is set to:
   - **Read and write permissions** (required for OIDC token generation)

## Step 4: Test the Configuration

### 4.1 Trigger a Test Run

1. Make a small change to any file in the repository
2. Commit and push to the `main` branch
3. Navigate to **Actions** tab in your repository
4. You should see the "CD - Build and Push to ECR" workflow running

### 4.2 Monitor the Workflow

The workflow should:

1. ✅ Checkout repository
2. ✅ Configure AWS credentials using OIDC
3. ✅ Log in to Amazon ECR
4. ✅ Extract Docker metadata (creates tags)
5. ✅ Set up Docker Buildx
6. ✅ Build and push Docker image

### 4.3 Verify in AWS ECR

After successful completion:

1. Log into AWS Console
2. Navigate to **ECR** > **Repositories**
3. Click on `ghost-who-you-gonna-call` repository
4. You should see images with tags:
   - `production-latest` (latest build from main branch)
   - `[short-sha]` (specific commit identifier)

## Troubleshooting

### Common Issues

1. **"Error: Could not assume role"**
   - Verify the `AWS_ROLE_TO_ASSUME` secret value is correct
   - Check that the IAM role trust policy allows the repository
   - Ensure the OIDC provider is set up correctly

2. **"Error: Cannot connect to the Docker daemon"**
   - This is typically a GitHub Actions runner issue - retry the workflow

3. **"Error: Repository does not exist"**
   - Verify the ECR repository `ghost-who-you-gonna-call` exists in the correct AWS region
   - Check that the repository name in the workflow matches exactly

4. **"Error: Access denied"**
   - Verify the IAM role has the correct ECR permissions
   - Check that the ECR policy is attached to the role

### Debug Steps

1. **Check workflow logs**: Click on the failed workflow run to see detailed logs
2. **Verify environment**: Ensure the workflow is using the `production` environment
3. **Test AWS CLI access**: You can test the role assumption manually:
   ```bash
   aws sts assume-role-with-web-identity \
     --role-arn arn:aws:iam::YOUR_AWS_ACCOUNT_ID:role/github-actions-ecr-who-you-gonna-call \
     --role-session-name test-session \
     --web-identity-token $GITHUB_TOKEN
   ```

## Security Best Practices

### Environment Protection

- Always use the `production` environment for deployment secrets
- Consider requiring reviewers for production deployments
- Use deployment branches to restrict which branches can deploy

### Secret Management

- Never commit AWS credentials to the repository
- Use OIDC authentication instead of long-lived access keys
- Regularly review and rotate IAM roles if needed

### Monitoring

- Set up notifications for failed workflows
- Monitor AWS CloudTrail for unexpected API calls
- Review ECR repository access logs periodically

## Maintenance

### Regular Tasks

1. **Update Dependencies**: Keep GitHub Actions versions current
   - `actions/checkout@v4`
   - `aws-actions/configure-aws-credentials@v4`
   - `aws-actions/amazon-ecr-login@v2`
   - `docker/metadata-action@v5`
   - `docker/setup-buildx-action@v3`
   - `docker/build-push-action@v6`

2. **Review Permissions**: Quarterly review of IAM role permissions
3. **Monitor Costs**: Track ECR storage and data transfer costs
4. **Image Cleanup**: Implement ECR lifecycle policies to remove old images

### Updating the Workflow

When making changes to `.github/workflows/cd.yml`:

1. Test changes on a feature branch first
2. Use the GitHub Actions workflow syntax validator
3. Consider the impact on existing deployments
4. Update documentation if the configuration changes

## Next Steps

After successful setup:

1. Consider adding additional environments (staging, development)
2. Implement automated testing before deployment
3. Add Slack/email notifications for deployment status
4. Set up monitoring and alerting for the deployed application
5. Consider implementing automated rollback mechanisms
