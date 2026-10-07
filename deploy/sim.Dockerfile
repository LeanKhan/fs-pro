# Sim service: the Go HTTP service plus the Rust engine's `sim-cli`
# (outside Windows the service runs one sim-cli process per match).
FROM rust:1-bookworm AS engine
WORKDIR /src
COPY crates/sim-core ./
RUN cargo build --release --bin sim-cli

FROM golang:1.24-bookworm AS service
WORKDIR /src
COPY services/sim-service ./
RUN CGO_ENABLED=0 go build -o /out/sim-service .

FROM debian:bookworm-slim
RUN useradd --system --no-create-home sim
COPY --from=engine /src/target/release/sim-cli /usr/local/bin/sim-cli
COPY --from=service /out/sim-service /usr/local/bin/sim-service
ENV SIM_CORE_CLI_PATH=/usr/local/bin/sim-cli \
    SIM_SERVICE_HOST=0.0.0.0 \
    PORT=5050
EXPOSE 5050
USER sim
CMD ["sim-service"]
