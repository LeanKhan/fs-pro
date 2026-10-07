# Realtime gateway (Go). Build context: the repo root.
FROM golang:1.24-bookworm AS build
WORKDIR /src
COPY apps/fs-pro-realtime ./
RUN CGO_ENABLED=0 go build -o /out/realtime .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/realtime /realtime
ENV REALTIME_PORT=3005
EXPOSE 3005
CMD ["/realtime"]
