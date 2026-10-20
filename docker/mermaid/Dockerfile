# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM node:24.16.0-alpine3.22 AS builder

RUN apk add --no-cache build-base git python3 && corepack enable pnpm
WORKDIR /app

# Upstream is pinned so a rebuild cannot silently switch to another release.
ARG MERMAID_COMMIT=ddd7c8ea27e644dc1ba8bc0dce22f2855de1cbe1
RUN git init . && \
    git remote add origin https://github.com/mermaid-js/mermaid-live-editor.git && \
    git fetch --depth=1 origin "$MERMAID_COMMIT" && \
    git checkout --detach FETCH_HEAD && \
    test "$(git rev-parse HEAD)" = "$MERMAID_COMMIT"
RUN pnpm install --frozen-lockfile

COPY docker/mermaid/patch-upstream.py /tmp/patch-upstream.py
COPY docker/mermaid/runtime-config.ts /tmp/runtime-config.ts
RUN python3 /tmp/patch-upstream.py /app /tmp/runtime-config.ts

# The public renderers, analytics and Mermaid Chart links remain disabled.
ENV MERMAID_RENDERER_URL="" \
    MERMAID_KROKI_RENDERER_URL="" \
    MERMAID_ANALYTICS_URL="" \
    MERMAID_DOMAIN="" \
    MERMAID_IS_ENABLED_MERMAID_CHART_LINKS=""
RUN pnpm build

FROM nginx:1.28-alpine3.21 AS runtime
RUN apk add --no-cache jq
COPY docker/mermaid/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 docker/mermaid/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
COPY --from=builder /app/docs /usr/share/nginx/html
COPY --from=builder /app/LICENSE /usr/share/nginx/html/licenses/mermaid-live-editor-LICENSE
LABEL org.opencontainers.image.title="Mermaid Live Editor with runtime Kroki configuration" \
      org.opencontainers.image.licenses="MIT"
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/runtime-config.js || exit 1
