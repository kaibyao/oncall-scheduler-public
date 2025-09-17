# AWS Infrastructure Setup for Who-You-Gonna-Call CD Pipeline

This document provides step-by-step instructions for setting up the AWS infrastructure required for the GitHub Actions CD pipeline.

## Prerequisites

- AWS CLI installed and configured with appropriate permissions
- Access to an AWS account with permissions to create ECR repositories, IAM roles, and OIDC providers

## Step 1: Create ECR Repository

Create the ECR repository that will store the Docker images:

```bash
aws ecr create-repository \
  --repository-name ghost-who-you-gonna-call \
  --region us-east-1 \
  --image-scanning-configuration scanOnPush=true
```

This command creates:

- ECR repository named `ghost-who-you-gonna-call`
- Enables automatic vulnerability scanning on image push
- Uses `us-east-1` region (must match the workflow configuration)

## Step 2: Set Up GitHub OIDC Identity Provider

Check if the GitHub OIDC provider already exists (only needed once per AWS account):

```bash
aws iam list-open-id-connect-providers --query 'OpenIDConnectProviderList[?contains(Arn, `token.actions.githubusercontent.com`)]'
```

If no provider exists, create it:

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 \
  --client-id-list sts.amazonaws.com
```

## Step 3: Create IAM Role for GitHub Actions

### 3.1 Create Trust Policy

Create a file named `github-actions-trust-policy.json`:

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

**Important**: Replace `YOUR_AWS_ACCOUNT_ID` with your actual AWS account ID.

### 3.2 Create IAM Role

```bash
aws iam create-role \
  --role-name github-actions-ecr-who-you-gonna-call \
  --assume-role-policy-document file://github-actions-trust-policy.json
```

## Step 4: Create and Attach ECR Permissions Policy

### 4.1 Create Permissions Policy

Create a file named `ecr-push-policy.json`:

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
      "Resource": "arn:aws:ecr:us-east-1:YOUR_AWS_ACCOUNT_ID:repository/ghost-who-you-gonna-call"
    }
  ]
}
```

**Important**: Replace `YOUR_AWS_ACCOUNT_ID` with your actual AWS account ID.

### 4.2 Create and Attach Policy

```bash
# Create the policy
aws iam create-policy \
  --policy-name ECRPushPolicy-who-you-gonna-call \
  --policy-document file://ecr-push-policy.json

# Attach the policy to the role
aws iam attach-role-policy \
  --role-name github-actions-ecr-who-you-gonna-call \
  --policy-arn arn:aws:iam::YOUR_AWS_ACCOUNT_ID:policy/ECRPushPolicy-who-you-gonna-call
```

**Important**: Replace `YOUR_AWS_ACCOUNT_ID` with your actual AWS account ID.

## Step 5: Get the Role ARN

Get the ARN of the created role for use in GitHub secrets:

```bash
aws iam get-role \
  --role-name github-actions-ecr-who-you-gonna-call \
  --query 'Role.Arn' \
  --output text
```

Save this ARN - you'll need it for the GitHub repository configuration.

## Verification

To verify the setup:

1. **ECR Repository**: Check that the repository exists

   ```bash
   aws ecr describe-repositories --repository-names ghost-who-you-gonna-call
   ```

2. **IAM Role**: Verify the role exists and has the correct trust policy

   ```bash
   aws iam get-role --role-name github-actions-ecr-who-you-gonna-call
   ```

3. **Policy Attachment**: Confirm the ECR policy is attached
   ```bash
   aws iam list-attached-role-policies --role-name github-actions-ecr-who-you-gonna-call
   ```

## Security Notes

- The trust policy restricts access to only the `main` branch of the specific repository
- ECR permissions are scoped to only the target repository
- No long-lived access keys are used - only temporary tokens via OIDC
- Image scanning is enabled for vulnerability detection

## Cleanup (if needed)

To remove the infrastructure:

```bash
# Detach policy from role
aws iam detach-role-policy \
  --role-name github-actions-ecr-who-you-gonna-call \
  --policy-arn arn:aws:iam::YOUR_AWS_ACCOUNT_ID:policy/ECRPushPolicy-who-you-gonna-call

# Delete policy
aws iam delete-policy \
  --policy-arn arn:aws:iam::YOUR_AWS_ACCOUNT_ID:policy/ECRPushPolicy-who-you-gonna-call

# Delete role
aws iam delete-role --role-name github-actions-ecr-who-you-gonna-call

# Delete ECR repository (WARNING: This deletes all images)
aws ecr delete-repository \
  --repository-name ghost-who-you-gonna-call \
  --force
```
