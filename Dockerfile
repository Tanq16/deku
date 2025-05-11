FROM golang:alpine AS builder

WORKDIR /app

COPY . .

# Build the application
RUN go build -ldflags="-s -w" -o deku .

# Use a minimal alpine image for running
FROM alpine:latest

WORKDIR /app

# Create data directory if not exists
RUN mkdir -p /app/data

# Copy the binary from builder
COPY --from=builder /app/deku .

# Expose the default port
EXPOSE 8080

# Run the server
CMD ["/app/deku"]
