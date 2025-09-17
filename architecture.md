# Who-You-Gonna-Call Architecture

This document provides a high-level overview of the Who-You-Gonna-Call system architecture.

The editable version is [on Figma](https://www.figma.com/board/NcqicURwVUmSI8u1tZPoSj/Oncall-Schedule-Architecture?node-id=0-1&t=BuUxzPqn6hKrGIIf-1).

## Architecture Diagram

<img width="4540" height="2624" alt="image" src="https://github.com/user-attachments/assets/f1db15b4-e569-4231-8b29-07b87380cac6" />

## Component Overview

### AWS Infrastructure

- **Lambda Functions**: Core scheduling logic running in dev/staging environments
- **ECR Repository**: Stores Docker images for production deployment
- **EFS Storage**: Persistent file system hosting the SQLite database
- **EventBridge Scheduler**: Triggers daily schedule generation

### External Integrations

- **Google Calendar API**: Provides EPD vacation calendar data (14+ days advance notice required)
- **Notion Database**: Receives and displays generated schedules
- **Slack Integration**: Sends notifications to affected users and channels
- **n8n Workflow**: Transforms Slack workflow requests into Lambda invocations for overrides

### Data Flow

1. **Daily Scheduling**: EventBridge triggers Lambda function to generate 14-day lookahead schedules
2. **Vacation Integration**: Lambda pulls vacation data from Google Calendar API
3. **Schedule Publishing**: Updated schedules are pushed to Notion database
4. **Notifications**: Affected users/channels are notified via Slack
5. **Override Handling**: Slack workflows → n8n transformation → Lambda invocation for schedule overrides

## Deployment Strategy

- **Dev/Staging**: Direct Lambda deployment
- **Production**: Containerized deployment using Docker images stored in ECR
- **Database**: Shared SQLite file on EFS accessible by all environments
