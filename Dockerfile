FROM public.ecr.aws/lambda/nodejs:22 as builder

# Install pnpm globally
RUN npm install -g pnpm@10.13.1

WORKDIR ${LAMBDA_TASK_ROOT}

# Copy dependency-related files first for optimal Docker layer caching
# This layer will only be invalidated when dependencies change
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install dependencies - this layer is cached as long as lockfiles don't change
RUN pnpm install --frozen-lockfile

# Copy the rest of the application source code
# This layer will be invalidated on any source code change, but dependency layer remains cached
COPY . .

RUN pnpm build

##### END BUILDER

FROM public.ecr.aws/lambda/nodejs:22 as runner

# Copy Datadog Lambda Extension
COPY --from=public.ecr.aws/datadog/lambda-extension:latest /opt/. /opt/

COPY --from=builder ${LAMBDA_TASK_ROOT}/node_modules ${LAMBDA_TASK_ROOT}/node_modules
COPY --from=builder ${LAMBDA_TASK_ROOT}/package.json ${LAMBDA_TASK_ROOT}/package.json

COPY --from=builder ${LAMBDA_TASK_ROOT}/dist ${LAMBDA_TASK_ROOT}/dist
COPY --from=builder ${LAMBDA_TASK_ROOT}/migrations ${LAMBDA_TASK_ROOT}/migrations
COPY --from=builder ${LAMBDA_TASK_ROOT}/seed-data ${LAMBDA_TASK_ROOT}/seed-data

# According to DD, we need to remove the js file since we are using ESM.
# See https://docs.datadoghq.com/serverless/aws_lambda/installation/nodejs/?tab=containerimage
RUN rm node_modules/datadog-lambda-js/dist/handler.js

# The DD_LAMBDA_HANDLER env variable (set in the terraform repo) contains the actual handler command to run.
CMD ["node_modules/datadog-lambda-js/dist/handler.handler"]
