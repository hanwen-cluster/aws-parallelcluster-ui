FROM node:22.14-alpine
WORKDIR /app
COPY . .
COPY resources/attributions/npm-python-attributions.txt public/license.txt
# The env var is used to skip git-secrets checks, not needed for the build
ENV CI true
RUN npm ci
# Disable telemetry
#   Next.js collects completely anonymous telemetry data about general usage.
#   Learn more here: https://nextjs.org/telemetry
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run export
