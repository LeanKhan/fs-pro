# World service: the Go service in services/world-service. It owns placement,
# the place hierarchy queries, prominence ranking, pyramid pool assignment and
# map tiles (FOR-AGENTS.md, D4). It talks to the same Postgres as the server.
FROM golang:1.24-bookworm AS service
WORKDIR /src
COPY services/world-service ./
RUN CGO_ENABLED=0 go build -o /out/world-service ./cmd/world-service

FROM debian:bookworm-slim
RUN useradd --system --no-create-home world
COPY --from=service /out/world-service /usr/local/bin/world-service
ENV WORLD_SERVICE_HOST=0.0.0.0 \
    WORLD_SERVICE_PORT=3006 \
    PORT=3006
EXPOSE 3006
USER world
CMD ["world-service"]
