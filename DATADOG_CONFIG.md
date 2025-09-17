# Datadog Lambda Configuration

This document outlines the required environment variables and configuration for Datadog monitoring in the Who-You-Gonna-Call Lambda function.

## Required Environment Variables

### Core Datadog Configuration

- `DD_API_KEY_SECRET_ARN` - AWS Secrets Manager ARN containing your Datadog API key (recommended)
  - Alternative: `DD_API_KEY` - Direct Datadog API key (less secure)
- `DD_SITE` - Datadog site URL (e.g., `datadoghq.com`, `datadoghq.eu`, `us5.datadoghq.com`)
- `DD_LAMBDA_HANDLER` - Your original Lambda handler path: `src/index.handler`

### Tracing Configuration

- `DD_TRACE_ENABLED=true` - Enable distributed tracing
- `DD_FLUSH_TO_LOG=true` - Send traces through CloudWatch logs when using extension

### Service Identification (Recommended)

- `DD_ENV` - Environment name (e.g., `dev`, `staging`, `prod`)
- `DD_SERVICE` - Service name (e.g., `who-you-gonna-call`, `ghost-oncall-scheduler`)
- `DD_VERSION` - Version identifier (e.g., `1.0.0`, `v1.2.3`)

### Optional Configuration

- `DD_TAGS` - Additional custom tags (format: `key1:value1,key2:value2`)
- `DD_LOG_LEVEL=info` - Datadog extension log level (`debug`, `info`, `warn`, `error`)
- `DD_SERVERLESS_LOGS_ENABLED=true` - Enable log collection (default: true)

## Example Lambda Function Configuration

```yaml
Environment:
  Variables:
    DD_API_KEY_SECRET_ARN: arn:aws:secretsmanager:us-east-1:account_id:secret:datadog-api-key
    DD_SITE: datadoghq.com
    DD_LAMBDA_HANDLER: src/index.handler
    DD_TRACE_ENABLED: true
    DD_FLUSH_TO_LOG: true
    DD_ENV: prod
    DD_SERVICE: who-you-gonna-call
    DD_VERSION: 1.0.0
    DD_TAGS: team:ghost,component:scheduler
```

## AWS Secrets Manager Setup

1. Create a secret in AWS Secrets Manager containing your Datadog API key:

```bash
aws secretsmanager create-secret \
  --name datadog-api-key \
  --secret-string "your-datadog-api-key"
```

2. Grant your Lambda execution role permission to read the secret:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "arn:aws:secretsmanager:us-east-1:account_id:secret:datadog-api-key*"
    }
  ]
}
```

## Docker Image Build

The Docker image is now configured with:

- Datadog Lambda Extension (v82)
- Datadog Lambda JavaScript library
- Datadog tracing library (dd-trace)

Build and deploy as usual - the extension will automatically start when the Lambda function is invoked.

## Monitoring Features

With this configuration, you'll get:

- Real-time function metrics and performance monitoring
- Distributed tracing across your Ghost on-call scheduler workflow
- Custom metrics capability
- Error tracking and alerting
- Integration with Datadog's AWS Lambda monitoring dashboard
