# GitHub Actions CD Workflow Implementation Plan

## Project: Who-You-Gonna-Call - AWS ECR Deployment Pipeline

### Overview

This document outlines the implementation plan for a secure, production-ready Continuous Deployment (CD) workflow that automatically builds Docker images and pushes them to Amazon Elastic Container Registry (ECR) when code is pushed to the main branch.

## Current State Analysis

### Project Context

- **Project**: Who-You-Gonna-Call - Ghost on-call scheduler
- **Tech Stack**: Node.js v24.3.0, pnpm, TypeScript
- **Container**: Docker with existing Dockerfile
- **Target**: AWS ECR for container image storage
- **Trigger**: Push to main branch

### Existing Infrastructure

- ✅ Dockerfile configured with pnpm and Node.js 24.3.0
- ✅ Package.json with `start` script
- ✅ Basic GitHub Actions workflow trigger (`cd.yml`)
- ❌ AWS ECR integration missing
- ❌ Security configuration missing
- ❌ Image tagging strategy missing

## Implementation Phases

### Phase 1: AWS Infrastructure Setup

#### 1.1 ECR Repository Creation

```bash
# AWS CLI command to create ECR repository
aws ecr create-repository \
  --repository-name who-you-gonna-call \
  --region us-east-1 \
  --image-scanning-configuration scanOnPush=true
```

#### 1.2 OIDC Identity Provider (if not exists)

Create GitHub OIDC provider in AWS IAM:

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 \
  --client-id-list sts.amazonaws.com
```

#### 1.3 IAM Role Configuration

**Trust Policy** (`github-actions-trust-policy.json`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::YOUR_AWS_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:ghosts-inc/who-you-gonna-call:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

**Permissions Policy** (`ecr-push-policy.json`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:CompleteLayerUpload",
        "ecr:InitiateLayerUpload",
        "ecr:PutImage",
        "ecr:UploadLayerPart"
      ],
      "Resource": "arn:aws:ecr:us-east-1:YOUR_AWS_ACCOUNT_ID:repository/who-you-gonna-call"
    }
  ]
}
```

### Phase 2: GitHub Configuration

#### 2.1 Environment Setup (Recommended)

1. Navigate to repository Settings → Environments
2. Create `production` environment
3. Add environment secret: `AWS_ROLE_TO_ASSUME` with IAM role ARN
4. Optional: Configure protection rules for approvals

#### 2.2 Repository Secrets (Alternative)

If not using environments, add repository secret:

- `AWS_ROLE_TO_ASSUME`: `arn:aws:iam::YOUR_AWS_ACCOUNT_ID:role/github-actions-ecr-role`

### Phase 3: Workflow Implementation

#### 3.1 Key Components

- **Trigger**: Push to main branch only
- **Authentication**: OIDC with IAM role assumption
- **ECR Login**: aws-actions/amazon-ecr-login@v2
- **Build System**: docker/build-push-action@v6 with buildx
- **Caching**: GitHub Actions cache for Docker layers
- **Tagging**: docker/metadata-action for dynamic tags

#### 3.2 Image Tagging Strategy

- `latest` - Floating tag for main branch deployments
- `{short-sha}` - Immutable commit-based identifier
- Optional: `{version}` - If using semantic versioning with git tags

#### 3.3 Performance Optimizations

- **Docker Layer Caching**: GitHub Actions cache backend (`type=gha`)
- **Buildx**: Multi-platform builds and advanced features
- **Parallel Steps**: Where possible, run independent steps concurrently

### Phase 4: Security Considerations

#### 4.1 Principle of Least Privilege

- IAM role scoped to specific repository and branch
- ECR permissions limited to target repository only
- No long-lived access keys stored

#### 4.2 Supply Chain Security

- Pin action versions to specific commits (optional)
- Enable ECR image scanning (`scanOnPush=true`)
- Use GitHub's dependency scanning

#### 4.3 Secrets Management

- Use OIDC instead of static credentials
- Environment-scoped secrets for production deployments
- Mask sensitive outputs in logs

## Workflow Architecture

### Complete CD Pipeline Flow

```
Push to main → GitHub Actions Trigger → AWS OIDC Auth → ECR Login → Docker Build → Tag Image → Push to ECR
```

### Action Dependencies

1. `actions/checkout@v4` - Repository checkout
2. `aws-actions/configure-aws-credentials@v4` - OIDC authentication
3. `aws-actions/amazon-ecr-login@v2` - ECR authentication
4. `docker/metadata-action@v5` - Dynamic tagging
5. `docker/setup-buildx-action@v3` - Docker buildx
6. `docker/build-push-action@v6` - Build and push

## Testing & Validation

### Pre-deployment Checklist

- [ ] AWS ECR repository created
- [ ] IAM OIDC provider configured
- [ ] IAM role with proper trust/permission policies
- [ ] GitHub environment/secrets configured
- [ ] Workflow file syntax validated

### Post-deployment Validation

- [ ] Workflow executes successfully on main branch push
- [ ] Docker image appears in ECR with correct tags
- [ ] Image can be pulled and run successfully
- [ ] No sensitive information leaked in logs

## Maintenance & Monitoring

### Regular Updates

- Monitor GitHub Actions for security advisories
- Update action versions periodically
- Review IAM permissions quarterly

### Monitoring

- Watch for failed workflow runs
- Monitor ECR storage costs
- Track image vulnerabilities via ECR scanning

## Rollback Strategy

### In Case of Issues

1. **Workflow Failure**: Check AWS permissions and ECR repository access
2. **Image Issues**: Use previous SHA-tagged image for deployments
3. **Security Breach**: Rotate IAM role and update trust policies

### Emergency Procedures

- Disable workflow by commenting out trigger
- Manual image building process as backup
- Direct ECR access via AWS CLI if needed

## Cost Considerations

### AWS Costs

- ECR storage: $0.10 per GB-month
- ECR data transfer: Various rates by region
- GitHub Actions: 2000 minutes free per month

### Optimization

- Implement ECR lifecycle policies for old images
- Use multi-stage Docker builds to reduce image size
- Consider regional ECR repositories for global deployments

## Success Metrics

### Technical KPIs

- Deployment success rate: >99%
- Build time: <5 minutes typical
- Image size: Optimized for fast pulls
- Security scan results: Zero critical vulnerabilities

### Operational Benefits

- Automated deployments reduce manual errors
- Consistent image tags improve traceability
- OIDC eliminates credential management overhead

## Next Steps After Implementation

1. **Enhanced Security**: Add image vulnerability scanning workflows
2. **Multi-Environment**: Extend to staging/production environments
3. **Notifications**: Add Slack/email notifications for deployment status
4. **Rollbacks**: Implement automated rollback mechanisms
5. **Monitoring**: Integrate with AWS CloudWatch for deployment metrics

---

_This document should be updated as the implementation evolves and new requirements are identified._
