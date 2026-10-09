# Worldgen service: the Go generator in services/worldgen (names, faces,
# news, ...).
FROM golang:1.24-bookworm AS service
WORKDIR /src
COPY services/worldgen ./
RUN CGO_ENABLED=0 go build -o /out/worldgen .

FROM debian:bookworm-slim
RUN useradd --system --no-create-home worldgen
COPY --from=service /out/worldgen /usr/local/bin/worldgen
ENV WORLDGEN_SERVICE_HOST=0.0.0.0 \
    WORLDGEN_SERVICE_PORT=3004 \
    PORT=3004
EXPOSE 3004
USER worldgen
CMD ["worldgen"]
