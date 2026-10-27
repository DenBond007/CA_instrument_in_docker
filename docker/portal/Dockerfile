FROM ghcr.io/nginx/nginx-unprivileged:stable-alpine@sha256:2daef144b574804198caccc4041819fa1801ecd5df2252a39646bfa2b1ff3bea

USER root
RUN apk add --no-cache jq && rm -f /usr/share/nginx/html/50x.html
COPY docker/portal/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 docker/portal/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
COPY docker/portal/site/ /usr/share/nginx/html/
COPY docker/portal/LICENSE /usr/share/nginx/html/licenses/portal-LICENSE.txt
USER 101

LABEL org.opencontainers.image.title="Analyst workspace" \
      org.opencontainers.image.description="Local tool launcher with runtime URLs, search and categories" \
      org.opencontainers.image.source="https://github.com/DenBond007/CA_instrument_in_docker" \
      org.opencontainers.image.licenses="MIT"
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1
