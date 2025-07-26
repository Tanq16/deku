<div align="center">
<img src=".github/assets/logo.png" width="250" /><br><h1>Deku</h1>

<a href="https://github.com/tanq16/deku/actions/workflows/release.yaml"><img src="https://github.com/tanq16/deku/actions/workflows/release.yaml/badge.svg" alt="Release Build"></a>&nbsp;<a href="https://github.com/Tanq16/deku/releases"><img alt="GitHub Release" src="https://img.shields.io/github/v/release/tanq16/deku"></a>&nbsp;<a href="https://hub.docker.com/r/tanq16/deku"><img alt="Docker Pulls" src="https://img.shields.io/docker/pulls/tanq16/deku"></a>
</div>

<p align="center">
<b>Deku</b> is a simple and minimal task tracker with support for various views and task management based on completion goals.
</p>

<p align="center">
<a href="#features">Features</a>&nbsp;&bull;&nbsp;<a href="#screenshots">Screenshots</a><br><a href="#installation">Installation</a>&nbsp;&bull;&nbsp;<a href="#usage">Usage</a>
</p>

## Features

### Core Functionality
- Simple and essential task management (only uses text, due dates, completion status)
- Customizable task cycles (1h, 4h, 12h, 1d, 3d, 1w, 1m, 3m, or no cycle)
- JSON-based flat file storage system (`data/tasks.json`)
- Server-Sent Events (SSE) for real-time updates across all views
- Beautiful UI with Catppuccin theme for Tailwind CSS
- Self-contained binary and container image for easy deployment
- Notifications to Discord or [Nottif](https://github.com/tanq16/nottif) (default)

### Multiple Views
1. **Home View**
   - Add, complete, and delete tasks
   - Track task due times and overdue status in a list format
   - Toggle completed task visibility
2. **Kanban View**
   - Visual board with Upcoming, Today, Overdue, and Completed columns
   - Task cards showing due dates and completion status
3. **Calendar View**
   - Daily, weekly, and monthly calendar layouts
   - Easy navigation between time periods

### Progressive Web App (PWA)
- Install on desktop and mobile devices
- Offline capability
- Home screen icon for quick access

## Screenshots

| Desktop View | Mobile View |
| --- | --- |
| ![Desktop](.github/assets/dh.png) | ![Mobile](.github/assets/mh.png) |
| ![Desktop](.github/assets/dk.png) | ![Mobile](.github/assets/mk.png) |
| ![Desktop](.github/assets/dc.png) | ![Mobile](.github/assets/mc.png) |

## Installation

### Docker Installation (Recommended)

```bash
docker run -d \
--name deku \
-p 8080:8080 \
-v deku_data:/app/data \
-e NOTIFICATION=https://DISCORD_URL_HERE \
tanq16/deku:main
```

For Docker Compose or container management systems like Portainer/Dockge:

```yaml
services:
   deku:
      image: tanq16/deku:main
      restart: unless-stopped
      ports:
         - 8080:8080
      volumes:
         - /path/to/data:/app/data # Change as needed
      environment:
         - NOTIFICATION=https://DISCORD_URL_HERE
```

> [!NOTE]
> When `NOTIFICATION` environment variable is not provided, Deku uses `http://nottif:8080/api/send`. This setting only works when the [Nottif](https://github.com/tanq16/nottif) project is set up within the same Docker network, making it reachable via the container name and port of `nottif:8080`.

### Binary Installation

Download the appropriate binary for your system from the [latest release](https://github.com/tanq16/deku/releases/latest).

Run the binary and the application will be available at `http://localhost:8080`.

### Building from Source

```bash
git clone https://github.com/tanq16/deku.git && \
cd deku && \
go build .
```

With Go 1.24+ installed, you can also use:

```bash
go install github.com/tanq16/deku@latest
```

## Usage

Access the web interface through your browser at `http://localhost:8080/`

Navigate between different views using the sidebar:
- Home (list view): `http://localhost:8080/`
- Kanban board: `http://localhost:8080/kanban`
- Calendar: `http://localhost:8080/calendar`

> [!NOTE]
> This app has no authentication, so deploy carefully. It works well with a reverse proxy like Nginx Proxy Manager and is mainly intended for homelab use.
