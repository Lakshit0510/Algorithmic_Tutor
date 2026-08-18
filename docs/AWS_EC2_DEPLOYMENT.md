# Deploy Algorithmic Tutor to GitHub and AWS EC2

This guide deploys one Docker image on one EC2 instance. It has no authentication: the browser holds one opaque session ID in `sessionStorage`; the server stores that session's tutoring context in SQLite until inactivity expiry.

## 1. Prerequisites

Have these before starting:

- Git, Node 22.13+, pnpm, and Docker Desktop on the development computer
- A GitHub account
- An AWS account, a domain name, and an OpenAI API key with GPT-5.4 access
- An Ubuntu 24.04 x86_64 EC2 instance and an Elastic IP

Use the AWS console's Free Tier eligibility indicator when selecting the instance. The application uses OpenAI in the cloud; do not run Ollama or download a GGUF model on the EC2 instance.

## 2. Verify the local repository

From the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build
docker build -t algorithmic-tutor:local .
```

Copy `.env.production.example` to `.env.production`. For a local container smoke test, set `DOMAIN=localhost`, set a valid OpenAI key, and run:

```powershell
docker run --rm --env-file .env.production -p 8787:8787 algorithmic-tutor:local
```

In a second terminal, check `http://localhost:8787/health`. Stop the container with `Ctrl+C`. Do not commit `.env.production`.

## 3. Create and push the GitHub repository

Create an empty GitHub repository named `algorithmic-tutor` without a README, `.gitignore`, or license. Replace the two placeholders below with the GitHub account name and repository name:

```powershell
git init
git add .
git status
git commit -m "Initial Algorithmic Tutor deployment"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USER/YOUR_REPOSITORY.git
git push -u origin main
```

Before committing, inspect `git status`. It must not list `.env`, `.env.production`, `data/`, `node_modules/`, models, binaries, or the unrelated job-description PDF.

The `Publish Docker image` GitHub Action runs after the `main` push. In the repository's **Actions** tab, wait for it to succeed. It publishes these tags to GitHub Container Registry (GHCR):

```text
ghcr.io/YOUR_GITHUB_USER/YOUR_REPOSITORY:latest
ghcr.io/YOUR_GITHUB_USER/YOUR_REPOSITORY:main
ghcr.io/YOUR_GITHUB_USER/YOUR_REPOSITORY:sha-<commit>
```

For the simplest server pull, open the resulting package in GitHub **Packages** and change its visibility to public. Keep it private only if you will create a GitHub classic personal-access token with `read:packages` and log in to GHCR on EC2.

## 4. Provision AWS

1. Launch **Ubuntu Server 24.04 LTS**, x86_64. Choose a currently Free Tier-eligible `t3.small` if available to the account; otherwise use `t3.micro`.
2. Create and attach an Elastic IP. Associate it with the instance.
3. Create a security group with inbound rules:
   - HTTP TCP 80 from `0.0.0.0/0` and `::/0`
   - HTTPS TCP 443 from `0.0.0.0/0` and `::/0`
   - SSH TCP 22 only from the administrator's public IP, if SSH is needed
4. Prefer AWS Systems Manager Session Manager over opening SSH. Attach an instance role containing `AmazonSSMManagedInstanceCore`.
5. In the domain provider's DNS dashboard, create an `A` record from the intended domain, for example `tutor.example.com`, to the Elastic IP. Wait for public DNS propagation before starting Caddy.
6. Create an AWS Budget alert for actual cost of USD 1 and another for forecast cost of USD 5.

## 5. Install Docker on EC2

Connect through Session Manager or SSH. For SSH:

```bash
ssh -i path/to/your-key.pem ubuntu@YOUR_ELASTIC_IP
```

Install Docker Engine, Compose, and Git on Ubuntu:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker ubuntu
exit
```

Reconnect so the Docker group membership takes effect.

## 6. Configure and start the service

Clone the GitHub repository, then create the server-only environment file:

```bash
git clone https://github.com/YOUR_GITHUB_USER/YOUR_REPOSITORY.git algorithmic-tutor
cd algorithmic-tutor
cp .env.production.example .env.production
chmod 600 .env.production
nano .env.production
```

Set every placeholder in `.env.production`:

```dotenv
DOMAIN=tutor.example.com
IMAGE_NAME=ghcr.io/YOUR_GITHUB_USER/YOUR_REPOSITORY
IMAGE_TAG=latest
CORS_ORIGIN=https://tutor.example.com
OPENAI_API_KEY=your-real-openai-key
```

Keep `APP_MODE=cloud`, `LLM_PROVIDER=openai`, and `SESSION_DB_PATH=/data/tutor-sessions.db`. The container forces the provider to OpenAI and does not honor browser-provided LLM endpoints.

If the GHCR package is private, authenticate before the pull:

```bash
echo 'YOUR_GHCR_READ_PACKAGES_TOKEN' | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
```

Start the production stack:

```bash
docker compose --env-file .env.production pull app
docker compose --env-file .env.production up -d --no-build
docker compose ps
docker compose logs --tail=100 app
docker compose logs --tail=100 caddy
```

Open `https://tutor.example.com/health` and then `https://tutor.example.com`. Caddy obtains and renews the TLS certificate automatically once the DNS record and ports 80/443 are correct.

## 7. Update a deployment

Every push to `main` publishes a new `latest` image. On the server:

```bash
cd ~/algorithmic-tutor
git pull --ff-only
docker compose --env-file .env.production pull app
docker compose --env-file .env.production up -d --no-build
docker image prune -f
```

Use an immutable `sha-<commit>` tag in `.env.production` for a pinned release. To roll back, change `IMAGE_TAG` to the previous SHA tag, then run the final two Docker commands again.

## Logging, rate limits, and privacy

The API emits JSON logs to standard output. Request logs contain a request ID, HTTP method, path, status, and duration. They deliberately exclude request bodies, pseudocode, pasted statements, cookies, authorization headers, and OpenAI keys.

```bash
docker compose logs -f app
docker compose logs -f caddy
```

The default limits apply per source IP over 15 minutes:

| Action | Default limit |
|---|---:|
| All API requests | 60 |
| New tutoring sessions | 10 |
| Pseudocode reviews | 40 |

Adjust the `RATE_LIMIT_*`, `SESSION_CREATE_LIMIT`, and `SESSION_REVIEW_LIMIT` values in `.env.production`, then run `docker compose --env-file .env.production up -d --no-build`. Docker Compose uses `--env-file` to resolve the image name and tag in `compose.yaml`; its service-level `env_file` only configures the container after it starts.

When OpenAI cloud mode is active, the server also enforces a shared 4 calls/minute and 30 calls/day model budget—intentionally below a 10 RPM / 50 RPD development quota. These provider-wide counters live in the SQLite Docker volume, so restarting a container does not reset them. Prompts are capped at 20,000 characters and outputs at 800 tokens to stay safely within the token allowance. Adjust only after verifying the OpenAI project limits in the dashboard.

SQLite saves only the anonymous tutoring state, keyed by a random session ID. It has a rolling 120-minute inactivity expiry: every review extends the expiry, and expired rows are deleted. The browser saves only that opaque ID in `sessionStorage`, so a refresh can restore the active session but closing the browser session clears the local reference. No user account, login, email, or persistent browser cookie is used.

For this one-instance deployment, SQLite with the Docker named volume is the recommended context store. Alternatives are:

- In-memory Map: simplest, but context disappears on any restart.
- Redis with native key TTL: best for multiple app instances, but adds a service and operational cost.
- DynamoDB TTL: managed and scalable, but expired records are deleted asynchronously and it is excessive for one small instance.

Back up the SQLite volume only if retaining unexpired anonymous sessions is necessary; otherwise do not back it up to minimize data retention.
